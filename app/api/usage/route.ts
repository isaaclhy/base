import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserUsage, MAX_POSTS_PER_WEEK } from "@/lib/db/usage";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const usage = await getUserUsage(session.user.email);

    return NextResponse.json({
      currentCount: usage.currentCount,
      maxCount: MAX_POSTS_PER_WEEK,
      weekStartDate: usage.weekStartDate,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}

