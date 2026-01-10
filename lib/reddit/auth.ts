import { getUserByEmail, updateUserRedditTokens } from "@/lib/db/users";

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || "";
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || "";

export async function refreshAccessToken(userId: string): Promise<string> {
  // Check Reddit OAuth credentials are configured
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error("Reddit OAuth credentials not configured. REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set in environment variables.");
  }

  const user = await getUserByEmail(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.redditRefreshToken) {
    throw new Error("No refresh token stored. Please connect your Reddit account in the app.");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", user.redditRefreshToken);

  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
    },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error("Failed to refresh Reddit token:", errorText);
    let errorMessage = "Failed to refresh token";
    
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error) {
        errorMessage = `Failed to refresh token: ${errorData.error}${errorData.error_description ? ` - ${errorData.error_description}` : ''}`;
      }
    } catch {
      // If parsing fails, use the raw error text if available
      if (errorText) {
        errorMessage = `Failed to refresh token: ${errorText}`;
      }
    }
    
    throw new Error(errorMessage);
  }

  const tokenData = await tokenRes.json();

  // Update user with new access token
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

  await updateUserRedditTokens(userId, {
    accessToken: tokenData.access_token,
    refreshToken: user.redditRefreshToken, // Refresh token doesn't change
    expiresAt,
  });

  return tokenData.access_token;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const user = await getUserByEmail(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.redditAccessToken) {
    throw new Error("No access token stored. Please connect your Reddit account.");
  }

  // Check if token is expired or will expire soon (within 5 minutes)
  if (user.redditTokenExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(user.redditTokenExpiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (timeUntilExpiry < fiveMinutes) {
      // Token is expired or expiring soon, refresh it
      return await refreshAccessToken(userId);
    }
  }

  return user.redditAccessToken;
}

