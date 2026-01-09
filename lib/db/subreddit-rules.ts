import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface SubredditRule {
  _id?: ObjectId;
  subredditName: string; // Subreddit name (e.g., "programming", "startups")
  allowPromoting: boolean; // Whether promoting is allowed in this subreddit
}

const COLLECTION_NAME = "subredditRules";

/**
 * Get subreddit rule by subreddit name
 */
export async function getSubredditRule(subredditName: string): Promise<SubredditRule | null> {
  try {
    const db = await getDatabase();
    const collection = db.collection<SubredditRule>(COLLECTION_NAME);
    
    // Normalize subreddit name (remove r/ prefix if present, convert to lowercase)
    const normalizedName = subredditName.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
    
    const rule = await collection.findOne({ subredditName: normalizedName });
    return rule;
  } catch (error) {
    console.error("Error getting subreddit rule:", error);
    return null;
  }
}

/**
 * Create or update subreddit rule
 */
export async function upsertSubredditRule(
  subredditName: string,
  allowPromoting: boolean
): Promise<SubredditRule | null> {
  try {
    const db = await getDatabase();
    const collection = db.collection<SubredditRule>(COLLECTION_NAME);
    
    // Normalize subreddit name (remove r/ prefix if present, convert to lowercase)
    const normalizedName = subredditName.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
    
    const rule: SubredditRule = {
      subredditName: normalizedName,
      allowPromoting,
    };
    
    const result = await collection.findOneAndUpdate(
      { subredditName: normalizedName },
      { $set: rule },
      { upsert: true, returnDocument: "after" }
    );
    
    return result;
  } catch (error) {
    console.error("Error upserting subreddit rule:", error);
    return null;
  }
}

/**
 * Get all subreddit rules
 */
export async function getAllSubredditRules(): Promise<SubredditRule[]> {
  try {
    const db = await getDatabase();
    const collection = db.collection<SubredditRule>(COLLECTION_NAME);
    
    const rules = await collection.find({}).toArray();
    return rules;
  } catch (error) {
    console.error("Error getting all subreddit rules:", error);
    return [];
  }
}

/**
 * Delete subreddit rule by subreddit name
 */
export async function deleteSubredditRule(subredditName: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const collection = db.collection<SubredditRule>(COLLECTION_NAME);
    
    // Normalize subreddit name (remove r/ prefix if present, convert to lowercase)
    const normalizedName = subredditName.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
    
    const result = await collection.deleteOne({ subredditName: normalizedName });
    return result.deletedCount > 0;
  } catch (error) {
    console.error("Error deleting subreddit rule:", error);
    return false;
  }
}

