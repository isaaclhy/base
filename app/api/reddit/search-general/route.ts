import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshAccessToken } from "@/lib/reddit/auth";
import { RedditPost } from "@/lib/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { keyword, limit = 50 } = await request.json();

    if (!keyword) {
      return NextResponse.json(
        { error: "Keyword is required" },
        { status: 400 }
      );
    }

    // Try OAuth API first
    const session = await auth();
    if (session?.user?.email) {
      try {
        const accessToken = await refreshAccessToken(session.user.email);
        
        // General Reddit search across all subreddits, sorted by new
        const searchUrl = `https://oauth.reddit.com/search.json?q=${encodeURIComponent(keyword)}&limit=${limit}&type=link`;
        
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
          
          // If limit is 100 or more, don't filter by time to ensure we get the requested number of posts
          // For smaller limits, keep the time filter for relevance
          let results: any[];
          if (limit >= 100) {
            // For large limits (like 100), return all posts without time filtering
            results = posts.slice(0, limit).map((post: RedditPost) => ({
              title: post.title,
              link: `https://www.reddit.com${post.permalink}`,
              snippet: post.selftext?.substring(0, 200) || post.title,
              selftext: post.selftext || null,
              postData: post,
            }));
          } else {
            // For smaller limits, filter posts from this week (created_utc within last 7 days)
            const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
            const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= oneWeekAgo);
            
            // Convert to the format expected by the frontend
            results = recentPosts.slice(0, limit).map((post: RedditPost) => ({
              title: post.title,
              link: `https://www.reddit.com${post.permalink}`,
              snippet: post.selftext?.substring(0, 200) || post.title,
              selftext: post.selftext || null,
              postData: post,
            }));
          }

          return NextResponse.json({ results });
        }
      } catch (oauthError) {
        console.error('OAuth API failed, falling back to public API:', oauthError);
        // Fall through to public API attempt
      }
    }

    // Fallback to public API
    const publicSearchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&limit=${limit}&t=week`;
    
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
    
    // If limit is 100 or more, don't filter by time to ensure we get the requested number of posts
    // For smaller limits, keep the time filter for relevance
    let results: any[];
    if (limit >= 100) {
      // For large limits (like 100), return all posts without time filtering
      results = posts.slice(0, limit).map((post: RedditPost) => ({
        title: post.title,
        link: `https://www.reddit.com${post.permalink}`,
        snippet: post.selftext?.substring(0, 200) || post.title,
        selftext: post.selftext || null,
        postData: post,
      }));
    } else {
      // For smaller limits, filter posts from this week
      const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= oneWeekAgo);
      
      results = recentPosts.slice(0, limit).map((post: RedditPost) => ({
        title: post.title,
        link: `https://www.reddit.com${post.permalink}`,
        snippet: post.selftext?.substring(0, 200) || post.title,
        selftext: post.selftext || null,
        postData: post,
      }));
    }

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

