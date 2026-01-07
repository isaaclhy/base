import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface UserUsage {
  _id?: ObjectId;
  userId: string; // User email
  currentCount: number;
  cronUsage?: number; // Separate count for cron job usage
  weekStartDate: Date; // Start of the current week (Monday)
  lastUpdated: Date;
  syncCounter?: number; // Daily sync counter for leads
  lastSyncDate?: Date; // Last date when sync was performed
  totalLeadsGenerated?: number; // Total leads generated all-time
}

export const FREE_POST_LIMIT = 30;
export const PREMIUM_POST_LIMIT = 600; // 600 per week for premium plan
export const PRO_POST_LIMIT = 500; // 2,000 per month ≈ 500 per week

const DEFAULT_MAX_POSTS_PER_WEEK = FREE_POST_LIMIT;

export function getMaxPostsPerWeekForPlan(plan: "free" | "premium" | "pro"): number {
  if (plan === "pro") return PRO_POST_LIMIT;
  if (plan === "premium") return PREMIUM_POST_LIMIT;
  return FREE_POST_LIMIT;
}

// Get the start of the current week (Monday)
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// Get the start of the current day (midnight)
function getDayStart(): Date {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

// Get the start of the next day (midnight tomorrow) - useful for tracking when reset will occur
export function getNextDayStart(): Date {
  const now = new Date();
  const nextDayStart = new Date(now);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  nextDayStart.setHours(0, 0, 0, 0);
  return nextDayStart;
}

// Check if we need to reset sync counter (if lastSyncDate is from a different day)
function needsSyncReset(lastSyncDate?: Date): boolean {
  if (!lastSyncDate) return true;
  const currentDayStart = getDayStart();
  return lastSyncDate.getTime() < currentDayStart.getTime();
}

// Check if we need to reset (if weekStartDate is older than current week start)
function needsReset(weekStartDate: Date): boolean {
  const currentWeekStart = getWeekStart();
  return weekStartDate.getTime() < currentWeekStart.getTime();
}

export async function getUserUsage(userId: string): Promise<UserUsage> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  const currentWeekStart = getWeekStart();
  
  let usage = await usageCollection.findOne({ userId });

  // If no usage record exists, create one
  if (!usage) {
    const newUsage: UserUsage = {
      userId,
      currentCount: 0,
      cronUsage: 0,
      weekStartDate: currentWeekStart,
      lastUpdated: new Date(),
    };
    const result = await usageCollection.insertOne(newUsage);
    return {
      ...newUsage,
      _id: result.insertedId,
    };
  }

  // Ensure cronUsage exists (for existing records that might not have it)
  if (usage.cronUsage === undefined) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          cronUsage: 0,
          lastUpdated: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (!usage) {
      throw new Error("Failed to initialize cronUsage");
    }
  }

  // Ensure syncCounter and lastSyncDate exist (for existing records that might not have them)
  if (usage.syncCounter === undefined || usage.lastSyncDate === undefined) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          syncCounter: 0,
          lastSyncDate: new Date(0), // Set to epoch to trigger reset on next sync
          lastUpdated: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (!usage) {
      throw new Error("Failed to initialize syncCounter");
    }
  }

  // Ensure totalLeadsGenerated exists (for existing records that might not have it)
  if (usage.totalLeadsGenerated === undefined) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          totalLeadsGenerated: 0,
          lastUpdated: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (!usage) {
      throw new Error("Failed to initialize totalLeadsGenerated");
    }
  }

  // Reset sync counter if it's a new day
  if (needsSyncReset(usage.lastSyncDate)) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          syncCounter: 0,
          lastSyncDate: getDayStart(),
          lastUpdated: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (!usage) {
      throw new Error("Failed to reset sync counter");
    }
  }

  // Check if we need to reset (new week)
  if (needsReset(usage.weekStartDate)) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentCount: 0,
          cronUsage: 0, // Reset cron usage as well
          weekStartDate: currentWeekStart,
          lastUpdated: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    
    if (!usage) {
      throw new Error("Failed to reset usage");
    }
    
    return usage as UserUsage;
  }

  return usage;
}

export async function incrementUsage(userId: string, count: number = 1, maxPerWeek: number = DEFAULT_MAX_POSTS_PER_WEEK): Promise<{ usage: UserUsage; actualIncrement: number; limitReached: boolean }> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  // First, get current usage (this will handle reset if needed)
  const currentUsage = await getUserUsage(userId);

  // Check if user has reached the limit
  if (currentUsage.currentCount >= maxPerWeek) {
    // Already at limit, don't increment but return current usage
    return {
      usage: currentUsage,
      actualIncrement: 0,
      limitReached: true,
    };
  }

  // Calculate how much we can actually increment (allow partial fulfillment)
  const remaining = maxPerWeek - currentUsage.currentCount;
  const actualIncrement = Math.min(count, remaining);
  const limitReached = currentUsage.currentCount + actualIncrement >= maxPerWeek;

  // Increment usage (only up to the limit)
  const updatedUsage = await usageCollection.findOneAndUpdate(
    { userId },
    {
      $inc: { currentCount: actualIncrement },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!updatedUsage) {
    throw new Error("Failed to increment usage");
  }

  return {
    usage: updatedUsage as UserUsage,
    actualIncrement,
    limitReached,
  };
}

export async function canGeneratePosts(userId: string, count: number = 1, maxPerWeek: number = DEFAULT_MAX_POSTS_PER_WEEK): Promise<boolean> {
  const usage = await getUserUsage(userId);
  return usage.currentCount + count <= maxPerWeek;
}

/**
 * Increment cron usage separately from regular usage
 * This does not affect the regular currentCount or have any limits
 */
export async function incrementCronUsage(userId: string, count: number = 1): Promise<UserUsage> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  // First, get current usage (this will handle reset if needed and initialize cronUsage if missing)
  const currentUsage = await getUserUsage(userId);

  // Increment cron usage
  const updatedUsage = await usageCollection.findOneAndUpdate(
    { userId },
    {
      $inc: { cronUsage: count },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!updatedUsage) {
    throw new Error("Failed to increment cron usage");
  }

  return updatedUsage as UserUsage;
}

export function getMaxSyncsPerDayForPlan(plan: "free" | "premium" | "pro"): number {
  if (plan === "pro") return 10;
  if (plan === "premium") return 5;
  return 2;
}

/**
 * Check if user can sync leads (max 2 per day)
 */
export async function canSyncLeads(userId: string, maxSyncsPerDay: number): Promise<boolean> {
  const usage = await getUserUsage(userId);
  return (usage.syncCounter ?? 0) < maxSyncsPerDay;
}

/**
 * Increment sync counter for leads (max 2 per day)
 * Returns the updated usage and whether the limit was reached
 */
export async function incrementSyncCounter(
  userId: string,
  maxSyncsPerDay: number
): Promise<{ usage: UserUsage; limitReached: boolean }> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  // First, get current usage (this will handle reset if needed)
  const currentUsage = await getUserUsage(userId);

  // Check if user has reached the daily sync limit
  const currentSyncCount = currentUsage.syncCounter ?? 0;
  if (currentSyncCount >= maxSyncsPerDay) {
    return {
      usage: currentUsage,
      limitReached: true,
    };
  }

  const currentDayStart = getDayStart();

  // Increment sync counter
  const updatedUsage = await usageCollection.findOneAndUpdate(
    { userId },
    {
      $inc: { syncCounter: 1 },
      $set: { 
        lastSyncDate: currentDayStart,
        lastUpdated: new Date() 
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedUsage) {
    throw new Error("Failed to increment sync counter");
  }

  return {
    usage: updatedUsage as UserUsage,
    limitReached: (updatedUsage.syncCounter ?? 0) >= maxSyncsPerDay,
  };
}

/**
 * Increment total leads generated count
 * This is an all-time counter that never resets
 */
export async function incrementTotalLeadsGenerated(userId: string, count: number = 1): Promise<UserUsage> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  // First, get current usage (this will handle initialization if needed)
  await getUserUsage(userId);

  // Increment total leads generated
  const updatedUsage = await usageCollection.findOneAndUpdate(
    { userId },
    {
      $inc: { totalLeadsGenerated: count },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!updatedUsage) {
    throw new Error("Failed to increment total leads generated");
  }

  return updatedUsage as UserUsage;
}

