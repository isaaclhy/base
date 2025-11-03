import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GenerateCommentQuery {
  productIdea: string;
  productLink: string;
  postContent: string;
}

export interface GenerateCommentResponse {
  error?: string;
  comments?: string[];
}

interface OpenAIResponseSchema {
  items: string[];
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateCommentResponse>> {
  try {
    const body: GenerateCommentQuery = await request.json();
    const { productIdea, productLink, postContent } = body;

    if (!productIdea || !productLink || !postContent) {
      return NextResponse.json(
        { error: "Missing required fields: productIdea, productLink, postContent" },
        { status: 400 }
      );
    }

    // Try the custom responses.create API first (if you have a custom SDK)
    // Otherwise fall back to standard chat completions
    let output: string;

    try {
      console.log("API Key: ", process.env.OPENAI_API_KEY);
      // If you have a custom OpenAI client with responses.create, use this:
      // @ts-ignore - Custom API may not be in type definitions
      const response = await client.responses?.create?.({
        prompt: {
          id: "pmpt_6898a80a39208193b66057015ddb125d05c2b3824070c5a5",
          version: "13",
          variables: {
            productidea: productIdea,
            postcontent: postContent,
            productlink: productLink,
          },
        },
      });

      if (response?.error) {
        console.error("OpenAI API error:", response.error);
        return NextResponse.json(
          { error: response.error?.message || "OpenAI error" },
          { status: 500 }
        );
      }
      console.log("Response: ", response);
      output =
        response?.output
          ?.filter((res: any) => res.type == "message")[0]
          ?.content?.filter((res: any) => res.type == "output_text")[0]?.text;
    } catch (customError) {
      // Fall back to standard OpenAI chat completions
      console.log("Using standard OpenAI API ", customError);
      
      // Try with JSON mode first (for supported models)
      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o", // Supports JSON mode
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant that generates Reddit comments based on product ideas and Reddit post content. You must return ONLY a valid JSON object with an "items" array containing comment strings. Do not include any text before or after the JSON.`,
            },
            {
              role: "user",
              content: `Generate Reddit comments for this product idea: ${productIdea}\n\nProduct Link: ${productLink}\n\nReddit Post Content:\n${postContent}\n\nReturn the response as a JSON object with this structure: {"items": ["comment1", "comment2", ...]}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        output = response.choices[0]?.message?.content || "";
      } catch (jsonModeError) {
        // Fallback: use model without JSON mode and parse the response
        console.log("JSON mode not supported, using fallback");
        const response = await client.chat.completions.create({
          model: "gpt-4", // Works without JSON mode
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant that generates Reddit comments based on product ideas and Reddit post content. You must return ONLY a valid JSON object with an "items" array containing comment strings. Do not include any text before or after the JSON.`,
            },
            {
              role: "user",
              content: `Generate Reddit comments for this product idea: ${productIdea}\n\nProduct Link: ${productLink}\n\nReddit Post Content:\n${postContent}\n\nReturn the response as a JSON object with this structure: {"items": ["comment1", "comment2", ...]}`,
            },
          ],
        });

        output = response.choices[0]?.message?.content || "";
      }
    }

    if (!output) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    console.log(output);

    const comments: OpenAIResponseSchema = JSON.parse(output);
    return NextResponse.json({ comments: comments.items });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: `${err}` },
      { status: 500 }
    );
  }
}

