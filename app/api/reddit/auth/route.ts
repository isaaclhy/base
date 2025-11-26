import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearUserRedditTokens } from "@/lib/db/users";

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || "";

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
    const searchParams = request.nextUrl.searchParams;
    const shouldReset = searchParams.get("reset") === "1";

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

    // Optionally clear existing Reddit tokens before starting a new OAuth flow
    if (shouldReset) {
      try {
        await clearUserRedditTokens(session.user.email);
      } catch (err) {
        console.error("Failed to clear existing Reddit tokens before reconnect:", err);
      }
    }

    // Get redirect URI based on current environment
    const redirectUri = getRedirectUri(request);

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
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&duration=permanent` + // Request permanent access (refresh token)
      `&scope=read,submit,identity` // Scopes needed: read (for fetching posts), submit (for posting), identity (for user info)
    );

    // Store state in httpOnly cookie for verification
    // For OAuth redirects from external domains (Reddit), we need sameSite: "none"
    // This requires secure: true (HTTPS), which is standard in production
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const useSecureCookies = isProduction; // HTTPS is required in production for sameSite: "none"
    
    response.cookies.set("reddit_oauth_state", state, {
      httpOnly: true,
      secure: useSecureCookies, // Required for sameSite: "none"
      sameSite: useSecureCookies ? "none" : "lax", // "none" for cross-site redirects, "lax" for localhost
      maxAge: 600, // 10 minutes
      path: "/", // Ensure cookie is available at root path
      // Don't set domain - let it default to current domain
    });
    
    console.log("Reddit OAuth state cookie set:", {
      state: state.substring(0, 20) + "...",
      hasState: !!state,
      isProduction,
      useSecureCookies,
      redirectUri,
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

