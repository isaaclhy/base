import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidAccessToken } from "@/lib/reddit/auth";

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

    // In production, require OAuth authentication to avoid IP blocking
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    
    // Try to use OAuth authentication if user is logged in and has Reddit connected
    let accessToken: string | null = null;
    try {
      const session = await auth();
      if (session?.user?.email) {
        try {
          accessToken = await getValidAccessToken(session.user.email);
        } catch (tokenError) {
          // User doesn't have Reddit connected or token refresh failed
          if (isProduction) {
            // In production, require OAuth to avoid IP blocking
            console.error("Reddit OAuth required in production but not available:", tokenError);
            return NextResponse.json(
              { 
                error: "Reddit authentication required",
                details: "Please connect your Reddit account to fetch posts. Reddit blocks server-side requests without authentication."
              },
              { status: 401 }
            );
          }
          // In development, fall back to public API
          console.log("No Reddit OAuth token available, using public API");
        }
      } else if (isProduction) {
        // In production, require authentication
        return NextResponse.json(
          { 
            error: "Authentication required",
            details: "Please sign in and connect your Reddit account to fetch posts."
          },
          { status: 401 }
        );
      }
    } catch (authError) {
      // Not authenticated
      if (isProduction) {
        return NextResponse.json(
          { 
            error: "Authentication required",
            details: "Please sign in and connect your Reddit account to fetch posts."
          },
          { status: 401 }
        );
      }
      // In development, fall back to public API
      console.log("User not authenticated, using public API");
    }

    // Build headers with OAuth if available
    const headers: Record<string, string> = {
      "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
      Accept: "application/json",
    };

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // In production, always use OAuth endpoint. In development, fall back to public API if needed
    const apiUrl = `https://www.reddit.com/api/info.json?id=${postIdsString}`;

    const response = await fetch(apiUrl, {
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Reddit API error (${response.status}) for ${apiUrl}:`, errorText);
      console.error(`Headers used:`, JSON.stringify(headers, null, 2));
      console.error(`Post IDs:`, postIdsString);
      
      // If authenticated request failed in production, don't try public API (it will also be blocked)
      if (isProduction && response.status === 403) {
        return NextResponse.json(
          { 
            error: "Reddit blocked the request",
            details: "Reddit is blocking requests from this server. Please ensure your Reddit account is connected and try again. If the issue persists, Reddit may have IP-blocked the server."
          },
          { status: 403 }
        );
      }
      
      // In development, try public API as fallback if authenticated request failed
      if (!isProduction && accessToken && response.status === 403) {
        console.log("Authenticated request blocked, trying public API as fallback");
        const publicResponse = await fetch(
          `https://www.reddit.com/api/info.json?id=${postIdsString}`,
          {
            headers: {
              "User-Agent": "reddit-comment-tool/0.1 by isaaclhy13",
              Accept: "application/json",
            },
            cache: 'no-store',
          }
        );

        if (publicResponse.ok) {
          const publicData = await publicResponse.json();
          return NextResponse.json(publicData);
        }
      }

      return NextResponse.json(
        { 
          error: `Failed to fetch posts: ${response.statusText}`,
          details: response.status === 403 
            ? "Reddit blocked the request. This may be due to rate limiting, IP blocking, or missing authentication." 
            : undefined,
          debug: !isProduction ? { apiUrl, hasToken: !!accessToken, status: response.status } : undefined
        },
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

