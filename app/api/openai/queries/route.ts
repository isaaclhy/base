import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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

    // Call OpenAI API twice with different prompts
    const response1 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_68ac40b0ef3481938b93b0880bd0f7140bf728d80740adbd",
        version: "3",
        variables: {
          gpt_query_completion_count: String(Math.ceil(Math.sqrt(count))),
          productidea: productIdea,
        },
      },
    });

    const response2 = await (client as any).responses.create({
      prompt: {
        id: "pmpt_68ac5dc5f3288194a0c30aa6ae7fdbfc0d4b07ecd77da901",
        version: "2",
        variables: {
          gpt_query_completion_count: String(Math.ceil(Math.sqrt(count))),
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

    return NextResponse.json({ result: combinedResponse });
  } catch (err: unknown) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

