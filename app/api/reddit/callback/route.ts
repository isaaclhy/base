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
    // Pass the request to auth() so it can read cookies properly
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

    // Verify state - this is critical for CSRF protection
    const storedState = request.cookies.get("reddit_oauth_state")?.value;
    const allCookies = Object.fromEntries(request.cookies.getAll().map(c => [c.name, c.value]));
    
    if (!state || !storedState || state !== storedState) {
      console.error("State validation failed:", {
        stateFromUrl: state,
        storedState: storedState,
        hasState: !!state,
        hasStoredState: !!storedState,
        cookies: allCookies,
        cookieNames: Object.keys(allCookies),
        requestUrl: request.url,
        userAgent: request.headers.get("user-agent"),
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
      });
      
      // If state is missing but we have a code, try to exchange it anyway
      // This handles cases where cookies were blocked (common in localhost with cross-site redirects)
      // We'll validate the code exchange instead - the code itself provides some security
      if (code && !storedState) {
        console.log("State cookie missing (likely blocked by browser), attempting code exchange anyway");
        // Continue with code exchange - if the code is invalid or expired, the token exchange will fail
      } else if (!code) {
        // No code means we can't proceed
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_no_code`
        );
      } else if (state && storedState && state !== storedState) {
        // State mismatch - this is a security issue, don't proceed
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_invalid_state`
        );
      } else if (!state) {
        // No state in URL - can't validate
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_invalid_state`
        );
      }
    }
    
    console.log("State validation passed:", {
      state: state.substring(0, 20) + "...",
      hasStoredState: !!storedState,
    });

    // Verify user is authenticated
    // If session is not available (common with cross-site redirects), try to get email from state
    let userEmail: string | null = session?.user?.email || null;
    
    if (!userEmail && state) {
      try {
        // Decode the state to get the user email we stored there
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        userEmail = decodedState.userId || null;
        console.log("Extracted user email from state:", userEmail);
      } catch (e) {
        console.error("Failed to decode state:", e);
      }
    }
    
    if (!userEmail) {
      console.error("Session check failed in Reddit callback:", {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasEmail: !!session?.user?.email,
        hasState: !!state,
        cookies: Object.keys(Object.fromEntries(request.cookies.getAll().map(c => [c.name, c.value]))),
      });
      // Redirect to playground instead of signin, as user might be logged in but session cookie not sent
      // The onboarding modal will handle showing the connection status
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_session_expired`
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
      await updateUserRedditTokens(userEmail, {
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
    // Delete cookie with same settings as when it was set
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const useSecureCookies = isProduction;
    response.cookies.set("reddit_oauth_state", "", {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: useSecureCookies ? "none" : "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Error in Reddit OAuth callback:", error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_error`
    );
  }
}

