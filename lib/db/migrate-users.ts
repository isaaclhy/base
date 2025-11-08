/**
 * Migration script to add "plan" field to existing users
 * Run this once to update all existing users to have "free" plan
 * 
 * Usage: You can call this from an API route or run it manually
 */

import { getDatabase } from "@/lib/mongodb";

export async function migrateUsersToFreePlan() {
  const db = await getDatabase();
  const usersCollection = db.collection("usersv2");

  try {
    // Update all users that don't have a plan field
    const result = await usersCollection.updateMany(
      { plan: { $exists: false } },
      { $set: { plan: "free" } }
    );

    console.log(`Migrated ${result.modifiedCount} users to free plan`);
    return {
      success: true,
      migratedCount: result.modifiedCount,
    };
  } catch (error) {
    console.error("Error migrating users:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

