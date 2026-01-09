import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSubredditRule } from "@/lib/db/subreddit-rules";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const subreddit = searchParams.get("subreddit");

    if (!subreddit || typeof subreddit !== 'string' || subreddit.trim().length === 0) {
      return NextResponse.json({ error: "Subreddit name is required" }, { status: 400 });
    }

    try {
      const rule = await getSubredditRule(subreddit.trim());
      
      if (!rule) {
        return NextResponse.json({ rule: null });
      }

      return NextResponse.json({ rule });
    } catch (error) {
      console.error("Error getting subreddit rule:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to get subreddit rule" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in get subreddit-rules API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unknown error occurred" },
      { status: 500 }
    );
  }
}

