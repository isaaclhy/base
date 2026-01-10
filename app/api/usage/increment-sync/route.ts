import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { incrementSyncCounter, getMaxSyncsPerDayForPlan } from "@/lib/db/usage";
import { getUserByEmail } from "@/lib/db/users";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const dbUser = await getUserByEmail(session.user.email);
    const plan = (dbUser?.plan ?? "free") as "free" | "starter" | "premium" | "pro";
    const maxSyncsPerDay = getMaxSyncsPerDayForPlan(plan);

    const result = await incrementSyncCounter(session.user.email, maxSyncsPerDay);

    // Return response with sync info and limit status
    return NextResponse.json({
      success: true,
      syncCounter: result.usage.syncCounter ?? 0,
      limitReached: result.limitReached,
      remaining: Math.max(0, maxSyncsPerDay - (result.usage.syncCounter ?? 0)),
      maxSyncsPerDay,
    });
  } catch (error) {
    console.error("Error incrementing sync counter:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to increment sync counter" },
      { status: 500 }
    );
  }
}

