import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from "@/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
});

export interface FilterPostsRequest {
  posts: Array<{ title: string; content: string }>;
  idea: string;
}

export interface FilterPostsResponse {
  results?: string[]; // Array of "YES", "MAYBE", or "NO"
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<FilterPostsResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: FilterPostsRequest = await request.json();
    const { posts, idea } = body;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json(
        { error: "Posts array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (!idea || idea.trim().length === 0) {
      return NextResponse.json(
        { error: "Idea is required" },
        { status: 400 }
      );
    }

    // Batch posts to avoid exceeding OpenAI's input limit (1048576 characters for posts variable)
    const MAX_POSTS_STRING_LENGTH = 200000; // Smaller batches for better reliability
    const batches: Array<Array<{ title: string; content: string }>> = [];

    // Split posts into batches, checking the actual JSON string length
    let currentBatch: Array<{ title: string; content: string }> = [];

    for (const post of posts) {
      // Test if adding this post would exceed the limit
      const testBatch = [...currentBatch, post];
      const testBatchString = JSON.stringify(testBatch);
      
      // If adding this post would exceed the limit, start a new batch
      if (testBatchString.length > MAX_POSTS_STRING_LENGTH && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [post];
      } else {
        currentBatch.push(post);
      }
    }

    // Add the last batch if it has posts
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Process each batch in parallel and collect all results
    const batchPromises = batches.map(async (batch, batchIndex) => {
      // Format posts for the prompt
      const postsString = JSON.stringify(batch);

      try {
        const response = await (openai as any).responses.create({
          prompt: {
            "id": "pmpt_6954083f58708193b7fbe2c0ed6396530bbdd28382fe1384",
            "version": "11",
            "variables": {
              "posts": postsString,
              "idea": idea
            }
          }
        });

        if (response.error) {
          console.error(`[Filter Posts] OpenAI API error for batch ${batchIndex + 1}:`, response.error);
          // If a batch fails, treat all posts in that batch as "NO"
          return { batchIndex, results: new Array(batch.length).fill('NO') };
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
          console.error(`[Filter Posts] Error extracting output for batch ${batchIndex + 1}:`, extractError);
          // Last resort: try to stringify the whole response
          output = JSON.stringify(response);
        }

        // Parse the response - should be an array of YES/MAYBE/NO
        let batchResults: string[];
        try {
          const parsed = JSON.parse(output);
          if (Array.isArray(parsed)) {
            batchResults = parsed.map((r: any) => String(r).trim().toUpperCase());
          } else if (typeof parsed === 'string') {
            // If it's a single string, split by newlines or commas
            batchResults = parsed.split(/\n|,/).map((r: string) => r.trim().toUpperCase()).filter(Boolean);
          } else {
            throw new Error('Unexpected response format');
          }
        } catch (e) {
          // If JSON parsing fails, try to parse as plain text
          const lines = output.split(/\n/).filter((line: string) => line.trim().length > 0);
          batchResults = lines.map((line: string) => {
            // Extract YES/MAYBE/NO from each line
            const match = line.match(/\b(YES|NO|MAYBE)\b/i);
            return match ? match[1].toUpperCase() : line.trim().toUpperCase();
          }).filter(Boolean);
        }

        // Validate that we have the right number of results for this batch
        if (batchResults.length !== batch.length) {
          console.warn(`[Filter Posts] Batch ${batchIndex + 1}: Expected ${batch.length} results, got ${batchResults.length}`);
          // Pad with NO if we got fewer results, or trim if we got more
          if (batchResults.length < batch.length) {
            batchResults = [...batchResults, ...Array(batch.length - batchResults.length).fill('NO')];
          } else {
            batchResults = batchResults.slice(0, batch.length);
          }
        }

        return { batchIndex, results: batchResults };
      } catch (error) {
        console.error(`[Filter Posts] Error processing batch ${batchIndex + 1}:`, error);
        // If a batch fails, treat all posts in that batch as "NO"
        return { batchIndex, results: new Array(batch.length).fill('NO') };
      }
    });

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);

    // Sort results by batchIndex to maintain order
    batchResults.sort((a, b) => a.batchIndex - b.batchIndex);

    // Combine all results in order
    const allResults: string[] = [];
    batchResults.forEach(({ results }) => {
      allResults.push(...results);
    });

    // Validate that we have the right number of results total
    if (allResults.length !== posts.length) {
      console.warn(`[Filter Posts] Total: Expected ${posts.length} results, got ${allResults.length}`);
      // Pad with NO if we got fewer results, or trim if we got more
      if (allResults.length < posts.length) {
        allResults.push(...Array(posts.length - allResults.length).fill('NO'));
      } else {
        allResults.splice(posts.length);
      }
    }

    return NextResponse.json({ results: allResults });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}

