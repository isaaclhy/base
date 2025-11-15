import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserRedditTokens } from "@/lib/db/users";

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || "";
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || "";

// Dynamically determine redirect URI based on environment
function getRedirectUri(request: NextRequest): string {
  // Use explicit environment variable if set
  if (process.env.REDDIT_REDIRECT_URI) {
    return process.env.REDDIT_REDIRECT_URI;
  }

  // Otherwise, build from request URL or environment
  const baseUrl = process.env.NEXTAUTH_URL || 
                  process.env.NEXT_PUBLIC_APP_URL || 
                  request.nextUrl.origin;
  
  return `${baseUrl}/api/reddit/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_denied`
      );
    }

    // Verify state
    const storedState = request.cookies.get("reddit_oauth_state")?.value;
    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_invalid_state`
      );
    }

    // Verify user is authenticated
    if (!session?.user?.email) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/auth/signin`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_no_code`
      );
    }

    // Get redirect URI (must match the one used in auth route)
    const redirectUri = getRedirectUri(request);

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Failed to exchange code for token:", errorText);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_token_exchange_failed`
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token || !tokenData.refresh_token) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_invalid_response`
      );
    }

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Store tokens in database
    try {
      await updateUserRedditTokens(session.user.email, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      });
    } catch (dbError) {
      console.error("Error saving Reddit tokens:", dbError);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_save_failed`
      );
    }

    // Clear the state cookie
    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?reddit_connected=success`
    );
    response.cookies.delete("reddit_oauth_state");

    return response;
  } catch (error) {
    console.error("Error in Reddit OAuth callback:", error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_error`
    );
  }
}

