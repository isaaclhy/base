import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";

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

    // Check for session (required)
    const session = await auth();
    
    if (!session) {
      return NextResponse.json(
        { error: "Missing session" },
        { status: 400 }
      );
    }

    if (!session.user?.email) {
      return NextResponse.json(
        { error: "Missing session" },
        { status: 400 }
      );
    }

    // Get valid access token (refreshes if needed)
    const access_token = await refreshAccessToken(session.user.email);

    // Always use OAuth endpoint with token
    const response = await fetch(`https://oauth.reddit.com/api/info.json?id=${postIdsString}`, {
      headers: {
        'User-Agent': 'comment-tool/0.1 by isaaclhy13',
        'Accept': 'application/json',
        "Authorization": `Bearer ${access_token}`,
      },
      cache: 'no-store',
    });

    // Log full response details for debugging
    console.log(`[Reddit API] Request Details:`, {
      url: `https://oauth.reddit.com/api/info.json?id=${postIdsString}`,
      method: 'GET',
      postIds: postIdsString,
      hasAccessToken: !!access_token,
    });
    
    console.log(`[Reddit API] Response Status:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    console.log(`[Reddit API] Response Headers:`, {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
      rateLimitUsed: response.headers.get('x-ratelimit-used'),
      rateLimitReset: response.headers.get('x-ratelimit-reset'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Reddit API] Error Response Body:`, errorText);
      console.error(`[Reddit API] Full Error Details:`, {
        status: response.status,
        statusText: response.statusText,
        postIds: postIdsString,
        responseBody: errorText,
      });
      
      return NextResponse.json(
        { 
          error: response.status === 404 ? 'Post not found' : `Failed to fetch posts: ${response.statusText}`,
          details: errorText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Log successful response for debugging
    console.log(`[Reddit API] Success Response:`, {
      dataKeys: Object.keys(data || {}),
      hasData: !!data?.data,
      childrenCount: data?.data?.children?.length || 0,
      postCount: postIdArray.length,
    });

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Error fetching Reddit posts:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to fetch Reddit posts" },
      { status: 500 }
    );
  }
}

