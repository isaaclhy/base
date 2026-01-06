import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { incrementSyncCounter, MAX_SYNCS_PER_DAY } from "@/lib/db/usage";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await incrementSyncCounter(session.user.email);

    // Return response with sync info and limit status
    return NextResponse.json({
      success: true,
      syncCounter: result.usage.syncCounter ?? 0,
      limitReached: result.limitReached,
      remaining: Math.max(0, MAX_SYNCS_PER_DAY - (result.usage.syncCounter ?? 0)),
      maxSyncsPerDay: MAX_SYNCS_PER_DAY,
    });
  } catch (error) {
    console.error("Error incrementing sync counter:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to increment sync counter" },
      { status: 500 }
    );
  }
}

