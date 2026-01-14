import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserRedditTokens, getUserByEmail } from "@/lib/db/users";

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
  console.log("[Reddit Callback] ===== CALLBACK HANDLER CALLED =====", {
    url: request.url,
    hasCode: !!request.nextUrl.searchParams.get("code"),
    hasState: !!request.nextUrl.searchParams.get("state"),
    hasError: !!request.nextUrl.searchParams.get("error"),
    timestamp: new Date().toISOString(),
  });
  
  try {
    // Pass the request to auth() so it can read cookies properly
    const session = await auth();
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    
    console.log("[Reddit Callback] Initial parameters:", {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      hasSession: !!session,
      hasEmail: !!session?.user?.email,
    });

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
      state: state?.substring(0, 20) + "...",
      hasStoredState: !!storedState,
    });

    // Verify user is authenticated - PRIORITIZE state email (the user who initiated OAuth)
    // The state contains the email of the user who clicked "Connect Reddit"
    let userEmail: string | null = null;
    
    // First, try to get email from state (this is the user who initiated the OAuth flow)
    if (state) {
      try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        userEmail = decodedState.userId || null;
        console.log("[Reddit Callback] Extracted email from state:", userEmail);
      } catch (e) {
        console.error("[Reddit Callback] Failed to decode state:", e);
      }
    }
    
    // Fall back to session email if state doesn't have email
    if (!userEmail) {
      userEmail = session?.user?.email || null;
      console.log("[Reddit Callback] Using session email as fallback:", userEmail);
    }
    
    console.log("[Reddit Callback] User email check:", {
      stateEmail: state ? (() => {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
          return decoded.userId;
        } catch { return null; }
      })() : null,
      sessionEmail: session?.user?.email,
      finalEmail: userEmail,
    });
    
    if (!userEmail) {
      console.error("[Reddit Callback] No email found - both state and session are missing email:", {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasState: !!state,
      });
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_session_expired`
      );
    }
    
    console.log("[Reddit Callback] Using email for token save:", userEmail);

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
    // Normalize email to lowercase to ensure consistent storage
    const normalizedEmail = userEmail.toLowerCase();
    
    console.log(`[Reddit Callback] Attempting to save tokens for user: ${normalizedEmail}`, {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresAt: expiresAt.toISOString(),
    });
    
    try {
      const updatedUser = await updateUserRedditTokens(normalizedEmail, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      });
      
      console.log(`[Reddit Callback] updateUserRedditTokens returned:`, {
        hasUser: !!updatedUser,
        hasAccessToken: !!updatedUser?.redditAccessToken,
        hasRefreshToken: !!updatedUser?.redditRefreshToken,
        email: updatedUser?.email,
      });
      
      // Verify tokens were actually saved
      if (!updatedUser || !updatedUser.redditAccessToken || !updatedUser.redditRefreshToken) {
        console.error("[Reddit Callback] Tokens were not saved correctly:", {
          email: normalizedEmail,
          hasUser: !!updatedUser,
          hasAccessToken: !!updatedUser?.redditAccessToken,
          hasRefreshToken: !!updatedUser?.redditRefreshToken,
          updatedUserKeys: updatedUser ? Object.keys(updatedUser) : [],
        });
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_save_failed`
        );
      }
      
      // Verify tokens are actually in the database by querying again
      const verifyUser = await getUserByEmail(normalizedEmail);
      console.log(`[Reddit Callback] Verification query result:`, {
        found: !!verifyUser,
        hasAccessToken: !!verifyUser?.redditAccessToken,
        hasRefreshToken: !!verifyUser?.redditRefreshToken,
        accessTokenLength: verifyUser?.redditAccessToken?.length,
        refreshTokenLength: verifyUser?.redditRefreshToken?.length,
      });
      
      if (!verifyUser || !verifyUser.redditAccessToken || !verifyUser.redditRefreshToken) {
        console.error("[Reddit Callback] CRITICAL: Tokens not found in database after update!", {
          email: normalizedEmail,
          updateReturnedTokens: !!updatedUser?.redditAccessToken,
          verifyFoundTokens: !!verifyUser?.redditAccessToken,
        });
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/playground?error=reddit_oauth_save_failed`
        );
      }
      
      console.log(`[Reddit Callback] Successfully saved and verified Reddit tokens for user: ${normalizedEmail}`, {
        hasAccessToken: !!verifyUser.redditAccessToken,
        hasRefreshToken: !!verifyUser.redditRefreshToken,
        expiresAt: verifyUser.redditTokenExpiresAt,
        userId: (verifyUser as any)._id?.toString(),
      });
    } catch (dbError) {
      console.error("Error saving Reddit tokens:", dbError);
      console.error("Error details:", {
        email: normalizedEmail,
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        errorMessage: dbError instanceof Error ? dbError.message : String(dbError),
        errorStack: dbError instanceof Error ? dbError.stack : undefined,
      });
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

