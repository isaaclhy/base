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
export const PREMIUM_POST_LIMIT = 1000;

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

export async function incrementUsage(userId: string, count: number = 1, maxPerWeek: number = DEFAULT_MAX_POSTS_PER_WEEK): Promise<UserUsage> {
  const db = await getDatabase();
  const usageCollection = db.collection<UserUsage>("usage");

  // First, get current usage (this will handle reset if needed)
  const currentUsage = await getUserUsage(userId);

  // Check if user has reached the limit
  if (currentUsage.currentCount >= maxPerWeek) {
    throw new Error(`Weekly limit reached. You have generated ${maxPerWeek} posts this week.`);
  }

  // Check if adding count would exceed limit
  if (currentUsage.currentCount + count > maxPerWeek) {
    throw new Error(
      `This action would exceed your weekly limit. You have ${Math.max(maxPerWeek - currentUsage.currentCount, 0)} posts remaining.`
    );
  }

  // Increment usage
  const updatedUsage = await usageCollection.findOneAndUpdate(
    { userId },
    {
      $inc: { currentCount: count },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!updatedUsage) {
    throw new Error("Failed to increment usage");
  }

  return updatedUsage as UserUsage;
}

export async function canGeneratePosts(userId: string, count: number = 1, maxPerWeek: number = DEFAULT_MAX_POSTS_PER_WEEK): Promise<boolean> {
  const usage = await getUserUsage(userId);
  return usage.currentCount + count <= maxPerWeek;
}

