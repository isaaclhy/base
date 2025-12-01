import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export interface UserUsage {
  _id?: ObjectId;
  userId: string; // User email
  currentCount: number;
  weekStartDate: Date; // Start of the current week (Monday)
  lastUpdated: Date;
}

export const FREE_POST_LIMIT = 200;
export const PREMIUM_POST_LIMIT = 2500; // 10,000 per month ≈ 2,500 per week

const DEFAULT_MAX_POSTS_PER_WEEK = FREE_POST_LIMIT;

export function getMaxPostsPerWeekForPlan(plan: "free" | "premium"): number {
  return plan === "premium" ? PREMIUM_POST_LIMIT : FREE_POST_LIMIT;
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
      weekStartDate: currentWeekStart,
      lastUpdated: new Date(),
    };
    const result = await usageCollection.insertOne(newUsage);
    return {
      ...newUsage,
      _id: result.insertedId,
    };
  }

  // Check if we need to reset (new week)
  if (needsReset(usage.weekStartDate)) {
    usage = await usageCollection.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentCount: 0,
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

