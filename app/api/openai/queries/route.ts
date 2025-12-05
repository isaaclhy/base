import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";
import { canGeneratePosts, getMaxPostsPerWeekForPlan } from "@/lib/db/usage";
import { getUserByEmail } from "@/lib/db/users";

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

    const dbUser = await getUserByEmail(session.user.email);
    const plan = dbUser?.plan ?? "free";
    const maxPerWeek = getMaxPostsPerWeekForPlan(plan);

    // Check current usage and allow partial fulfillment
    const { getUserUsage } = await import("@/lib/db/usage");
    const currentUsage = await getUserUsage(session.user.email);
    const remaining = Math.max(0, maxPerWeek - currentUsage.currentCount);
    
    // If no remaining quota, return error
    if (remaining === 0) {
      return NextResponse.json(
        { 
          error: `Weekly limit reached. You have generated ${maxPerWeek} posts this week. Please wait until next week or upgrade to Premium for 10,000 posts per month.`,
          limitReached: true,
          remaining: 0
        },
        { status: 403 }
      );
    }

    // Allow partial fulfillment - use the minimum of requested count and remaining quota
    const adjustedCount = Math.min(count, remaining);
    
    // Return information about partial fulfillment if applicable
    const responseData: any = { plan };
    if (adjustedCount < count) {
      responseData.partialFulfillment = true;
      responseData.requestedCount = count;
      responseData.adjustedCount = adjustedCount;
      responseData.remaining = remaining;
    }

    // Calculate number of queries needed: more queries with fewer results per query
    // Each query will fetch top 7 results for better coverage (some may be filtered out)
    const RESULTS_PER_QUERY = 7; // Fetch top 7 results per query to account for filtering
    // Add 30% buffer to account for queries that don't return enough results or duplicates
    const queriesNeeded = Math.ceil((adjustedCount / RESULTS_PER_QUERY) * 1.3);
    // Cap at reasonable maximum (e.g., 20 queries max)
    const queryCount = Math.min(queriesNeeded, 20);

    // Call OpenAI API to generate more queries
    const response1 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_69330a1b0d788197826b386ddc375be7015a3de39dafb3df",
        version: "2",
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
      result: combinedResponse, 
      ...responseData,
      currentUsage: currentUsage.currentCount,
      maxPerWeek,
      remaining: remaining // Remaining before this request (will be decremented when posts are fetched)
    });
  } catch (err: unknown) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

