import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from "@/auth";
import { incrementUsage, getMaxPostsPerWeekForPlan } from "@/lib/db/usage";
import { getUserByEmail } from "@/lib/db/users";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
});

export interface GenerateCommentQuery {
  productIdea: string;
  productLink: string;
  postContent: string;
  persona?: string; // Optional persona parameter
  selftext?: string; // Optional selftext for User persona
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
    const { productIdea, productLink, postContent, persona, selftext } = body;

    console.log('[Comment Generation] Received persona:', persona);
    console.log('[Comment Generation] selftext provided:', selftext !== undefined);

    if (!productIdea || !productLink || !postContent) {
      return NextResponse.json(
        { error: "Missing required fields: productIdea, productLink, postContent" },
        { status: 400 }
      );
    }

    let response: any;

    // If persona is "User", use the different prompt with idea and content (selftext only)
    if (persona === "user" && selftext !== undefined) {
      console.log('[Comment Generation] Using User persona prompt with idea and content');
      response = await (client as any).responses.create({
        prompt: {
          "id": "pmpt_694070307fec8190a790348d7d4672ed045ef4781855787f",
          "version": "8",
          "variables": {
            "idea": productIdea,
            "content": selftext
          }
        }
      });
    } else {
      // Default prompt for Founder or other personas
      console.log('[Comment Generation] Using default/Founder persona prompt');
      response = await (client as any).responses.create({
        prompt: {
          "id": "pmpt_694ff0c078ec8197ad0b92621f11735905afaefebad67788",
          "version": "4",
          "variables": {
            "content": postContent,
            "idea": productIdea
          }
        }
      });
    }

    if (response.error) {
      console.error('OpenAI API error:', response.error);
      return NextResponse.json({ error: response.error?.message || 'OpenAI error' }, { status: 500 });
    }

    const output = response.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
    console.log('[Comment Generation] Raw OpenAI output:', output);

    // The User persona prompt might return a different format
    // Try to parse as JSON first, if it fails, treat it as a single comment string
    let comments: OpenAIResponseSchema;
    try {
      const parsed = JSON.parse(output);
      if (parsed.items && Array.isArray(parsed.items)) {
        comments = parsed;
      } else if (Array.isArray(parsed)) {
        // If it's just an array, wrap it in items
        comments = { items: parsed };
      } else if (typeof parsed === 'string') {
        // If it's a single string, wrap it in items array
        comments = { items: [parsed] };
      } else {
        // Try to extract items from the parsed object
        comments = parsed;
      }
    } catch (e) {
      // If JSON parsing fails, treat the output as a single comment string
      console.log('[Comment Generation] Output is not JSON, treating as plain text');
      comments = { items: [output] };
    }
    
    console.log('[Comment Generation] Parsed comments:', comments);
    
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
