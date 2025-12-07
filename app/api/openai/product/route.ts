import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface RequestBody {
  website: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { website } = body;

    if (!website) {
      return NextResponse.json(
        { error: "Missing required field: website" },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      prompt: {
        id: "pmpt_6935f4a4a0a48193acb2a9e0e537f8b60c710ed2dd40ab84",
        version: "2",
        variables: {
          website: website,
        },
      },
    });

    if (response.error) {
      console.error("OpenAI API error:", response.error);
      return NextResponse.json(
        { error: response.error?.message || "OpenAI error" },
        { status: 500 }
      );
    }

    // Extract output text from OpenAI response
    let outputText = "";
    try {
      outputText = (response as any).output_text || "";
      // If output_text doesn't exist, try to extract from output array (similar to comment route)
      if (!outputText && (response as any).output) {
        const outputMessage = (response as any).output.filter((res: any) => res.type == 'message')[0];
        if (outputMessage && outputMessage.content) {
          const outputTextContent = outputMessage.content.filter((res: any) => res.type == 'output_text')[0];
          if (outputTextContent) {
            outputText = outputTextContent.text || "";
          }
        }
      }
    } catch (error) {
      console.error("Error parsing OpenAI response:", error);
    }

    return NextResponse.json({
      success: true,
      description: outputText,
      response: response,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

