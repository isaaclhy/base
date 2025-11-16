import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";

interface RedditPostRequest {
  postIds: string | string[]; // Accept single post ID or array of post IDs
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const postIdsString = postIdArray.join(",");

  // Check for session (required)
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json(
      { error: "Missing session" },
      { status: 400 }
    );
  }

  // Get valid access token (refreshes if needed)
  const access_token = await refreshAccessToken(session.user.email);

  console.log("Access Token:", access_token);
  // Always use OAuth endpoint with token
  const response = await fetch(
    `https://oauth.reddit.com/api/info.json?id=${postIdsString}`,
    {
      headers: {
        "User-Agent": "comment-tool/0.1 by isaaclhy13",
        "Accept": "application/json",
        "Authorization": `Bearer ${access_token}`,
      },
    }
  );

  const data = await response.json();
  console.log("Reddit API Response:", data);
  return NextResponse.json(data);
}

