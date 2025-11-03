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
        const apiUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

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

