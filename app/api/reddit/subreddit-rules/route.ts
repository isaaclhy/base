import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const subreddit = searchParams.get("subreddit");

  if (!subreddit) {
    return NextResponse.json(
      { error: "subreddit parameter is required" },
      { status: 400 }
    );
  }

  // Remove 'r/' prefix if present
  const subredditName = subreddit.replace(/^r\//, "").replace(/^r/, "");

  if (!subredditName) {
    return NextResponse.json(
      { error: "Invalid subreddit name" },
      { status: 400 }
    );
  }

  // Check for session (required)
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized - session required" },
      { status: 401 }
    );
  }

  try {
    // Get valid access token (refreshes if needed)
    const access_token = await refreshAccessToken(session.user.email);

    // Fetch subreddit rules using OAuth endpoint
    const response = await fetch(
      `https://oauth.reddit.com/r/${subredditName}/about/rules.json`,
      {
        headers: {
          "User-Agent": "comment-tool/0.1 by isaaclhy13",
          "Accept": "application/json",
          "Authorization": `Bearer ${access_token}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Reddit API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `Reddit API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching subreddit rules:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch subreddit rules" },
      { status: 500 }
    );
  }
}

