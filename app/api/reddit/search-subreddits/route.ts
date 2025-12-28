import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidAccessToken, refreshAccessToken } from "@/lib/reddit/auth";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
        return NextResponse.json(
            { error: "Query parameter 'q' is required" },
            { status: 400 }
        );
    }

    try {
        const session = await auth();
        
        // Try to use OAuth API if user is authenticated and has Reddit connected
        if (session?.user?.email) {
            try {
                // Get valid access token
                let accessToken: string;
                try {
                    accessToken = await getValidAccessToken(session.user.email);
                } catch (error) {
                    // Try to refresh if getting token fails
                    try {
                        accessToken = await refreshAccessToken(session.user.email);
                    } catch (refreshError) {
                        // Fall through to public API if OAuth fails
                        throw new Error("OAuth failed, using public API");
                    }
                }

                // Search subreddits using Reddit OAuth API
                const searchUrl = `https://oauth.reddit.com/subreddits/search?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;
                
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
                    const subreddits = data.data?.children?.map((child: any) => ({
                        name: child.data.display_name,
                        displayName: child.data.display_name_prefixed || `r/${child.data.display_name}`,
                        subscribers: child.data.subscribers || 0,
                        description: child.data.public_description || child.data.description || "",
                        url: `https://reddit.com${child.data.url}`,
                    })) || [];

                    return NextResponse.json({ subreddits });
                }
            } catch (oauthError) {
                console.log('OAuth API failed, falling back to public API:', oauthError);
                // Fall through to public API
            }
        }

        // Fallback to public Reddit API (no authentication required)
        const publicSearchUrl = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;
        
        const response = await fetch(publicSearchUrl, {
            headers: {
                'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
                'Accept': 'application/json',
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Reddit public API error:", errorText);
            return NextResponse.json(
                { error: "Failed to search subreddits" },
                { status: response.status }
            );
        }

        const data = await response.json();
        const subreddits = data.data?.children?.map((child: any) => ({
            name: child.data.display_name,
            displayName: child.data.display_name_prefixed || `r/${child.data.display_name}`,
            subscribers: child.data.subscribers || 0,
            description: child.data.public_description || child.data.description || "",
            url: `https://reddit.com${child.data.url}`,
        })) || [];

        return NextResponse.json({ subreddits });
    } catch (error) {
        console.error("Error searching subreddits:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to search subreddits" },
            { status: 500 }
        );
    }
}

