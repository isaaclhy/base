import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from "@/auth";
import { incrementUsage, getMaxPostsPerWeekForPlan } from "@/lib/db/usage";
import { getUserByEmail } from "@/lib/db/users";

const client = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

export interface GenerateCommentQuery {
  productIdea: string;
  productLink: string;
  postContent: string;
}

export interface GenerateCommentResponse {
  error?: string
  comments?: string[]
}

interface OpenAIResponseSchema {
  items: string[]
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateCommentResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check usage limit before generating comment
    const dbUser = await getUserByEmail(session.user.email);
    const plan = dbUser?.plan ?? "free";
    const maxPerWeek = getMaxPostsPerWeekForPlan(plan);
    
    const { getUserUsage } = await import("@/lib/db/usage");
    const currentUsage = await getUserUsage(session.user.email);
    const remaining = Math.max(0, maxPerWeek - currentUsage.currentCount);
    
    // Check if user has reached the limit
    if (remaining === 0) {
      return NextResponse.json(
        { 
          error: `Weekly limit reached. You have used all ${maxPerWeek} Free Credits this week. Please wait until next week or upgrade to Premium for 10,000 Free Credits per month.`,
          limitReached: true,
          remaining: 0
        },
        { status: 403 }
      );
    }

    const body: GenerateCommentQuery = await request.json();
    const { productIdea, productLink, postContent } = body;

    if (!productIdea || !productLink || !postContent) {
      return NextResponse.json(
        { error: "Missing required fields: productIdea, productLink, postContent" },
        { status: 400 }
      );
    }

    const response = await (client as any).responses.create({
      prompt: {
        "id": "pmpt_6898a80a39208193b66057015ddb125d05c2b3824070c5a5",
        "version": "16",
        "variables": {
          "productidea": productIdea,
          "postcontent": postContent,
          "productlink": productLink,
        }
      }
    });

    if (response.error) {
      console.error('OpenAI API error:', response.error);
      return NextResponse.json({ error: response.error?.message || 'OpenAI error' }, { status: 500 });
    }

    const output = response.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
    console.log(output)

    const comments: OpenAIResponseSchema = JSON.parse(output);
    
    // Increment usage after successfully generating comment
    let finalRemaining = remaining - 1; // Decrement by 1 since we're about to increment
    try {
      const result = await incrementUsage(session.user.email, 1, maxPerWeek);
      finalRemaining = Math.max(0, maxPerWeek - result.usage.currentCount);
      console.log("Usage incremented for comment generation, remaining:", finalRemaining);
    } catch (usageError) {
      console.error("Error incrementing usage:", usageError);
      // Don't fail the request if usage increment fails, but calculate remaining from current usage
      const currentUsage = await getUserUsage(session.user.email);
      finalRemaining = Math.max(0, maxPerWeek - currentUsage.currentCount);
    }
    
    return NextResponse.json({ 
      comments: comments.items,
      remaining: finalRemaining
    });

  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}
