import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";
// Usage tracking removed - now tracked only when comments are generated

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface RequestBody {
  productIdea: string;
  postCount: number;
}

interface OpenAIResponse {
  choices?: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
  output_text?: string;
}

export interface GenerateQueriesResponse {
  result?: string[];
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateQueriesResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: RequestBody = await request.json();
    const { productIdea, postCount } = body;

    if (!productIdea) {
      return NextResponse.json(
        { error: "Missing required field: productIdea" },
        { status: 400 }
      );
    }

    // Default postCount to 10 if not provided
    const count = postCount || 10;

    // Usage is now tracked only when comments are generated, not when queries/posts are fetched
    // No usage limit check needed here

    // Calculate number of queries needed: more queries with fewer results per query
    // Each query will fetch top 7 results for better coverage (some may be filtered out)
    const RESULTS_PER_QUERY = 7; // Fetch top 7 results per query to account for filtering
    // Add 30% buffer to account for queries that don't return enough results or duplicates
    const queriesNeeded = Math.ceil((count / RESULTS_PER_QUERY) * 1.3);
    // Cap at reasonable maximum (e.g., 20 queries max)
    const queryCount = Math.min(queriesNeeded, 20);

    // Call OpenAI API to generate more queries
    const response1 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_69330a1b0d788197826b386ddc375be7015a3de39dafb3df",
        version: "5",
        variables: {
          gpt_query_completion_count: String(queryCount),
          productidea: productIdea,
        },
      },
    });


    if (response1.error) {
      console.error("OpenAI API error:", response1.error);
      return NextResponse.json(
        { error: response1.error?.message || "OpenAI error" },
        { status: 500 }
      );
    }

    // Parse and combine responses
    const parsed1 = JSON.parse(response1.output_text || "[]");
    const combinedResponse = [...parsed1];

    return NextResponse.json({ 
      result: combinedResponse
    });
  } catch (err: unknown) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

