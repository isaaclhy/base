import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productidea, content } = body;

    if (!productidea || !content) {
      return NextResponse.json(
        { error: "productidea and content are required" },
        { status: 400 }
      );
    }

    // Convert content array to string if it's an array
    // The prompt expects a string, so we'll format the array as a JSON string or formatted text
    let contentString: string;
    if (Array.isArray(content)) {
      // Convert array to a formatted string - each post on a new line with index
      contentString = JSON.stringify(content);
    } else if (typeof content === 'string') {
      contentString = content;
    } else {
      contentString = JSON.stringify(content);
    }

    console.log("Filter API - productIdea:", productidea);
    console.log("Filter API - contentString:", contentString);

    const response = await openai.responses.create({
      prompt: {
        id: "pmpt_68ac71c5cc788193b9d095141909b9050359e52da153e5cc",
        version: "8",
        variables: {
          productidea: productidea,
          content: contentString,
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

    console.log("Filter API - OpenAI response:", JSON.stringify(response, null, 2));

    // Extract output text from OpenAI response
    let outputText = "";
    try {
      outputText = (response as any).output_text || "";
      // If output_text doesn't exist, try to extract from output array
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

    console.log("Filter API - extracted output_text:", outputText);

    const apiResponse = {
      success: true,
      output_text: outputText,
      data: response,
    };

    console.log("Filter API - final response:", JSON.stringify(apiResponse, null, 2));

    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error("Error in /api/reddit/filter:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to filter content",
      },
      { status: 500 }
    );
  }
}
