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

    // Call OpenAI API twice with different prompts
    const response1 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_68ac40b0ef3481938b93b0880bd0f7140bf728d80740adbd",
        version: "5",
        variables: {
          gpt_query_completion_count: String(Math.min(2,Math.ceil(Math.sqrt(count)))),
          productidea: productIdea,
        },
      },
    });

    const response2 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_68ac5dc5f3288194a0c30aa6ae7fdbfc0d4b07ecd77da901",
        version: "2",
        variables: {
          gpt_query_completion_count: String(Math.min(2,Math.ceil(Math.sqrt(count)))),
          productidea: productIdea,
        },
      },
    });

    if (response1.error || response2.error) {
      console.error("OpenAI API error:", response1.error || response2.error);
      return NextResponse.json(
        { error: response1.error?.message || response2.error?.message || "OpenAI error" },
        { status: 500 }
      );
    }

    // Parse and combine responses
    const parsed1 = JSON.parse(response1.output_text || "[]");
    const parsed2 = JSON.parse(response2.output_text || "[]");
    const combinedResponse = [...parsed1, ...parsed2];

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

