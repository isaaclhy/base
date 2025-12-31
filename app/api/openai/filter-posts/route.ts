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

    // Format posts for the prompt
    const postsString = JSON.stringify(posts);

    const response = await (openai as any).responses.create({
      prompt: {
        "id": "pmpt_6954083f58708193b7fbe2c0ed6396530bbdd28382fe1384",
        "version": "9",
        "variables": {
          "posts": postsString,
          "idea": idea
        }
      }
    });

    if (response.error) {
      console.error('OpenAI API error:', response.error);
      return NextResponse.json({ error: response.error?.message || 'OpenAI error' }, { status: 500 });
    }

    // Extract the output - handle different possible response structures
    console.log('[Filter Posts] Full OpenAI response:', JSON.stringify(response, null, 2));
    
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
      console.error('[Filter Posts] Error extracting output:', extractError);
      // Last resort: try to stringify the whole response
      output = JSON.stringify(response);
    }

    console.log('[Filter Posts] Raw OpenAI output:', output);

    // Parse the response - should be an array of YES/MAYBE/NO
    let results: string[];
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        results = parsed.map((r: any) => String(r).trim().toUpperCase());
      } else if (typeof parsed === 'string') {
        // If it's a single string, split by newlines or commas
        results = parsed.split(/\n|,/).map((r: string) => r.trim().toUpperCase()).filter(Boolean);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (e) {
      // If JSON parsing fails, try to parse as plain text
      console.log('[Filter Posts] Output is not JSON, trying to parse as plain text');
      const lines = output.split(/\n/).filter((line: string) => line.trim().length > 0);
      results = lines.map((line: string) => {
        // Extract YES/MAYBE/NO from each line
        const match = line.match(/\b(YES|NO|MAYBE)\b/i);
        return match ? match[1].toUpperCase() : line.trim().toUpperCase();
      }).filter(Boolean);
    }

    // Validate that we have the right number of results
    if (results.length !== posts.length) {
      console.warn(`[Filter Posts] Expected ${posts.length} results, got ${results.length}`);
      // Pad with NO if we got fewer results, or trim if we got more
      if (results.length < posts.length) {
        results = [...results, ...Array(posts.length - results.length).fill('NO')];
      } else {
        results = results.slice(0, posts.length);
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}

