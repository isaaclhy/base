import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { incrementUsage, getMaxPostsPerWeekForPlan } from "@/lib/db/usage";
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

    const body = await request.json();
    const count = body.count || 1;

    const dbUser = await getUserByEmail(session.user.email);
    const plan = (dbUser?.plan ?? "free") as "free" | "basic" | "premium";
    const maxPerWeek = getMaxPostsPerWeekForPlan(plan);
    const result = await incrementUsage(
      session.user.email,
      count,
      maxPerWeek
    );

    // Return response with usage info and limit status
    return NextResponse.json({
      success: true,
      currentCount: result.usage.currentCount,
      actualIncrement: result.actualIncrement,
      requestedCount: count,
      limitReached: result.limitReached,
      remaining: Math.max(0, maxPerWeek - result.usage.currentCount),
      plan,
    });
  } catch (error) {
    console.error("Error incrementing usage:", error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to increment usage" },
      { status: 500 }
    );
  }
}

