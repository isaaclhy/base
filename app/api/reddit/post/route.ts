import { NextRequest, NextResponse } from "next/server";

interface RedditPostRequest {
  postIds: string | string[]; // Accept single post ID or array of post IDs
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { postIds }: RedditPostRequest = await request.json();

    if (!postIds) {
      return NextResponse.json(
        { error: "postIds is required" },
        { status: 400 }
      );
    }

    // Normalize to array
    const postIdArray = Array.isArray(postIds) ? postIds : [postIds];
    
    if (postIdArray.length === 0) {
      return NextResponse.json(
        { error: "At least one postId is required" },
        { status: 400 }
      );
    }

    // Reddit API accepts comma-separated post IDs
    // Format: t3_postId1,t3_postId2,t3_postId3...
    const postIdsString = postIdArray.join(',');

    // For now, using public API since we don't have auth setup
    // If you want to use OAuth, uncomment the auth section below and set up auth
    /*
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
    }
    if (!session.user.id) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
    }
    let access_token = await refreshAccessToken(session.user.id);
    */

    // Using public Reddit API for now
    // If you have OAuth setup, replace this with the OAuth endpoint
    const response = await fetch(
      `https://www.reddit.com/api/info.json?id=${postIdsString}`,
      {
        headers: {
          "User-Agent": "reddit-comment-tool/0.1 by isaaclhy13",
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch posts: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Error fetching Reddit posts:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to fetch Reddit posts" },
      { status: 500 }
    );
  }
}

