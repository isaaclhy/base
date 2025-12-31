import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidAccessToken } from "@/lib/reddit/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
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

    // Get query parameters for pagination and filtering
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get("limit") || "25";
    const after = searchParams.get("after") || "";
    const before = searchParams.get("before") || "";
    const unread = searchParams.get("unread") === "true"; // Option to fetch only unread

    const fetchInbox = async (token: string) => {
      const params = new URLSearchParams();
      params.append("limit", limit);
      if (after) params.append("after", after);
      if (before) params.append("before", before);
      
      // Use /message/unread endpoint if unread filter is requested, otherwise use /message/inbox
      const endpoint = unread ? "message/unread.json" : "message/inbox.json";

      return fetch(`https://oauth.reddit.com/${endpoint}?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
          "Accept": "application/json",
        },
      });
    };

    let response = await fetchInbox(accessToken);

    // If 401, try refreshing token once
    if (response.status === 401) {
      try {
        const { refreshAccessToken } = await import("@/lib/reddit/auth");
        accessToken = await refreshAccessToken(session.user.email);
        response = await fetchInbox(accessToken);
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
    console.error("Error fetching inbox:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch inbox" },
      { status: 500 }
    );
  }
}

