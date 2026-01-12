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
    
    // Reddit API can return 200 OK but with errors in the response body
    // Response structure: { json: { errors: [...], data: {...} } }
    if (data.json && data.json.errors && Array.isArray(data.json.errors) && data.json.errors.length > 0) {
      const errors = data.json.errors.map((err: any[]) => err.join(': ')).join('; ');
      console.error("Reddit API returned errors in response body:", errors);
      return NextResponse.json(
        { error: `Reddit API error: ${errors}`, redditErrors: data.json.errors },
        { status: 400 }
      );
    }

    // Check for jQuery format response (success: true means comment was posted)
    // Reddit sometimes returns { jquery: [...], success: true } instead of { json: { data: {...} } }
    // Check for both boolean true and string "true" to be safe
    if (data.success === true || data.success === "true" || (data.jquery && (data.success === true || data.success === "true"))) {
      // Reddit returned success: true, which means the comment was posted successfully
      // Even though we can't extract the comment ID from jQuery format, we treat it as success
      return NextResponse.json({ 
        success: true, 
        data: data,
        commentId: null, // Can't extract comment ID from jQuery format
        message: "Comment posted successfully (Reddit returned success: true)"
      });
    }

    // Check if data.json.data exists (successful comment creation)
    if (!data.json || !data.json.data) {
      // Only log error if success is not true (to avoid false positives)
      if (data.success !== true && data.success !== "true") {
        console.error("Reddit API response missing data:", data);
        return NextResponse.json(
          { error: "Reddit API response missing data. Comment may not have been posted." },
          { status: 500 }
        );
      }
      // If success is true but no json.data, still return success
      return NextResponse.json({ 
        success: true, 
        data: data,
        commentId: null,
        message: "Comment posted successfully (Reddit returned success: true)"
      });
    }

    // Extract the created comment ID from the response
    const things = data.json.data?.things || [];
    const commentId = things[0]?.data?.name || null;

    return NextResponse.json({ 
      success: true, 
      data: data.json.data,
      commentId: commentId 
    });
  } catch (err: unknown) {
    console.error("Error posting comment:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post comment" },
      { status: 500 }
    );
  }
}

