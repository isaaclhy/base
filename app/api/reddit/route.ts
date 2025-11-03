import { NextRequest, NextResponse } from "next/server";
import { RedditPost } from "@/lib/types";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const postUrl = searchParams.get("url");

    if (!postUrl) {
        return NextResponse.json(
            { error: "Reddit post URL is required" },
            { status: 400 }
        );
    }

    try {
        // Parse Reddit URL to extract post ID
        // Reddit URL format: https://www.reddit.com/r/{subreddit}/comments/{post_id}/...
        // Or: https://reddit.com/r/{subreddit}/comments/{post_id}/...
        const urlMatch = postUrl.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
        
        if (!urlMatch) {
            return NextResponse.json(
                { error: "Invalid Reddit URL format" },
                { status: 400 }
            );
        }

        const [, subreddit, postId] = urlMatch;
        
        // Call Reddit JSON API
        // Reddit may block server-side requests from certain IPs (like Vercel)
        // Try multiple approaches
        const apiUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;
        
        let response: Response;
        let lastError: string = '';
        
        // Try approach 1: Minimal headers
        try {
            response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
                    'Accept': '*/*',
                },
                cache: 'no-store'
            });
            
            if (response.ok) {
                // Success, continue below
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
            console.error('First attempt failed:', lastError);
            
            // Try approach 2: No custom headers at all (let fetch use defaults)
            try {
                response = await fetch(apiUrl, { cache: 'no-store' });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error2) {
                lastError = error2 instanceof Error ? error2.message : 'Unknown error';
                console.error('Second attempt failed:', lastError);
                
                // Return helpful error message
                return NextResponse.json(
                    { 
                        error: `Reddit API blocked the request (403 Forbidden). This may be due to rate limiting or IP blocking. Error: ${lastError}`,
                        suggestion: 'Reddit may be blocking server-side requests. Consider using Reddit\'s official API with OAuth authentication.'
                    },
                    { status: 403 }
                );
            }
        }

        // If we get here, response is ok
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Reddit API error:', response.status, response.statusText, errorText);
            return NextResponse.json(
                { error: `Failed to fetch post: ${response.statusText || 'Unknown error'}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        // Reddit API returns array: [postData, commentsData]
        const postData: RedditPost = data[0]?.data?.children[0]?.data;
        
        if (!postData) {
            return NextResponse.json(
                { error: "Post data not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ post: postData });
    } catch (error) {
        console.error("Error fetching Reddit post:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Failed to fetch Reddit post: ${errorMessage}` },
            { status: 500 }
        );
    }
}

