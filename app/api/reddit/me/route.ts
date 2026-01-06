import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    try {
      const accessToken = await refreshAccessToken(session.user.email);
      
      const response = await fetch("https://oauth.reddit.com/api/v1/me", {
        headers: {
          'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch Reddit user info:", errorText);
        return NextResponse.json(
          { error: "Failed to fetch Reddit user info" },
          { status: response.status }
        );
      }

      const userData = await response.json();
      
      // Fetch subreddit subscriptions to get count
      let subredditCount = 0;
      try {
        const subredditsResponse = await fetch("https://oauth.reddit.com/subreddits/mine/subscriber?limit=100", {
          headers: {
            'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          cache: 'no-store'
        });

        if (subredditsResponse.ok) {
          const subredditsData = await subredditsResponse.json();
          // Count subreddits from the response
          if (subredditsData?.data?.children) {
            subredditCount = subredditsData.data.children.length;
            // If we got 100 results, there might be more, so we need to paginate
            // For now, we'll show at least 100+ if there are more
            if (subredditCount === 100 && subredditsData.data.after) {
              // There are likely more subreddits, but we'll just show "100+"
              // To get exact count, we'd need to paginate through all results
              subredditCount = 100; // We'll indicate it might be more
            }
          }
        }
      } catch (error) {
        console.error("Error fetching subreddit subscriptions:", error);
        // Continue without subreddit count
      }
      
      return NextResponse.json({
        success: true,
        user: {
          ...userData,
          subreddit_count: subredditCount
        }
      });
    } catch (error) {
      console.error("Error fetching Reddit user info:", error);
      return NextResponse.json(
        { error: "Failed to fetch Reddit user info" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in /api/reddit/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

