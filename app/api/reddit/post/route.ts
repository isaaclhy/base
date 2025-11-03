import { NextRequest, NextResponse } from "next/server";

interface RedditPostRequest {
  postId: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { postId }: RedditPostRequest = await request.json();

    if (!postId) {
      return NextResponse.json(
        { error: "postId is required" },
        { status: 400 }
      );
    }

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
      `https://www.reddit.com/api/info.json?id=${postId}`,
      {
        headers: {
          "User-Agent": "reddit-comment-tool/0.1 by isaaclhy13",
          Accept: "application/json",
        },
      }
    );

    console.log("get posts: ", response);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    const data = await response.json();
    console.log("DATTTTTTAAAA");
    console.log(data);

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Error fetching Reddit post:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to fetch Reddit post" },
      { status: 500 }
    );
  }
}

