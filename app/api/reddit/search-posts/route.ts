import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";
import { RedditPost } from "@/lib/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { keyword, subreddit, limit = 15 } = await request.json();

    if (!keyword || !subreddit) {
      return NextResponse.json(
        { error: "Keyword and subreddit are required" },
        { status: 400 }
      );
    }

    // Try OAuth API first
    const session = await auth();
    if (session?.user?.email) {
      try {
        const accessToken = await refreshAccessToken(session.user.email);
        
        // Search Reddit posts in subreddit by keyword, sorted by new, limited to this week
        const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}&t=week&restrict_sr=1`;
        
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          cache: 'no-store'
        });

        if (response.ok) {
          const data = await response.json();
          const posts: RedditPost[] = data.data?.children?.map((child: any) => child.data) || [];
          
          // Filter posts from this week (created_utc within last 7 days)
          const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
          const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= oneWeekAgo);
          
          // Convert to the format expected by the frontend
          const results = recentPosts.slice(0, limit).map((post: RedditPost) => ({
            title: post.title,
            link: `https://www.reddit.com${post.permalink}`,
            snippet: post.selftext?.substring(0, 200) || post.title,
            selftext: post.selftext || null,
            postData: post,
          }));

          return NextResponse.json({ results });
        }
      } catch (oauthError) {
        console.error('OAuth API failed, falling back to public API:', oauthError);
        // Fall through to public API attempt
      }
    }

    // Fallback to public API
    const publicSearchUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}&t=week&restrict_sr=1`;
    
    const response = await fetch(publicSearchUrl, {
      headers: {
        'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
        'Accept': 'application/json',
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const posts: RedditPost[] = data.data?.children?.map((child: any) => child.data) || [];
    
    // Filter posts from this week
    const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= oneWeekAgo);
    
    const results = recentPosts.slice(0, limit).map((post: RedditPost) => ({
      title: post.title,
      link: `https://www.reddit.com${post.permalink}`,
      snippet: post.selftext?.substring(0, 200) || post.title,
      selftext: post.selftext || null,
      postData: post,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error searching Reddit posts:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to search Reddit posts: ${errorMessage}` },
      { status: 500 }
    );
  }
}

