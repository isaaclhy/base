import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserUsage, getMaxPostsPerWeekForPlan, getNextDayStart, getMaxSyncsPerDayForPlan } from "@/lib/db/usage";
import { getUserByEmail } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const [usage, dbUser] = await Promise.all([
      getUserUsage(session.user.email),
      getUserByEmail(session.user.email),
    ]);

    const plan = dbUser?.plan ?? "free";
    const maxCount = getMaxPostsPerWeekForPlan(plan);
    const maxSyncsPerDay = getMaxSyncsPerDayForPlan(plan);

    return NextResponse.json({
      currentCount: usage.currentCount,
      maxCount,
      weekStartDate: usage.weekStartDate,
      plan,
      syncCounter: usage.syncCounter ?? 0,
      maxSyncsPerDay,
      nextSyncReset: getNextDayStart().toISOString(), // When the sync counter will reset next
      totalLeadsGenerated: usage.totalLeadsGenerated ?? 0,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}

