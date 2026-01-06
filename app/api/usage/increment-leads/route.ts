import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { incrementTotalLeadsGenerated } from "@/lib/db/usage";

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

    if (typeof count !== "number" || count < 0) {
      return NextResponse.json(
        { error: "Invalid count" },
        { status: 400 }
      );
    }

    const usage = await incrementTotalLeadsGenerated(session.user.email, count);

    return NextResponse.json({
      success: true,
      totalLeadsGenerated: usage.totalLeadsGenerated ?? 0,
    });
  } catch (error) {
    console.error("Error incrementing leads count:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to increment leads count" },
      { status: 500 }
    );
  }
}

