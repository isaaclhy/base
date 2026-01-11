import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from "@/auth";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
});

export interface FilterTitlesRequest {
    posts: Array<{ id: string; title: string }>; // Changed from titles array
    product: string;
}

export interface FilterTitlesResponse {
    results?: Array<{ id: string; verdict: string }>; // Changed to include IDs
    error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<FilterTitlesResponse>> {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body: FilterTitlesRequest = await request.json();
        const { posts, product } = body;

        if (!posts || !Array.isArray(posts) || posts.length === 0) {
            return NextResponse.json(
                { error: "Posts array is required and must not be empty" },
                { status: 400 }
            );
        }

        if (!product || product.trim().length === 0) {
            return NextResponse.json(
                { error: "Product description is required" },
                { status: 400 }
            );
        }

        try {
            const response = await (openai as any).responses.create({
                prompt: {
                    "id": "pmpt_695aa3d82c0c8190bac1998da046cd5c0e429183fd7f88be",
                    "version": "10",
                    "variables": {
                        "product": product,
                        "posts": JSON.stringify(posts) // Now sending {id, title} objects
                    }
                },
                max_output_tokens: 25000 // Add this to prevent truncation
            });

            if (response.error) {
                console.error('[Filter Titles] OpenAI API error:', response.error);
                return NextResponse.json({ error: response.error?.message || 'OpenAI error' }, { status: 500 });
            }

            // Extract the output - handle different possible response structures
            let output: string;
            try {
                // Try to extract from the expected structure
                if (response.output && Array.isArray(response.output)) {
                    const message = response.output.find((res: any) => res.type === 'message');
                    if (message && message.content && Array.isArray(message.content)) {
                        const outputText = message.content.find((res: any) => res.type === 'output_text');
                        if (outputText && outputText.text) {
                            output = outputText.text;
                        } else {
                            throw new Error('Could not find output_text in message content');
                        }
                    } else {
                        throw new Error('Could not find message in output');
                    }
                } else if (response.data) {
                    // Fallback: try response.data
                    output = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                } else if (typeof response === 'string') {
                    output = response;
                } else {
                    throw new Error('Unexpected response structure');
                }
            } catch (extractError) {
                console.error('[Filter Titles] Error extracting output:', extractError);
                // Last resort: try to stringify the whole response
                output = JSON.stringify(response);
            }

            console.log('[Filter Titles] Raw output:', output.substring(0, 500)); // Debug log

            // Parse the response - expecting array of {id, verdict}
            let results: Array<{ id: string; verdict: string }>;
            try {
                const parsed = JSON.parse(output);
                
                if (Array.isArray(parsed)) {
                    // If it's an array of objects with id and verdict
                    if (parsed[0] && typeof parsed[0] === 'object' && 'id' in parsed[0]) {
                        results = parsed.map((item: any) => ({
                            id: String(item.id),
                            verdict: String(item.verdict || item.result || 'NO').trim().toUpperCase()
                        }));
                    } 
                    // If it's just an array of verdicts (old format), map them to post IDs
                    else {
                        console.warn('[Filter Titles] Response in old format, mapping to post IDs');
                        results = posts.map((post, i) => ({
                            id: post.id,
                            verdict: String(parsed[i] || 'NO').trim().toUpperCase()
                        }));
                    }
                } else if (parsed.results && Array.isArray(parsed.results)) {
                    // If wrapped in results object
                    results = parsed.results.map((item: any) => ({
                        id: String(item.id),
                        verdict: String(item.verdict || item.result || 'NO').trim().toUpperCase()
                    }));
                } else {
                    throw new Error('Unexpected response format');
                }
            } catch (e) {
                console.error('[Filter Titles] Parse error:', e);
                console.error('[Filter Titles] Raw output:', output);
                // Fallback: return NO for all posts
                results = posts.map(post => ({ id: post.id, verdict: 'NO' }));
            }

            // Ensure we have results for all posts
            const resultIds = new Set(results.map(r => r.id));
            posts.forEach(post => {
                if (!resultIds.has(post.id)) {
                    console.warn(`[Filter Titles] Missing result for post ${post.id}, adding NO`);
                    results.push({ id: post.id, verdict: 'NO' });
                }
            });

            console.log('[Filter Titles] Returning results:', results.length);
            return NextResponse.json({ results });
        } catch (error) {
            console.error('[Filter Titles] Error:', error);
            return NextResponse.json({ error: `${error}` }, { status: 500 });
        }
    } catch (err) {
        console.error('[Filter Titles] API Error:', err);
        return NextResponse.json({ error: `${err}` }, { status: 500 });
    }
}