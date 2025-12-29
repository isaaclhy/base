import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { productDescription, numKeywords = 15 } = body;

    if (!productDescription || !productDescription.trim()) {
      return NextResponse.json(
        { error: "Product description is required" },
        { status: 400 }
      );
    }

    if (typeof numKeywords !== "number" || numKeywords < 1 || numKeywords > 50) {
      return NextResponse.json(
        { error: "numKeywords must be a number between 1 and 50" },
        { status: 400 }
      );
    }

    const response = await (openai as any).responses.create({
      prompt: {
        id: "pmpt_6952c7abe6c481968770612fd546ab660ad88b5e3c1212e5",
        version: "4",
        variables: {
          productidea: productDescription,
          numkeywords: numKeywords.toString(),
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

    // Extract the output from the response
    const output = response.output
      ?.filter((res: any) => res.type === "message")[0]
      ?.content?.filter((res: any) => res.type === "output_text")[0]?.text;

    if (!output) {
      return NextResponse.json(
        { error: "No output received from OpenAI" },
        { status: 500 }
      );
    }

    // Parse the output - it should be an array of strings
    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        keywords = parsed.filter((k) => typeof k === "string" && k.trim().length > 0);
      } else if (parsed.items && Array.isArray(parsed.items)) {
        keywords = parsed.items.filter((k: any) => typeof k === "string" && k.trim().length > 0);
      } else if (typeof parsed === "string") {
        // If it's a single string, split by comma or newline
        keywords = parsed
          .split(/[,\n]/)
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0);
      }
    } catch (e) {
      // If JSON parsing fails, try to split by comma or newline
      keywords = output
        .split(/[,\n]/)
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 0);
    }

    return NextResponse.json({
      success: true,
      keywords,
    });
  } catch (error) {
    console.error("Error generating keywords:", error);
    return NextResponse.json(
      {
        error: "Failed to generate keywords",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

