import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || "";
const REDDIT_REDIRECT_URI = process.env.REDDIT_REDIRECT_URI || "http://localhost:3000/api/reddit/callback";

export async function GET(request: NextRequest) {
  try {
    // Validate Reddit OAuth configuration
    if (!REDDIT_CLIENT_ID || REDDIT_CLIENT_ID.trim() === "") {
      console.error("REDDIT_CLIENT_ID is not set in environment variables");
      return NextResponse.json(
        { 
          error: "Reddit OAuth not configured. Please set REDDIT_CLIENT_ID in your environment variables.",
          details: "Check your .env.local file and ensure REDDIT_CLIENT_ID is set."
        },
        { status: 500 }
      );
    }

    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Generate a random state for CSRF protection
    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.email,
        timestamp: Date.now(),
      })
    ).toString("base64");

    // Store state in a cookie (you could also store in Redis/DB for better security)
    const response = NextResponse.redirect(
      `https://www.reddit.com/api/v1/authorize?` +
      `client_id=${REDDIT_CLIENT_ID}` +
      `&response_type=code` +
      `&state=${state}` +
      `&redirect_uri=${encodeURIComponent(REDDIT_REDIRECT_URI)}` +
      `&duration=permanent` + // Request permanent access (refresh token)
      `&scope=submit,identity` // Scopes needed: submit (for posting), identity (for user info)
    );

    // Store state in httpOnly cookie for verification
    response.cookies.set("reddit_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    console.error("Error initiating Reddit OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate Reddit authorization" },
      { status: 500 }
    );
  }
}

