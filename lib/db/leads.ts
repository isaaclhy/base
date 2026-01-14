import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { RedditPost } from "@/lib/types";

export type FilterSignal = "YES" | "MAYBE" | "NO";

export interface Lead {
  _id?: ObjectId;
  userId: string; // User email
  keyword: string; // The keyword this lead was found for
  query?: string; // Original query/search term (for backward compatibility)
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  filterSignal?: FilterSignal | null; // From OpenAI filtering (YES/MAYBE/NO)
  syncedAt: Date; // When this lead was synced
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadData {
  userId: string;
  keyword: string;
  query?: string;
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  filterSignal?: FilterSignal | null;
  syncedAt?: Date; // Optional, defaults to now
}

/**
 * Normalize URL for deduplication (remove trailing slashes, query params, etc.)
 */
function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Remove trailing slash, normalize protocol
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Create a single lead (with deduplication)
 */
export async function createLead(leadData: CreateLeadData): Promise<Lead> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const now = new Date();
  const normalizedLink = normalizeUrl(leadData.link);

  const newLead: Lead = {
    userId: leadData.userId,
    keyword: leadData.keyword,
    query: leadData.query || leadData.keyword,
    title: leadData.title || null,
    link: leadData.link || null,
    snippet: leadData.snippet || null,
    selftext: leadData.selftext || null,
    postData: leadData.postData || null,
    filterSignal: leadData.filterSignal || null,
    syncedAt: leadData.syncedAt || now,
    createdAt: now,
    updatedAt: now,
  };

  // Use upsert to prevent duplicates (based on userId + normalized link)
  if (normalizedLink) {
    const result = await leadsCollection.updateOne(
      {
        userId: leadData.userId,
        link: { $regex: new RegExp(normalizedLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      },
      {
        $set: {
          ...newLead,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        }
      },
      { upsert: true }
    );

    // If upsert created a new document, return it
    if (result.upsertedId) {
      return {
        ...newLead,
        _id: result.upsertedId,
      };
    }

    // Otherwise, fetch the existing document
    const existing = await leadsCollection.findOne({
      userId: leadData.userId,
      link: { $regex: new RegExp(normalizedLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    });

    if (!existing) {
      throw new Error("Failed to create or find lead");
    }

    return existing;
  } else {
    // If no link, just insert (less common case)
    const result = await leadsCollection.insertOne(newLead);
    if (!result.insertedId) {
      throw new Error("Failed to create lead");
    }
    return {
      ...newLead,
      _id: result.insertedId,
    };
  }
}

/**
 * Batch create/upsert leads (for performance)
 */
export async function createLeads(leadsData: CreateLeadData[]): Promise<{ inserted: number; updated: number }> {
  if (leadsData.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const now = new Date();
  let inserted = 0;
  let updated = 0;

  // Process in batches to avoid memory issues
  const batchSize = 50;
  for (let i = 0; i < leadsData.length; i += batchSize) {
    const batch = leadsData.slice(i, i + batchSize);
    const operations: any[] = [];

    for (const leadData of batch) {
      try {
        const normalizedLink = normalizeUrl(leadData.link);
        const newLead: Lead = {
          userId: leadData.userId,
          keyword: leadData.keyword,
          query: leadData.query || leadData.keyword,
          title: leadData.title || null,
          link: leadData.link || null,
          snippet: leadData.snippet || null,
          selftext: leadData.selftext || null,
          postData: leadData.postData || null,
          filterSignal: leadData.filterSignal || null,
          syncedAt: leadData.syncedAt || now,
          createdAt: now,
          updatedAt: now,
        };

        if (normalizedLink && leadData.link) {
          // Use exact match on the original link first (most common case)
          // This is faster and more reliable than regex
          const { createdAt, ...leadWithoutCreatedAt } = newLead;
          operations.push({
            updateOne: {
              filter: {
                userId: leadData.userId,
                link: leadData.link, // Exact match on original link
              },
              update: {
                $set: {
                  ...leadWithoutCreatedAt,
                  updatedAt: now,
                },
                $setOnInsert: {
                  createdAt: now,
                }
              },
              upsert: true,
            },
          });
        } else {
          // If no link, check by userId + keyword + title for deduplication
          const { createdAt, ...leadWithoutCreatedAt } = newLead;
          operations.push({
            updateOne: {
              filter: {
                userId: leadData.userId,
                keyword: leadData.keyword,
                title: leadData.title || null,
              },
              update: {
                $set: {
                  ...leadWithoutCreatedAt,
                  updatedAt: now,
                },
                $setOnInsert: {
                  createdAt: now,
                }
              },
              upsert: true,
            },
          });
        }
      } catch (leadError) {
        console.error(`[Leads DB] Error processing lead data:`, {
          error: leadError,
          leadData: {
            userId: leadData.userId,
            keyword: leadData.keyword,
            link: leadData.link?.substring(0, 100), // Truncate for logging
            title: leadData.title?.substring(0, 100),
          }
        });
        // Continue with other leads instead of failing the entire batch
      }
    }

    if (operations.length > 0) {
      try {
        const result = await leadsCollection.bulkWrite(operations, { ordered: false });
        inserted += result.upsertedCount || 0;
        updated += result.modifiedCount || 0;
      } catch (bulkError: any) {
        console.error(`[Leads DB] Error in bulkWrite operation:`, {
          error: bulkError,
          message: bulkError?.message,
          code: bulkError?.code,
          codeName: bulkError?.codeName,
          writeErrors: bulkError?.writeErrors,
          operationCount: operations.length,
        });
        // Re-throw to be caught by the API route
        throw new Error(`Failed to save leads to database: ${bulkError?.message || String(bulkError)}`);
      }
    }
  }

  return { inserted, updated };
}

/**
 * Get all leads for a user, optionally filtered by keyword
 */
export async function getLeadsByUserId(
  userId: string,
  options?: {
    keyword?: string;
    filterSignal?: FilterSignal;
    limit?: number;
    skip?: number;
  }
): Promise<Lead[]> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const query: any = { userId };

  if (options?.keyword) {
    query.keyword = options.keyword;
  }

  if (options?.filterSignal) {
    query.filterSignal = options.filterSignal;
  }

  let cursor = leadsCollection.find(query).sort({ syncedAt: -1 });

  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }

  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  return await cursor.toArray();
}

/**
 * Get leads grouped by keyword (for backward compatibility with leadsLinks format)
 */
export async function getLeadsByUserIdGrouped(
  userId: string,
  options?: {
    filterSignal?: FilterSignal;
  }
): Promise<Record<string, Lead[]>> {
  const leads = await getLeadsByUserId(userId, options);
  
  const grouped: Record<string, Lead[]> = {};
  for (const lead of leads) {
    if (!grouped[lead.keyword]) {
      grouped[lead.keyword] = [];
    }
    grouped[lead.keyword].push(lead);
  }

  return grouped;
}

/**
 * Get leads for a specific keyword
 */
export async function getLeadsByKeyword(
  userId: string,
  keyword: string
): Promise<Lead[]> {
  return getLeadsByUserId(userId, { keyword });
}

/**
 * Update filter signal for a lead
 */
export async function updateLeadFilterSignal(
  userId: string,
  leadId: string,
  filterSignal: FilterSignal | null
): Promise<Lead | null> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const result = await leadsCollection.findOneAndUpdate(
    {
      _id: new ObjectId(leadId),
      userId: userId, // Ensure user owns this lead
    },
    {
      $set: {
        filterSignal: filterSignal,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  return result || null;
}

/**
 * Batch update filter signals
 */
export async function updateLeadsFilterSignals(
  userId: string,
  updates: Array<{ leadId: string; filterSignal: FilterSignal | null }>
): Promise<{ updated: number }> {
  if (updates.length === 0) {
    return { updated: 0 };
  }

  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const now = new Date();
  const operations: any[] = [];

  for (const update of updates) {
    operations.push({
      updateOne: {
        filter: {
          _id: new ObjectId(update.leadId),
          userId: userId,
        },
        update: {
          $set: {
            filterSignal: update.filterSignal,
            updatedAt: now,
          },
        },
      },
    });
  }

  const result = await leadsCollection.bulkWrite(operations, { ordered: false });
  return { updated: result.modifiedCount || 0 };
}

/**
 * Update lead data (e.g., after fetching post content)
 */
export async function updateLead(
  userId: string,
  leadId: string,
  updates: {
    title?: string | null;
    link?: string | null;
    snippet?: string | null;
    selftext?: string | null;
    postData?: RedditPost | null;
    filterSignal?: FilterSignal | null;
  }
): Promise<Lead | null> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const result = await leadsCollection.findOneAndUpdate(
    {
      _id: new ObjectId(leadId),
      userId: userId,
    },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  return result || null;
}

/**
 * Delete all leads for a user, optionally filtered by keyword
 */
export async function deleteLeadsByUserId(
  userId: string,
  keyword?: string
): Promise<{ deleted: number }> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const query: any = { userId };
  if (keyword) {
    query.keyword = keyword;
  }

  const result = await leadsCollection.deleteMany(query);
  return { deleted: result.deletedCount || 0 };
}

/**
 * Get the most recent sync time for a user
 */
export async function getLatestSyncTime(userId: string): Promise<Date | null> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const latest = await leadsCollection
    .findOne(
      { userId },
      { sort: { syncedAt: -1 }, projection: { syncedAt: 1 } }
    );

  return latest?.syncedAt || null;
}

/**
 * Get lead count for a user, optionally grouped by keyword
 */
export async function getLeadCountByUserId(
  userId: string,
  options?: {
    keyword?: string;
    filterSignal?: FilterSignal;
  }
): Promise<number> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const query: any = { userId };

  if (options?.keyword) {
    query.keyword = options.keyword;
  }

  if (options?.filterSignal) {
    query.filterSignal = options.filterSignal;
  }

  return await leadsCollection.countDocuments(query);
}

/**
 * Get lead counts grouped by keyword
 */
export async function getLeadCountsByKeyword(userId: string): Promise<Record<string, number>> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  const pipeline = [
    { $match: { userId } },
    { $group: { _id: "$keyword", count: { $sum: 1 } } },
  ];

  const results = await leadsCollection.aggregate(pipeline).toArray();
  
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result._id] = result.count;
  }

  return counts;
}

/**
 * Initialize database indexes (call this once on app startup or migration)
 */
export async function initializeLeadsIndexes(): Promise<void> {
  const db = await getDatabase();
  const leadsCollection = db.collection<Lead>("leads");

  try {
    // Unique compound index for deduplication (userId + normalized link)
    // Note: MongoDB doesn't support regex in unique indexes, so we'll handle deduplication in application logic
    await leadsCollection.createIndex(
      { userId: 1, link: 1 },
      { name: "userId_link_idx" }
    );

    // Index for filtering by keyword
    await leadsCollection.createIndex(
      { userId: 1, keyword: 1 },
      { name: "userId_keyword_idx" }
    );

    // Index for sorting by sync time
    await leadsCollection.createIndex(
      { userId: 1, syncedAt: -1 },
      { name: "userId_syncedAt_idx" }
    );

    // Index for filtering by filter signal
    await leadsCollection.createIndex(
      { userId: 1, filterSignal: 1 },
      { name: "userId_filterSignal_idx" }
    );

    console.log("[Leads DB] Indexes initialized successfully");
  } catch (error) {
    console.error("[Leads DB] Error initializing indexes:", error);
    // Don't throw - indexes might already exist
  }
}
