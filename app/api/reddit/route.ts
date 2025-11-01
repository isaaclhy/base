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
                'User-Agent': 'Mozilla/5.0 (compatible; RedditBot/1.0)'
            }
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch post: ${response.statusText}` },
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
        return NextResponse.json(
            { error: "Failed to fetch Reddit post" },
            { status: 500 }
        );
    }
}

