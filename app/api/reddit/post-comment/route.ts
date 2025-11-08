import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidAccessToken, refreshAccessToken } from "@/lib/reddit/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { thing_id, text } = await request.json();

    if (!thing_id || !text) {
      return NextResponse.json(
        { error: "Missing required fields: thing_id, text" },
        { status: 400 }
      );
    }

    // Get valid access token (will refresh if needed)
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(session.user.email);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to get access token. Please connect your Reddit account." },
        { status: 401 }
      );
    }

    const postComment = async (token: string) => {
      return fetch("https://oauth.reddit.com/api/comment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          thing_id,
          text,
        }).toString(),
      });
    };

    let response = await postComment(accessToken);

    // If 401, try refreshing token once
    if (response.status === 401) {
      try {
        accessToken = await refreshAccessToken(session.user.email);
        response = await postComment(accessToken);
      } catch (refreshError) {
        return NextResponse.json(
          { error: "Failed to refresh token. Please reconnect your Reddit account." },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(
        { error: errorData.error || `Reddit API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error("Error posting comment:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post comment" },
      { status: 500 }
    );
  }
}

