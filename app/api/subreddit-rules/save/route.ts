import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertSubredditRule } from "@/lib/db/subreddit-rules";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { subredditName, allowPromoting } = body;

    if (!subredditName || typeof subredditName !== 'string' || subredditName.trim().length === 0) {
      return NextResponse.json({ error: "Subreddit name is required" }, { status: 400 });
    }

    if (typeof allowPromoting !== 'boolean') {
      return NextResponse.json({ error: "allowPromoting must be a boolean" }, { status: 400 });
    }

    try {
      const result = await upsertSubredditRule(subredditName.trim(), allowPromoting);
      
      if (!result) {
        return NextResponse.json({ error: "Failed to save subreddit rule" }, { status: 500 });
      }

      return NextResponse.json({ success: true, rule: result });
    } catch (error) {
      console.error("Error saving subreddit rule:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to save subreddit rule" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in save subreddit-rules API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unknown error occurred" },
      { status: 500 }
    );
  }
}

