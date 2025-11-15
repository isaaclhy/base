import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserUsage, getMaxPostsPerWeekForPlan } from "@/lib/db/usage";
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

    return NextResponse.json({
      currentCount: usage.currentCount,
      maxCount,
      weekStartDate: usage.weekStartDate,
      plan,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}

