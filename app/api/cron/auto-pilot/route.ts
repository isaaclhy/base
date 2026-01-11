import { NextRequest, NextResponse } from "next/server";
import { getUsersWithAutoPilotEnabled } from "@/lib/db/users";
import { refreshAccessToken } from "@/lib/reddit/auth";
import OpenAI from "openai";
import { google } from "googleapis";
import { RedditPost } from "@/lib/types";
import { getSubredditRule, upsertSubredditRule } from "@/lib/db/subreddit-rules";
import { createPost } from "@/lib/db/posts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

const customsearch = google.customsearch("v1");

// Verify the request is from GitHub Actions using a secret token
function verifyRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET_TOKEN;
  
  if (!expectedToken) {
    console.warn("[Auto-Pilot Cron] CRON_SECRET_TOKEN not set in environment");
    return false;
  }
  
  return authHeader === `Bearer ${expectedToken}`;
}

// Helper function to normalize URLs
function normalizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  return url
    .split('?')[0]
    .replace(/\/$/, '')
    .toLowerCase();
}

// Helper function to extract Reddit post ID
function extractRedditPostId(url: string): string | null {
  try {
    const match = url.match(/\/comments\/([a-z0-9]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Helper function to check if URL is a Reddit post
function isRedditPostUrl(url: string): boolean {
  return (
    /reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+(\/|$)/i.test(url) &&
    !/\/comment\//i.test(url)
  );
}

// Expand keywords using similar-keywords API logic
async function expandKeywords(keywords: string[]): Promise<string[]> {
  const allKeywordsSet = new Set<string>();
  keywords.forEach(k => allKeywordsSet.add(k.toLowerCase().trim()));

  await Promise.all(
    keywords.map(async (keyword) => {
      try {
        const response = await (openai as any).responses.create({
          prompt: {
            "id": "pmpt_69595a4f01d081968bea5541c68db1a807f9fc92d8163019",
            "version": "2",
            "variables": {
              "keyword": keyword
            }
          }
        });

        if (response.error) {
          console.error(`[Auto-Pilot] Error expanding keyword "${keyword}":`, response.error);
          return;
        }

        const output = response.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
        
        try {
          const parsed = JSON.parse(output);
          const similarKeywords = Array.isArray(parsed) ? parsed : (parsed.keywords || []);
          // Limit to only 2 extra keywords for auto-pilot cron job
          const limitedKeywords = similarKeywords.slice(0, 2);
          limitedKeywords.forEach((k: string) => allKeywordsSet.add(k.toLowerCase().trim()));
          console.log(`[Auto-Pilot] Expanded keyword "${keyword}" to ${limitedKeywords.length} similar keywords (limited from ${similarKeywords.length})`);
        } catch (parseError) {
          console.error(`[Auto-Pilot] Error parsing similar keywords for "${keyword}":`, parseError);
        }
      } catch (err) {
        console.error(`[Auto-Pilot] Error expanding keyword "${keyword}":`, err);
      }
    })
  );

  return Array.from(allKeywordsSet);
}

// Google Custom Search (same as sync leads)
async function fetchGoogleSearch(query: string, resultsPerQuery: number = 20): Promise<any[]> {
  const maxPerRequest = 10;
  const totalResults = Math.min(resultsPerQuery, 20);
  const requestsNeeded = Math.ceil(totalResults / maxPerRequest);
  const allResults: any[] = [];
  
  for (let i = 0; i < requestsNeeded; i++) {
    const startIndex = i * maxPerRequest + 1;
    const numResults = Math.min(maxPerRequest, totalResults - (i * maxPerRequest));
    
    try {
      // Use d1 (past 24 hours) since Google API doesn't support 6 hours
      // We'll filter to 6 hours later using Reddit post timestamps
      const response = await customsearch.cse.list({
        auth: process.env.GCS_KEY,
        cx: "84be52ff9627b480b",
        q: query,
        num: numResults,
        start: startIndex,
        dateRestrict: "d1", // Past 24 hours (will filter to 12 hours later)
      });
      
      if (response.data.items) {
        allResults.push(...response.data.items);
      }
    } catch (error) {
      console.error(`[Auto-Pilot] Error fetching Google search for query "${query}":`, error);
    }
  }
  
  return allResults
    .filter((item) => isRedditPostUrl(item.link ?? ""))
    .map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));
}

// Rate limiter class to track and respect Reddit's rate limits
class RedditRateLimiter {
  private remaining: number = 60; // Default: Reddit allows ~60 requests per minute
  private resetTime: number = Date.now() + 60000; // Default: reset in 60 seconds
  private minDelay: number = 1000; // Minimum 1 second between requests
  private lastRequestTime: number = 0;

  // Parse rate limit headers from Reddit API response
  updateFromHeaders(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    
    if (remaining !== null) {
      this.remaining = parseInt(remaining, 10);
    }
    
    if (reset !== null) {
      // Reset time is in seconds, convert to milliseconds
      this.resetTime = parseInt(reset, 10) * 1000;
    }
  }

  // Calculate how long to wait before next request
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // If we've used up our quota, wait until reset
    if (this.remaining <= 0) {
      const waitTime = Math.max(0, this.resetTime - now);
      if (waitTime > 0) {
        console.log(`[Rate Limiter] Quota exhausted. Waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.remaining = 60; // Reset quota after waiting
      }
    }
    
    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Adaptive delay: if remaining is low, slow down more
    if (this.remaining < 10) {
      const adaptiveDelay = (10 - this.remaining) * 200; // Up to 2s extra delay
      await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Decrement remaining count after successful request
  decrement() {
    if (this.remaining > 0) {
      this.remaining--;
    }
  }

  getRemaining(): number {
    return this.remaining;
  }
}

// Fetch Reddit posts from subreddits (same as sync leads)
async function fetchSubredditPosts(
  keyword: string,
  subreddit: string,
  limit: number,
  accessToken: string,
  rateLimiter: RedditRateLimiter,
  retryCount: number = 0
): Promise<any[]> {
  try {
    // Wait if needed based on rate limits
    await rateLimiter.waitIfNeeded();
    
    const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}&t=week&restrict_sr=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      cache: 'no-store'
    });

    // Update rate limiter from response headers
    rateLimiter.updateFromHeaders(response.headers);
    rateLimiter.decrement();

    if (response.status === 429) {
      // Rate limited - retry with exponential backoff
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s (longer waits)
        console.warn(`[Auto-Pilot] Rate limited (429) for r/${subreddit} keyword "${keyword}". Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries}). Remaining quota: ${rateLimiter.getRemaining()}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchSubredditPosts(keyword, subreddit, limit, accessToken, rateLimiter, retryCount + 1);
      } else {
        console.error(`[Auto-Pilot] Rate limited (429) for r/${subreddit} keyword "${keyword}". Max retries reached. Skipping.`);
        return [];
      }
    }

    if (!response.ok) {
      console.error(`[Auto-Pilot] Error fetching posts from r/${subreddit} for keyword "${keyword}": ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: RedditPost[] = data.data?.children?.map((child: any) => child.data) || [];
    
    // Filter to past 6 hours (not 4 days like sync leads)
    const sixHoursAgo = Math.floor(Date.now() / 1000) - (6 * 60 * 60);
    const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= sixHoursAgo);
    
    return recentPosts.slice(0, limit).map((post: RedditPost) => ({
      title: post.title,
      link: `https://www.reddit.com${post.permalink}`,
      snippet: post.selftext?.substring(0, 200) || post.title,
      selftext: post.selftext || null,
      postData: post,
    }));
  } catch (error) {
    console.error(`[Auto-Pilot] Error fetching posts from r/${subreddit} for keyword "${keyword}":`, error);
    return [];
  }
}

// Batch fetch Reddit post data (same as sync leads)
async function batchFetchPostData(
  postIds: string[],
  accessToken: string
): Promise<Map<string, RedditPost>> {
  const postDataMap = new Map<string, RedditPost>();
  
  if (postIds.length === 0) return postDataMap;

  const BATCH_SIZE = 95;
  const batches: string[][] = [];
  
  for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
    batches.push(postIds.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const postIdsString = batch.join(",");
        const response = await fetch(
          `https://oauth.reddit.com/api/info.json?id=${postIdsString}`,
          {
            headers: {
              "User-Agent": "comment-tool/0.1 by isaaclhy13",
              "Accept": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const posts = data.data?.children || [];
          
          posts.forEach((child: { data: RedditPost }) => {
            const post: RedditPost = child.data;
            // Extract post ID from permalink (format: /r/subreddit/comments/{postId}/...)
            const permalinkMatch = post.permalink?.match(/\/comments\/([a-z0-9]+)/i);
            if (permalinkMatch && permalinkMatch[1]) {
              const postId = permalinkMatch[1];
              postDataMap.set(postId, post);
            }
          });
        }
      } catch (error) {
        console.error(`[Auto-Pilot] Error fetching batch post data:`, error);
      }
    })
  );

  return postDataMap;
}

// Filter titles using OpenAI (same as sync leads)
async function filterTitles(
  posts: Array<{ id: string; title: string }>,
  productDescription: string
): Promise<Map<string, string>> {
  const verdictMap = new Map<string, string>();
  
  if (posts.length === 0) return verdictMap;

  const BATCH_SIZE = 100;
  const batches: Array<typeof posts> = [];
  
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    batches.push(posts.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const response = await (openai as any).responses.create({
          prompt: {
            "id": "pmpt_695aa3d82c0c8190bac1998da046cd5c0e429183fd7f88be",
            "version": "9",
            "variables": {
              "product": productDescription,
              "posts": JSON.stringify(batch.map(p => ({ id: p.id, title: p.title })))
            }
          },
          max_output_tokens: 25000
        });

        if (response.error) {
          console.error('[Auto-Pilot] OpenAI filter error:', response.error);
          batch.forEach(post => verdictMap.set(post.id, 'NO'));
          return;
        }

        let output: string;
        try {
          if (response.output && Array.isArray(response.output)) {
            const message = response.output.find((res: any) => res.type === 'message');
            if (message && message.content && Array.isArray(message.content)) {
              const outputText = message.content.find((res: any) => res.type === 'output_text');
              if (outputText && outputText.text) {
                output = outputText.text;
              } else {
                throw new Error('Could not find output_text');
              }
            } else {
              throw new Error('Could not find message');
            }
          } else {
            throw new Error('Invalid response structure');
          }
        } catch (parseError) {
          console.error('[Auto-Pilot] Error parsing OpenAI response:', parseError);
          batch.forEach(post => verdictMap.set(post.id, 'NO'));
          return;
        }

        try {
          const parsed = JSON.parse(output);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              if (item.id && item.verdict) {
                verdictMap.set(item.id, item.verdict.toUpperCase());
              }
            });
          }
        } catch (parseError) {
          console.error('[Auto-Pilot] Error parsing filter results:', parseError);
          batch.forEach(post => verdictMap.set(post.id, 'NO'));
        }

        // Default missing posts to NO
        batch.forEach(post => {
          if (!verdictMap.has(post.id)) {
            verdictMap.set(post.id, 'NO');
          }
        });
      } catch (error) {
        console.error('[Auto-Pilot] Error filtering titles:', error);
        batch.forEach(post => verdictMap.set(post.id, 'NO'));
      }
    })
  );

  return verdictMap;
}

// Process auto-pilot for a single user (exactly like sync leads, but 6 hours filter)
async function processUserAutoPilot(user: any): Promise<{ success: boolean; yesPosts: number; yesPostsList: any[]; posted: number; failed: number; error?: string }> {
  try {
    console.log(`[Auto-Pilot] Processing user: ${user.email}`);
    
    // Get user data
    const keywords = user.keywords || [];
    const subreddits = user.subreddits || [];
    const productDescription = user.productDetails?.productDescription || "";
    
    if (keywords.length === 0) {
      console.log(`[Auto-Pilot] User ${user.email} has no keywords, skipping`);
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No keywords" };
    }
    
    if (!productDescription) {
      console.log(`[Auto-Pilot] User ${user.email} has no product description, skipping`);
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No product description" };
    }

    // Check if user has product link
    const productLink = user.productDetails?.link || "";
    if (!productLink) {
      console.log(`[Auto-Pilot] User ${user.email} has no product link, skipping`);
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No product link" };
    }

    // Check Reddit authentication - verify we can refresh the token before starting any work
    // This ensures the user has connected their Reddit account and has a valid refresh token
    let validAccessToken: string;
    try {
      console.log(`[Auto-Pilot] User ${user.email}: Verifying Reddit authentication...`);
      validAccessToken = await refreshAccessToken(user.email);
      console.log(`[Auto-Pilot] User ${user.email}: Reddit authentication verified, token refreshed successfully`);
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Failed to refresh token";
      console.error(`[Auto-Pilot] User ${user.email}: Reddit authentication failed:`, errorMessage);
      return { 
        success: false, 
        yesPosts: 0, 
        yesPostsList: [], 
        posted: 0, 
        failed: 0, 
        error: `Reddit authentication failed: ${errorMessage}. Please connect your Reddit account in the app.` 
      };
    }

    // Step 1: Expand keywords (same as sync leads)
    const expandedKeywords = await expandKeywords(keywords);
    console.log(`[Auto-Pilot] User ${user.email}: Expanded ${keywords.length} keywords to ${expandedKeywords.length}`);

    // Step 2: Google Custom Search (same as sync leads)
    const allGoogleResults: any[] = [];
    await Promise.all(
      expandedKeywords.map(async (keyword) => {
        try {
          const results = await fetchGoogleSearch(keyword, 20);
          results.forEach(result => {
            allGoogleResults.push({ ...result, keyword });
          });
        } catch (error) {
          console.error(`[Auto-Pilot] Error fetching Google results for keyword "${keyword}":`, error);
        }
      })
    );
    
    console.log(`[Auto-Pilot] User ${user.email}: Found ${allGoogleResults.length} Google search results`);

    // Step 2.5: Subreddit search (same as sync leads)
    // Use rate limiter to intelligently manage API calls
    const allSubredditResults: any[] = [];
    if (subreddits && subreddits.length > 0) {
      // Create a rate limiter for this user's requests
      const rateLimiter = new RedditRateLimiter();
      
      const totalRequests = expandedKeywords.length * (subreddits as string[]).length;
      console.log(`[Auto-Pilot] User ${user.email}: Starting ${totalRequests} subreddit searches with rate limiting...`);
      
      let requestCount = 0;
      for (const keyword of expandedKeywords) {
        for (const subreddit of subreddits as string[]) {
          requestCount++;
          try {
            if (requestCount % 10 === 0) {
              console.log(`[Auto-Pilot] User ${user.email}: Progress ${requestCount}/${totalRequests} (${rateLimiter.getRemaining()} requests remaining in quota)`);
            }
            
            const results = await fetchSubredditPosts(keyword, subreddit, 30, validAccessToken, rateLimiter);
            results.forEach(result => {
              allSubredditResults.push({ ...result, keyword, subreddit });
            });
          } catch (error) {
            console.error(`[Auto-Pilot] Error fetching subreddit results for "${keyword}" in r/${subreddit}:`, error);
          }
        }
      }
      
      console.log(`[Auto-Pilot] User ${user.email}: Completed ${totalRequests} subreddit searches. Final quota: ${rateLimiter.getRemaining()}`);
    }
    
    console.log(`[Auto-Pilot] User ${user.email}: Found ${allSubredditResults.length} subreddit search results`);

    // Combine all results
    const allResults = [...allGoogleResults, ...allSubredditResults];

    // Step 3: Deduplicate by URL (same as sync leads)
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter(result => {
      const normalized = normalizeUrl(result.link);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    });

    console.log(`[Auto-Pilot] User ${user.email}: ${uniqueResults.length} unique results after deduplication`);

    // Step 4: Extract post IDs and batch fetch post data (same as sync leads)
    const postIds: string[] = [];
    const urlToPostId = new Map<string, string>();
    
    uniqueResults.forEach(result => {
      const postId = extractRedditPostId(result.link || "");
      if (postId) {
        postIds.push(`t3_${postId}`);
        urlToPostId.set(normalizeUrl(result.link || ""), postId);
      }
    });

    console.log(`[Auto-Pilot] User ${user.email}: Fetching post data for ${postIds.length} posts`);

    const postDataMap = await batchFetchPostData(postIds, validAccessToken);

    // Step 5: Filter to past 6 hours and build filter array (same as sync leads, but 6 hours filter)
    const sixHoursAgo = Math.floor(Date.now() / 1000) - (6 * 60 * 60);
    const postsToFilter: Array<{ id: string; title: string; url: string }> = [];
    const seenPostIds = new Set<string>();

    uniqueResults.forEach(result => {
      if (!result.link) return;
      
      const normalizedUrl = normalizeUrl(result.link);
      const postId = urlToPostId.get(normalizedUrl);
      if (!postId) return;

      if (seenPostIds.has(postId)) return;
      seenPostIds.add(postId);

      // Get post data from map
      const postData = postDataMap.get(postId);
      
      // Filter: only include posts from the past 6 hours
      if (postData) {
        const postCreatedUtc = postData.created_utc || 0;
        if (postCreatedUtc < sixHoursAgo) {
          return; // Skip posts older than 6 hours
        }
        
        const title = postData.title || result.title || "";
        if (title) {
          postsToFilter.push({
            id: postId,
            title: title,
            url: result.link || "",
          });
        }
      } else {
        // If we don't have post data, try to use result data
        if (result.postData && result.postData.created_utc >= sixHoursAgo) {
          const title = result.postData.title || result.title || "";
          if (title) {
            postsToFilter.push({
              id: postId,
              title: title,
              url: result.link || "",
            });
          }
        }
      }
    });

        console.log(`[Auto-Pilot] User ${user.email}: ${postsToFilter.length} posts to filter (past 6 hours)`);

    // Step 6: Filter titles using OpenAI (same as sync leads)
    if (postsToFilter.length > 0) {
      const verdictMap = await filterTitles(
        postsToFilter.map(p => ({ id: p.id, title: p.title })),
        productDescription
      );

      // Step 7: Only keep YES posts (not MAYBE or NO)
      const yesPosts = postsToFilter.filter(p => {
        const verdict = verdictMap.get(p.id);
        return verdict === "YES";
      });

      console.log(`[Auto-Pilot] User ${user.email}: ${yesPosts.length} YES posts out of ${postsToFilter.length} total posts`);

      if (yesPosts.length === 0) {
        console.log(`[Auto-Pilot] User ${user.email}: No YES posts found`);
        return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0 };
      }

      // Step 8: Generate and post comments for YES posts
      const productBenefits = user.productDetails?.productBenefits || "";
      let postedCount = 0;
      let failedCount = 0;
      const postedPosts: any[] = [];
      const failedPosts: any[] = [];

      for (const yesPost of yesPosts) {
        try {
          // Get full post data
          let fullPostData = postDataMap.get(yesPost.id);
          
          // If not found, try to fetch it individually
          if (!fullPostData) {
            console.warn(`[Auto-Pilot] User ${user.email}: No post data for ${yesPost.id} in batch, trying to fetch individually...`);
            try {
              const individualResponse = await fetch(
                `https://oauth.reddit.com/api/info.json?id=t3_${yesPost.id}`,
                {
                  headers: {
                    "User-Agent": "comment-tool/0.1 by isaaclhy13",
                    "Accept": "application/json",
                    "Authorization": `Bearer ${validAccessToken}`,
                  },
                }
              );
              
              if (individualResponse.ok) {
                const individualData = await individualResponse.json();
                const individualPosts = individualData.data?.children || [];
                if (individualPosts.length > 0 && individualPosts[0].data) {
                  fullPostData = individualPosts[0].data as RedditPost;
                  postDataMap.set(yesPost.id, fullPostData); // Cache it
                  console.log(`[Auto-Pilot] User ${user.email}: Successfully fetched post data for ${yesPost.id}`);
                }
              }
            } catch (fetchError) {
              console.error(`[Auto-Pilot] User ${user.email}: Error fetching individual post ${yesPost.id}:`, fetchError);
            }
          }
          
          if (!fullPostData) {
            console.warn(`[Auto-Pilot] User ${user.email}: No post data for ${yesPost.id} after individual fetch, skipping`);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "No post data" });
            continue;
          }

          // Extract subreddit name
          let subredditName: string | undefined = undefined;
          if (fullPostData.subreddit) {
            subredditName = fullPostData.subreddit;
          } else if (fullPostData.subreddit_name_prefixed) {
            subredditName = fullPostData.subreddit_name_prefixed.replace(/^r\//, "");
          } else if (yesPost.url) {
            const subredditMatch = yesPost.url.match(/reddit\.com\/r\/([^/]+)/);
            if (subredditMatch) {
              subredditName = subredditMatch[1];
            }
          }

          // Check subreddit promotion status (with full flow: cache -> Reddit API -> OpenAI -> save)
          let allowPromoting = "true"; // Default to true if no rules found
          if (subredditName) {
            try {
              const cleanSubredditName = subredditName.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
              
              // Step 1: Check database cache first
              let subredditRule = await getSubredditRule(cleanSubredditName);
              
              if (subredditRule && typeof subredditRule.allowPromoting === 'boolean') {
                // Found cached result, use it
                allowPromoting = subredditRule.allowPromoting ? "true" : "false";
                console.log(`[Auto-Pilot] User ${user.email}: Using cached rule for r/${cleanSubredditName}: ${allowPromoting}`);
              } else {
                // Step 2: No cached result, fetch from Reddit API
                console.log(`[Auto-Pilot] User ${user.email}: No cached rule for r/${cleanSubredditName}, fetching from Reddit API...`);
                
                try {
                  const rulesResponse = await fetch(
                    `https://oauth.reddit.com/r/${cleanSubredditName}/about/rules.json`,
                    {
                      headers: {
                        "User-Agent": "comment-tool/0.1 by isaaclhy13",
                        "Accept": "application/json",
                        "Authorization": `Bearer ${validAccessToken}`,
                      },
                      cache: "no-store",
                    }
                  );

                  if (rulesResponse.ok) {
                    const rulesData = await rulesResponse.json();
                    
                    // Step 3: Extract rule descriptions and combine them
                    const allRules = rulesData.rules || [];
                    const rulesText = allRules
                      .map((rule: any) => rule.description || "")
                      .filter((desc: string) => desc.trim().length > 0)
                      .join("\n\n");
                    
                    if (!rulesText || rulesText.trim().length === 0) {
                      // No rules found - default to allowing promotion
                      console.log(`[Auto-Pilot] User ${user.email}: No rules found for r/${cleanSubredditName}, defaulting to allow promotion`);
                      allowPromoting = "true";
                      
                      // Save default result to database
                      try {
                        await upsertSubredditRule(cleanSubredditName, true);
                      } catch (saveError) {
                        console.error(`[Auto-Pilot] Error saving default rule for r/${cleanSubredditName}:`, saveError);
                      }
                    } else {
                      // Step 4: Send to OpenAI to check rules
                      console.log(`[Auto-Pilot] User ${user.email}: Checking rules with OpenAI for r/${cleanSubredditName}...`);
                      
                      const checkResponse = await (openai as any).responses.create({
                        prompt: {
                          "id": "pmpt_69604849cd108197bb3a470f1315349e0ab1f2ccb34665ea",
                          "version": "4",
                          "variables": {
                            "rules": rulesText.trim()
                          }
                        }
                      });

                      if (checkResponse.error) {
                        console.error(`[Auto-Pilot] OpenAI error checking rules for r/${cleanSubredditName}:`, checkResponse.error);
                        // Default to true on error
                        allowPromoting = "true";
                      } else {
                        // Extract output from OpenAI response
                        let output: string;
                        try {
                          if ((checkResponse as any).output_text) {
                            output = (checkResponse as any).output_text;
                          } else if ((checkResponse as any).output && Array.isArray((checkResponse as any).output)) {
                            const messageContent = (checkResponse as any).output.find((item: any) => item.type === 'message')?.content;
                            if (messageContent && Array.isArray(messageContent)) {
                              const outputTextContent = messageContent.find((item: any) => item.type === 'output_text');
                              if (outputTextContent) {
                                output = outputTextContent.text;
                              } else {
                                output = messageContent.map((item: any) => item.text || item.content).join('\n');
                              }
                            } else {
                              output = JSON.stringify(checkResponse.output);
                            }
                          } else {
                            output = JSON.stringify(checkResponse);
                          }
                        } catch (parseError) {
                          console.error(`[Auto-Pilot] Error parsing OpenAI response for r/${cleanSubredditName}:`, parseError);
                          output = "YES"; // Default to YES on parse error
                        }

                        // Parse and normalize the output to YES or NO
                        const normalizedOutput = output.trim().toUpperCase();
                        let allowsPromotion: boolean;
                        
                        if (normalizedOutput === 'YES' || normalizedOutput.startsWith('YES')) {
                          allowsPromotion = true;
                        } else if (normalizedOutput === 'NO' || normalizedOutput.startsWith('NO')) {
                          allowsPromotion = false;
                        } else {
                          // If the response is not clearly YES or NO, default to false for safety
                          console.warn(`[Auto-Pilot] Unexpected OpenAI response for r/${cleanSubredditName}: "${output}". Defaulting to NO.`);
                          allowsPromotion = false;
                        }

                        allowPromoting = allowsPromotion ? "true" : "false";
                        console.log(`[Auto-Pilot] User ${user.email}: OpenAI verdict for r/${cleanSubredditName}: ${allowPromoting}`);

                        // Step 5: Save the result to database
                        try {
                          await upsertSubredditRule(cleanSubredditName, allowsPromotion);
                          console.log(`[Auto-Pilot] User ${user.email}: Saved rule for r/${cleanSubredditName} to database`);
                        } catch (saveError) {
                          console.error(`[Auto-Pilot] Error saving rule for r/${cleanSubredditName}:`, saveError);
                        }
                      }
                    }
                  } else {
                    // Reddit API error - default to true
                    console.error(`[Auto-Pilot] Reddit API error for r/${cleanSubredditName}: ${rulesResponse.status}`);
                    allowPromoting = "true";
                  }
                } catch (fetchError) {
                  console.error(`[Auto-Pilot] Error fetching rules from Reddit API for r/${cleanSubredditName}:`, fetchError);
                  // Default to true on error
                  allowPromoting = "true";
                }
              }
            } catch (error) {
              console.error(`[Auto-Pilot] Error checking subreddit rule for r/${subredditName}:`, error);
              // Default to true on error
              allowPromoting = "true";
            }
          }

          // Generate comment
          const postContent = fullPostData.selftext || fullPostData.title || "";
          console.log(`[Auto-Pilot] User ${user.email}: Generating comment for post "${yesPost.title}"`);
          
          const commentResponse = await (openai as any).responses.create({
            prompt: {
              "id": "pmpt_694ff0c078ec8197ad0b92621f11735905afaefebad67788",
              "version": "8",
              "variables": {
                "content": postContent,
                "idea": productDescription,
                "benefits": productBenefits || "",
                "allowpromoting": allowPromoting
              }
            }
          });

          if (commentResponse.error) {
            console.error(`[Auto-Pilot] User ${user.email}: OpenAI error for post "${yesPost.title}":`, commentResponse.error);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: commentResponse.error.message });
            continue;
          }

          // Parse comment (handle both JSON and plain text responses)
          let commentText: string;
          try {
            const output = commentResponse.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
            
            // Try to parse as JSON first
            try {
              const parsed = JSON.parse(output);
              if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
                commentText = parsed.items[0];
              } else if (Array.isArray(parsed) && parsed.length > 0) {
                commentText = parsed[0];
              } else if (typeof parsed === 'string') {
                commentText = parsed;
              } else {
                // If parsing succeeds but format is unexpected, try to use output directly
                commentText = output;
              }
            } catch (jsonError) {
              // If JSON parsing fails, treat the output as plain text (single comment)
              console.log(`[Auto-Pilot] User ${user.email}: Comment output is not JSON, treating as plain text for post "${yesPost.title}"`);
              commentText = output;
            }
          } catch (parseError) {
            console.error(`[Auto-Pilot] User ${user.email}: Error extracting comment for post "${yesPost.title}":`, parseError);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Failed to extract comment" });
            continue;
          }

          if (!commentText || !commentText.trim()) {
            console.warn(`[Auto-Pilot] User ${user.email}: Empty comment generated for post "${yesPost.title}"`);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Empty comment" });
            continue;
          }

          // Post comment to Reddit (using the token we refreshed at the start)
          const thingId = `t3_${yesPost.id}`;
          
          console.log(`[Auto-Pilot] User ${user.email}: Posting comment to Reddit for post "${yesPost.title}"`);
          
          const postResponse = await fetch("https://oauth.reddit.com/api/comment", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${validAccessToken}`,
              "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              thing_id: thingId,
              text: commentText.trim(),
            }).toString(),
          });

          // Parse response body (can only be read once)
          const postResponseData = await postResponse.json().catch(() => null);
          
          if (!postResponse.ok) {
            const errorData = postResponseData || { error: postResponse.statusText };
            console.error(`[Auto-Pilot] User ${user.email}: Failed to post comment for "${yesPost.title}":`, errorData);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: errorData.error || postResponse.statusText });
            
            // Save failed post to database
            try {
              await createPost({
                userId: user.email,
                status: "failed",
                query: `auto-pilot-${new Date().toISOString()}`,
                title: yesPost.title,
                link: yesPost.url,
                snippet: null,
                selftext: fullPostData.selftext || null,
                postData: fullPostData,
                comment: commentText.trim(),
                notes: `Auto-pilot failed: ${errorData.error || postResponse.statusText}`,
                autoPilot: true,
              });
            } catch (dbError) {
              console.error(`[Auto-Pilot] User ${user.email}: Error saving failed post to database:`, dbError);
            }
            continue;
          }

          // Reddit API can return different response formats:
          // 1. Standard: { json: { errors: [...], data: {...} } }
          // 2. jQuery format: { success: true, jquery: [...] } - means comment was posted successfully
          // 3. Error format: { json: { errors: [...] } }
          
          if (!postResponseData) {
            console.error(`[Auto-Pilot] User ${user.email}: Failed to parse Reddit API response for "${yesPost.title}"`);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Failed to parse Reddit API response" });
            
            // Save failed post to database
            try {
              await createPost({
                userId: user.email,
                status: "failed",
                query: `auto-pilot-${new Date().toISOString()}`,
                title: yesPost.title,
                link: yesPost.url,
                snippet: null,
                selftext: fullPostData.selftext || null,
                postData: fullPostData,
                comment: commentText.trim(),
                notes: "Auto-pilot failed: Failed to parse Reddit API response",
                autoPilot: true,
              });
            } catch (dbError) {
              console.error(`[Auto-Pilot] User ${user.email}: Error saving failed post to database:`, dbError);
            }
            continue;
          }
          
          // Check for jQuery format response (success: true means comment was posted)
          if (postResponseData.success === true) {
            // Reddit returned success: true, which means the comment was posted successfully
            // Even though we can't extract the comment ID from jQuery format, we treat it as success
            console.log(`[Auto-Pilot] User ${user.email}: Successfully posted comment for "${yesPost.title}" (Reddit returned success: true)`);
            
            // Save successful post to database
            try {
              await createPost({
                userId: user.email,
                status: "posted",
                query: `auto-pilot-${new Date().toISOString()}`,
                title: yesPost.title,
                link: yesPost.url,
                snippet: null,
                selftext: fullPostData.selftext || null,
                postData: fullPostData,
                comment: commentText.trim(),
                notes: "Auto-pilot: Comment posted successfully (Reddit returned success: true)",
                autoPilot: true,
              });
            } catch (dbError) {
              console.error(`[Auto-Pilot] User ${user.email}: Error saving posted comment to database:`, dbError);
              // Don't fail the whole operation if DB save fails
            }
            
            postedCount++;
            postedPosts.push({ id: yesPost.id, title: yesPost.title, url: yesPost.url });
            continue;
          }
          
          // Check for errors in standard format
          if (postResponseData.json && postResponseData.json.errors && Array.isArray(postResponseData.json.errors) && postResponseData.json.errors.length > 0) {
            const errors = postResponseData.json.errors.map((err: any[]) => err.join(': ')).join('; ');
            console.error(`[Auto-Pilot] User ${user.email}: Reddit API returned errors for "${yesPost.title}":`, errors);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: `Reddit API error: ${errors}` });
            
            // Save failed post to database
            try {
              await createPost({
                userId: user.email,
                status: "failed",
                query: `auto-pilot-${new Date().toISOString()}`,
                title: yesPost.title,
                link: yesPost.url,
                snippet: null,
                selftext: fullPostData.selftext || null,
                postData: fullPostData,
                comment: commentText.trim(),
                notes: `Auto-pilot failed: Reddit API errors - ${errors}`,
                autoPilot: true,
              });
            } catch (dbError) {
              console.error(`[Auto-Pilot] User ${user.email}: Error saving failed post to database:`, dbError);
            }
            continue;
          }

          // Check if response contains data in standard format (successful comment creation)
          if (postResponseData.json && postResponseData.json.data) {
            // Extract comment ID from successful response
            const things = postResponseData.json.data?.things || [];
            const commentId = things[0]?.data?.name || null;
            console.log(`[Auto-Pilot] User ${user.email}: Successfully posted comment for "${yesPost.title}". Comment ID: ${commentId}`);
          } else {
            // Unknown response format - log it but don't fail (might still be successful)
            console.warn(`[Auto-Pilot] User ${user.email}: Unknown Reddit API response format for "${yesPost.title}":`, JSON.stringify(postResponseData).substring(0, 200));
            // Treat as success if we got 200 OK and no errors
            console.log(`[Auto-Pilot] User ${user.email}: Assuming comment posted successfully for "${yesPost.title}" (200 OK, no errors)`);
          }

          // Save successful post to database
          try {
            await createPost({
              userId: user.email,
              status: "posted",
              query: `auto-pilot-${new Date().toISOString()}`,
              title: yesPost.title,
              link: yesPost.url,
              snippet: null,
              selftext: fullPostData.selftext || null,
              postData: fullPostData,
              comment: commentText.trim(),
              notes: "Auto-pilot posted",
              autoPilot: true,
            });
          } catch (dbError) {
            console.error(`[Auto-Pilot] User ${user.email}: Error saving posted comment to database:`, dbError);
            // Don't fail the whole operation if DB save fails
          }

          postedCount++;
          postedPosts.push({ id: yesPost.id, title: yesPost.title, url: yesPost.url });
          console.log(`[Auto-Pilot] User ${user.email}: Successfully posted comment for "${yesPost.title}"`);

        } catch (error) {
          console.error(`[Auto-Pilot] User ${user.email}: Error processing post "${yesPost.title}":`, error);
          failedCount++;
          failedPosts.push({ 
            id: yesPost.id, 
            title: yesPost.title, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      console.log(`[Auto-Pilot] User ${user.email}: Posted ${postedCount} comments, failed ${failedCount}`);
      if (postedPosts.length > 0) {
        console.log(`[Auto-Pilot] User ${user.email} - Posted Comments:`, JSON.stringify(postedPosts, null, 2));
      }
      if (failedPosts.length > 0) {
        console.log(`[Auto-Pilot] User ${user.email} - Failed Posts:`, JSON.stringify(failedPosts, null, 2));
      }

      return { 
        success: true, 
        yesPosts: yesPosts.length, 
        yesPostsList: yesPosts.map(p => ({ id: p.id, title: p.title, url: p.url })),
        posted: postedCount,
        failed: failedCount
      };
    }

    return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0 };
  } catch (error) {
    console.error(`[Auto-Pilot] Error processing user ${user.email}:`, error);
    return { 
      success: false, 
      yesPosts: 0,
      yesPostsList: [],
      posted: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// Increase timeout for long-running cron job (max 300s on Hobby, 900s on Pro)
export const maxDuration = 300; // 5 minutes (Hobby plan limit)

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify the request is from GitHub Actions
    if (!verifyRequest(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[Auto-Pilot Cron] Starting auto-pilot cron job...");

    // Get all users with auto-pilot enabled
    const users = await getUsersWithAutoPilotEnabled();
    console.log(`[Auto-Pilot Cron] Found ${users.length} users with auto-pilot enabled`);

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with auto-pilot enabled",
        processed: 0,
      });
    }

    // Process each user sequentially to avoid rate limiting
    // Add delay between users to respect Reddit's rate limits
    const results = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[Auto-Pilot Cron] Processing user ${i + 1}/${users.length}: ${user.email}`);
      const result = await processUserAutoPilot(user);
      results.push(result);
      
      // Add delay between users to avoid rate limiting (except for last user)
      if (i < users.length - 1) {
        console.log(`[Auto-Pilot Cron] Waiting 2 seconds before processing next user...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successful = results.filter(r => r.success).length;
    const totalYesPosts = results.reduce((sum, r) => sum + r.yesPosts, 0);
    const totalPosted = results.reduce((sum, r) => sum + r.posted, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    console.log(`[Auto-Pilot Cron] Completed: ${successful}/${users.length} users processed, ${totalYesPosts} total YES posts found, ${totalPosted} comments posted, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      message: `Processed ${successful}/${users.length} users`,
      processed: successful,
      total: users.length,
      totalYesPosts,
      totalPosted,
      totalFailed,
      results: results.map((r, i) => ({
        email: users[i].email,
        success: r.success,
        yesPosts: r.yesPosts,
        posted: r.posted,
        failed: r.failed,
        yesPostsList: r.yesPostsList,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error("[Auto-Pilot Cron] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process auto-pilot",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

