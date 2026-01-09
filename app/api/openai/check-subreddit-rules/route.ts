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
    const { rules } = body;

    // If no rules provided, default to allowing promotion
    if (!rules || typeof rules !== 'string' || rules.trim().length === 0) {
      return NextResponse.json({ 
        allowsPromotion: true,
        verdict: 'YES',
        rawOutput: 'No rules provided - defaulting to allow promotion'
      });
    }

    try {
      // Call OpenAI with the specified prompt
      const response = await openai.responses.create({
        prompt: {
          "id": "pmpt_69604849cd108197bb3a470f1315349e0ab1f2ccb34665ea",
          "version": "4",
          "variables": {
            "rules": rules.trim()
          }
        }
      });

      if (response.error) {
        console.error('OpenAI API error:', response.error);
        return NextResponse.json({ error: response.error?.message || 'OpenAI error' }, { status: 500 });
      }

      // Extract the output - handle different possible response structures
      let output: string;
      try {
        // Try to extract from the expected structure
        if ((response as any).output_text) {
          output = (response as any).output_text;
        } else if ((response as any).output && Array.isArray((response as any).output)) {
          const messageContent = (response as any).output.find((item: any) => item.type === 'message')?.content;
          if (messageContent && Array.isArray(messageContent)) {
            const outputTextContent = messageContent.find((item: any) => item.type === 'output_text');
            if (outputTextContent) {
              output = outputTextContent.text;
            } else {
              // Fallback if output_text is not directly found in content
              output = messageContent.map((item: any) => item.text || item.content).join('\n');
            }
          } else {
            output = JSON.stringify(response.output); // Fallback to stringifying the output
          }
        } else {
          output = JSON.stringify(response); // Fallback to stringifying the whole response
        }
      } catch (parseError) {
        console.error("Error parsing OpenAI response structure:", parseError, "Raw response:", response);
        return NextResponse.json({ error: "Failed to parse OpenAI response structure" }, { status: 500 });
      }

      // Parse and normalize the output to YES or NO
      const normalizedOutput = output.trim().toUpperCase();
      let allowsPromotion: boolean;
      
      if (normalizedOutput === 'YES' || normalizedOutput.startsWith('YES')) {
        allowsPromotion = true;
      } else if (normalizedOutput === 'NO' || normalizedOutput.startsWith('NO')) {
        allowsPromotion = false;
      } else {
        // If the response is not clearly YES or NO, log it and default to NO for safety
        console.warn(`Unexpected OpenAI response format: "${output}". Defaulting to NO.`);
        allowsPromotion = false;
      }

      return NextResponse.json({ 
        allowsPromotion,
        verdict: allowsPromotion ? 'YES' : 'NO',
        rawOutput: output.trim()
      });
    } catch (openaiError: any) {
      console.error("OpenAI API error:", openaiError);
      return NextResponse.json(
        { error: `OpenAI API error: ${openaiError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in check-subreddit-rules API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unknown error occurred" },
      { status: 500 }
    );
  }
}

