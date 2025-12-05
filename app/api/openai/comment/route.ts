import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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
        "version": "14",
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
    return NextResponse.json({ comments: comments.items });

  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}
