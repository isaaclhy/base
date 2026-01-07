import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { product } = body;

    if (!product || typeof product !== 'string' || product.trim().length === 0) {
      return NextResponse.json({ error: "Product description is required" }, { status: 400 });
    }

    try {
      // Call OpenAI with the specified prompt
      const response = await openai.responses.create({
        prompt: {
          "id": "pmpt_695ee1c906d88193b92efe796ce7d7630147ed422fcf9b0a",
          "version": "4",
          "variables": {
            "product": product.trim()
          }
        }
      });

      // Parse the response - should be a JSON array of 5 strings
      let keywords: string[] = [];
      
      // The response format might vary, so we need to handle it
      // Try different response structures based on existing patterns in the codebase
      try {
        // First, try to extract from the structured output (like comment route)
        if ((response as any).output && Array.isArray((response as any).output)) {
          const outputMessage = (response as any).output.filter((res: any) => res.type == 'message')[0];
          if (outputMessage && outputMessage.content) {
            const outputTextContent = outputMessage.content.filter((res: any) => res.type == 'output_text')[0];
            if (outputTextContent && outputTextContent.text) {
              const text = outputTextContent.text;
              // Try to parse as JSON array
              try {
                keywords = JSON.parse(text);
              } catch (e) {
                // If not JSON, try to extract JSON array from the text
                const match = text.match(/\[.*\]/);
                if (match) {
                  keywords = JSON.parse(match[0]);
                }
              }
            }
          }
        }
        
        // If we still don't have keywords, try direct output
        if (keywords.length === 0 && (response as any).output) {
          if (typeof (response as any).output === 'string') {
            try {
              keywords = JSON.parse((response as any).output);
            } catch (e) {
              const match = (response as any).output.match(/\[.*\]/);
              if (match) {
                keywords = JSON.parse(match[0]);
              }
            }
          } else if (Array.isArray((response as any).output)) {
            keywords = (response as any).output;
          }
        }
        
        // Also check output_text directly
        if (keywords.length === 0 && (response as any).output_text) {
          const text = (response as any).output_text;
          try {
            keywords = JSON.parse(text);
          } catch (e) {
            const match = text.match(/\[.*\]/);
            if (match) {
              keywords = JSON.parse(match[0]);
            }
          }
        }
      } catch (parseError) {
        console.error("Error parsing keywords response:", parseError);
        console.error("Raw response:", JSON.stringify(response, null, 2));
      }

      // Ensure we have an array of strings
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return NextResponse.json(
          { error: "Failed to parse keywords from OpenAI response", rawResponse: response },
          { status: 500 }
        );
      }

      // Filter out any non-string values and trim
      keywords = keywords
        .filter(k => typeof k === 'string' && k.trim().length > 0)
        .map(k => k.trim())
        .slice(0, 5); // Limit to 5 keywords

      return NextResponse.json({ keywords });
    } catch (openaiError: any) {
      console.error("OpenAI API error:", openaiError);
      return NextResponse.json(
        { error: `OpenAI API error: ${openaiError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in suggest-keywords API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unknown error occurred" },
      { status: 500 }
    );
  }
}

