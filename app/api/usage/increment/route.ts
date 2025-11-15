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
    const plan = dbUser?.plan ?? "free";
    const usage = await incrementUsage(
      session.user.email,
      count,
      getMaxPostsPerWeekForPlan(plan)
    );

    return NextResponse.json({
      success: true,
      currentCount: usage.currentCount,
      plan,
    });
  } catch (error) {
    console.error("Error incrementing usage:", error);
    
    if (error instanceof Error && error.message.includes("limit")) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to increment usage" },
      { status: 500 }
    );
  }
}

