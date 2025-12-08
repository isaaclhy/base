import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserByEmail } from "@/lib/db/users";
import { incrementCronUsage } from "@/lib/db/usage";
import { createCronRedditPost, getCronRedditPostByLinkAndUserEmail } from "@/lib/db/cron-reddit-posts";
import { getValidAccessToken } from "@/lib/reddit/auth";
import OpenAI from "openai";
import { google, customsearch_v1 } from "googleapis";

// Increase timeout for cron job (5 minutes)
export const maxDuration = 300;
// Force dynamic execution to prevent caching issues with Vercel cron jobs
export const dynamic = 'force-dynamic';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const customsearch = google.customsearch("v1");

interface CronRequestBody {
  userEmail?: string; // Optional: if provided, will use this user's product details
  productIdea?: string; // Optional: if provided, will use this instead of user's saved product details
  postCount?: number; // Optional: defaults to 20
  apiKey?: string; // Optional: for service-to-service authentication
}

function isRedditPostUrl(url: string) {
  return (
    /reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+(\/|$)/i.test(url) &&
    !/\/comment\//i.test(url)
  );
}

async function fetchGoogleCustomSearch(
  query: string,
  resultsPerQuery: number = 7
): Promise<customsearch_v1.Schema$Search[]> {
  const num = Math.min(resultsPerQuery, 10);
  
  const response = await customsearch.cse.list({
    auth: process.env.GCS_KEY,
    cx: "c691f007075074afc",
    q: query,
    num: num,
    start: 1,
  });

  const results = response.data;
  if (!results) {
    throw new Error("No data returned from Google Custom Search");
  }

  return [results];
}

async function fetchRedditPostContent(postUrl: string, accessToken?: string): Promise<any> {
  try {
    // Extract subreddit and post ID from URL (same as regular Reddit route)
    // Reddit URL format: https://www.reddit.com/r/{subreddit}/comments/{post_id}/...
    const urlMatch = postUrl.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
    if (!urlMatch) {
      console.error(`[Cron] Invalid Reddit URL format: ${postUrl}`);
      return null;
    }

    const [, subreddit, postId] = urlMatch;

    // Fetch from Reddit API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Use the correct endpoint with subreddit (same as regular Reddit route)
      const apiUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;
      
      // Try approach 1: Use OAuth token if available, otherwise minimal headers
      let response: Response;
      const headers: HeadersInit = {
        'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
        'Accept': '*/*',
      };
      
      // Add OAuth token if available (this should prevent 403 errors)
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      try {
        response = await fetch(apiUrl, {
          headers,
          cache: 'no-store',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`[Cron] Timeout fetching Reddit post content for ${postUrl}`);
          return null;
        }
        
        // Try approach 2: No custom headers (same as regular Reddit route)
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 10000);
        try {
          response = await fetch(apiUrl, {
            cache: 'no-store',
            signal: controller2.signal,
          });
          clearTimeout(timeoutId2);
          
          if (!response.ok) {
            if (response.status === 403) {
              console.error(`[Cron] Reddit blocked request (403 Forbidden) for ${postUrl} - likely rate limiting or IP blocking from Vercel`);
            } else {
              console.error(`[Cron] Failed to fetch Reddit post: HTTP ${response.status} for ${postUrl}`);
            }
            return null;
          }
        } catch (error2) {
          clearTimeout(timeoutId2);
          console.error(`[Cron] Error fetching Reddit post content for ${postUrl}:`, error2);
          return null;
        }
      }

      const data = await response.json();
      if (data && data[0] && data[0].data && data[0].data.children && data[0].data.children[0]) {
        return data[0].data.children[0].data;
      }
      console.error(`[Cron] Unexpected Reddit API response structure for ${postUrl}`);
      return null;
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error(`[Cron] Timeout fetching Reddit post content for ${postUrl}`);
      } else {
        console.error(`[Cron] Error fetching Reddit post content for ${postUrl}:`, fetchError);
      }
      return null;
    }
  } catch (error) {
    console.error(`[Cron] Error fetching Reddit post content for ${postUrl}:`, error);
    return null;
  }
}

// Handle GET requests from Vercel Cron (Vercel sends GET with authorization header)
export async function GET(request: NextRequest) {
  try {
    // Vercel automatically authenticates cron jobs
    // For manual triggers, we check for API key
    const authHeader = request.headers.get("authorization");
    
    // Allow the request if:
    // 1. It has an authorization header (Vercel's automatic cron sends one)
    // 2. OR it matches our API key (manual trigger)
    // 3. OR CRON_USER_EMAIL is set (configured for Vercel cron)
    const isValidManualTrigger = authHeader === `Bearer ${process.env.CRON_SECRET}` || 
                                  authHeader === `Bearer ${process.env.CRON_API_KEY}`;
    const hasVercelAuth = authHeader && authHeader.startsWith("Bearer");
    const isConfiguredForVercel = !!process.env.CRON_USER_EMAIL;
    
    if (!isValidManualTrigger && !hasVercelAuth && !isConfiguredForVercel) {
      console.log("[Cron] Unauthorized request - no valid auth header or API key");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (hasVercelAuth && !isValidManualTrigger) {
      console.log("[Cron] Request authenticated by Vercel (automatic cron)");
    }

    // Get parameters from query string or environment variables
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail") || process.env.CRON_USER_EMAIL;
    const postCount = parseInt(searchParams.get("postCount") || process.env.CRON_POST_COUNT || "20", 10);

    if (!userEmail) {
      return NextResponse.json(
        { error: "userEmail is required. Set CRON_USER_EMAIL environment variable or pass as query parameter." },
        { status: 400 }
      );
    }

    // Call the POST handler logic
    return await handleCronRequest(userEmail, undefined, postCount, process.env.CRON_API_KEY || "");
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Handle POST requests (manual calls or other services)
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const body: CronRequestBody = await request.json();
    const { userEmail, productIdea, postCount, apiKey } = body;

    // Authentication: either use session or API key
    let email: string | undefined;
    
    if (apiKey && apiKey === process.env.CRON_API_KEY) {
      // Service-to-service authentication
      if (!userEmail) {
        return NextResponse.json(
          { error: "userEmail is required when using API key authentication" },
          { status: 400 }
        );
      }
      email = userEmail;
    } else {
      // Session-based authentication
      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      email = session.user.email;
    }

    return await handleCronRequest(email, productIdea, postCount, apiKey);
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Shared logic for handling cron requests
async function handleCronRequest(
  email: string,
  productIdea: string | undefined,
  postCount: number | undefined,
  apiKey: string | undefined
): Promise<NextResponse> {
  try {
    console.log(`[Cron] Starting cron job for user: ${email}`);

    // Get user and product details
    console.log(`[Cron] Fetching user data...`);
    const dbUser = await getUserByEmail(email);
    if (!dbUser) {
      console.error(`[Cron] User not found: ${email}`);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get Reddit OAuth access token if available
    let redditAccessToken: string | undefined;
    try {
      if (dbUser.redditAccessToken) {
        redditAccessToken = await getValidAccessToken(email);
        console.log(`[Cron] Using Reddit OAuth token for authenticated requests`);
      } else {
        console.log(`[Cron] No Reddit OAuth token found - using unauthenticated requests (may get 403 errors)`);
      }
    } catch (tokenError) {
      console.error(`[Cron] Error getting Reddit access token:`, tokenError);
      // Continue without token - will try unauthenticated requests
    }

    // Determine product idea to use
    let productIdeaToUse: string;
    if (productIdea) {
      productIdeaToUse = productIdea;
    } else if (dbUser.productDetails?.productDescription) {
      productIdeaToUse = dbUser.productDetails.productDescription;
    } else {
      console.error(`[Cron] No product description found for user: ${email}`);
      return NextResponse.json(
        { error: "No product description found. Please provide productIdea or save product details in the Product tab." },
        { status: 400 }
      );
    }

    const count = postCount || 20;
    console.log(`[Cron] Target post count: ${count}`);

    // Step 1: Generate search queries
    const RESULTS_PER_QUERY = 7;
    const queriesNeeded = Math.ceil((count / RESULTS_PER_QUERY) * 1.3);
    const queryCount = Math.min(queriesNeeded, 20);
    console.log(`[Cron] Generating ${queryCount} search queries...`);

    const response1 = await (openaiClient as any).responses.create({
      prompt: {
        id: "pmpt_69330a1b0d788197826b386ddc375be7015a3de39dafb3df",
        version: "4",
        variables: {
          gpt_query_completion_count: String(queryCount),
          productidea: productIdeaToUse,
        },
      },
    });

    if (response1.error) {
      console.error(`[Cron] OpenAI error:`, response1.error);
      return NextResponse.json(
        { error: response1.error?.message || "OpenAI error" },
        { status: 500 }
      );
    }

    const queries = JSON.parse(response1.output_text || "[]");
    console.log(`[Cron] Generated ${queries.length} queries for user ${email}`);

    // Step 2: Fetch Reddit links for each query
    const allRedditPosts: Array<{
      title?: string | null;
      link?: string | null;
      snippet?: string | null;
      selftext?: string | null;
      postData?: any;
    }> = [];

    console.log(`[Cron] Processing ${queries.length} queries...`);
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`[Cron] Processing query ${i + 1}/${queries.length}: "${query}"`);
      try {
        const googleDataArray = await fetchGoogleCustomSearch(query, RESULTS_PER_QUERY);
        const allItems = googleDataArray.flatMap((googleData) => googleData.items || []);

        const redditPosts = allItems
          .filter((data) => isRedditPostUrl(data.link ?? ""))
          .slice(0, RESULTS_PER_QUERY)
          .map((item) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
          }));

        // Step 3: Fetch full post content for each Reddit post
        console.log(`[Cron] Found ${redditPosts.length} Reddit posts from query "${query}", fetching content...`);
        for (let j = 0; j < redditPosts.length; j++) {
          const post = redditPosts[j];
          if (post.link) {
            console.log(`[Cron] Fetching content for post ${j + 1}/${redditPosts.length}: ${post.link}`);
            
            // Extract postId from URL
            const urlMatch = post.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
            const postId = urlMatch ? urlMatch[2] : null;
            
            // Add delay between requests to avoid rate limiting (1 second delay)
            if (j > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            const postContent = await fetchRedditPostContent(post.link, redditAccessToken);
            if (postContent) {
              allRedditPosts.push({
                ...post,
                selftext: postContent.selftext || null,
                postData: {
                  id: postId || postContent.id || null,
                  created_utc: postContent.created_utc,
                  subreddit: postContent.subreddit,
                  author: postContent.author,
                },
              });
            } else {
              // Even if postContent fetch fails, we can still store the postId we extracted from URL
              console.log(`[Cron] Failed to fetch content for ${post.link}, storing post without content`);
              allRedditPosts.push({
                ...post,
                postData: postId ? { id: postId } : undefined,
              });
            }
          }
        }
      } catch (error) {
        console.error(`[Cron] Error processing query "${query}":`, error);
        // Continue with other queries
      }
    }

    // Remove duplicates based on link
    const uniquePosts = Array.from(
      new Map(allRedditPosts.map((post) => [post.link, post])).values()
    ).slice(0, count);
    console.log(`[Cron] Found ${allRedditPosts.length} total posts, ${uniquePosts.length} unique posts after deduplication`);

    // Generate a unique cron run ID for this execution
    const cronRunId = `cron_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[Cron] Saving ${uniquePosts.length} posts to database with cronRunId: ${cronRunId}`);

    // Save all found posts to the cronRedditPost collection
    const savedPosts: string[] = [];
    const skippedPosts: string[] = [];
    for (let i = 0; i < uniquePosts.length; i++) {
      const post = uniquePosts[i];
      console.log(`[Cron] Checking post ${i + 1}/${uniquePosts.length} for duplicates...`);
      
      if (!post.link) {
        console.log(`[Cron] Skipping post ${i + 1} - no link`);
        continue;
      }

      try {
        // Check if post already exists for this user
        const existingPost = await getCronRedditPostByLinkAndUserEmail(post.link, email);
        if (existingPost) {
          console.log(`[Cron] Post already exists for user ${email}: ${post.link} - skipping`);
          skippedPosts.push(post.link);
          continue;
        }

        // Find which query was used to find this post
        // Since we process queries sequentially, we'll use the query that generated results
        // For simplicity, we'll use the first query, but you could track this more precisely
        const matchingQuery = queries[0] || "unknown";

        console.log(`[Cron] Saving post ${i + 1}/${uniquePosts.length} to database...`);
        await createCronRedditPost({
          userEmail: email,
          query: matchingQuery,
          title: post.title || null,
          link: post.link || null,
          snippet: post.snippet || null,
          selftext: post.selftext || null,
          postData: post.postData || null,
          cronRunId,
        });
        savedPosts.push(post.link);
      } catch (saveError) {
        console.error(`[Cron] Error saving post ${post.link} to cronRedditPost collection:`, saveError);
        // Continue saving other posts even if one fails
      }
    }

    // Increment cron usage separately (does not affect regular usage limits)
    console.log(`[Cron] Incrementing cron usage count by ${uniquePosts.length}...`);
    try {
      await incrementCronUsage(email, uniquePosts.length);
    } catch (usageError) {
      console.error("[Cron] Error incrementing cron usage:", usageError);
      // Continue even if usage increment fails
    }

    console.log(`[Cron] Cron job completed successfully for user ${email}`);
    return NextResponse.json({
      success: true,
      message: `Found ${uniquePosts.length} Reddit posts, saved ${savedPosts.length} new posts, skipped ${skippedPosts.length} duplicates`,
      posts: uniquePosts,
      queriesUsed: queries.length,
      postsFound: uniquePosts.length,
      postsSaved: savedPosts.length,
      postsSkipped: skippedPosts.length,
      cronRunId,
    });
  } catch (err: unknown) {
    console.error("[Cron] Fatal error in cron job:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[Cron] Error stack:", errorStack);
    return NextResponse.json(
      { error: errorMessage, stack: errorStack },
      { status: 500 }
    );
  }
}


