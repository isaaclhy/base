import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from "@/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { keyword } = body;

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid keyword" },
        { status: 400 }
      );
    }

    const response = await (client as any).responses.create({
      prompt: {
        "id": "pmpt_69595a4f01d081968bea5541c68db1a807f9fc92d8163019",
        "version": "2",
        "variables": {
          "keyword": keyword
        }
      }
    });

    if (response.error) {
      console.error('OpenAI API error:', response.error);
      return NextResponse.json(
        { error: response.error?.message || 'OpenAI error' },
        { status: 500 }
      );
    }

    const output = response.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
    console.log('[Similar Keywords] Raw OpenAI output for keyword "' + keyword + '":', output);

    // Parse the JSON string response
    let similarKeywords: string[] = [];
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        similarKeywords = parsed;
      } else if (typeof parsed === 'object' && parsed.keywords && Array.isArray(parsed.keywords)) {
        similarKeywords = parsed.keywords;
      } else if (typeof parsed === 'string') {
        // If it's a JSON string, try parsing again
        const nestedParsed = JSON.parse(parsed);
        if (Array.isArray(nestedParsed)) {
          similarKeywords = nestedParsed;
        }
      }
    } catch (parseError) {
      console.error('[Similar Keywords] Error parsing JSON response:', parseError);
      // If parsing fails, try to extract keywords from the text
      // Split by commas, newlines, or other delimiters
      const lines = output.split(/[,\n]/).map((line: string) => line.trim()).filter((line: string) => line.length > 0);
      similarKeywords = lines;
    }

    // Filter out empty strings and ensure all are strings
    similarKeywords = similarKeywords.filter((k: any) => typeof k === 'string' && k.trim().length > 0);

    return NextResponse.json({
      success: true,
      keywords: similarKeywords
    });
  } catch (error) {
    console.error("Error generating similar keywords:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate similar keywords: ${errorMessage}` },
      { status: 500 }
    );
  }
}

