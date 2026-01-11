#!/usr/bin/env node
/**
 * Standalone auto-pilot cron job script
 * Runs entirely in GitHub Actions (no Vercel CPU usage)
 * 
 * Usage: npx tsx scripts/auto-pilot-cron.ts
 * 
 * Required environment variables (set in GitHub Actions secrets):
 * - MONGO_URL
 * - OPENAI_API_KEY or OPENAI_KEY
 * - GCS_KEY (Google Custom Search API key)
 * - REDDIT_CLIENT_ID
 * - REDDIT_CLIENT_SECRET
 */

import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import { google } from 'googleapis';

// Import using @/ aliases (tsx will resolve via tsconfig.json)
import { getUsersWithAutoPilotEnabled } from '@/lib/db/users';
import { refreshAccessToken } from '@/lib/reddit/auth';
import { getSubredditRule, upsertSubredditRule } from '@/lib/db/subreddit-rules';
import { createPost, getPostsByUserId } from '@/lib/db/posts';
import { RedditPost } from '@/lib/types';
import { getDatabase } from '@/lib/mongodb';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

const customsearch = google.customsearch("v1");

// Helper functions (copied from route.ts)
function extractRedditPostId(url: string): string | null {
  try {
    const match = url.match(/\/comments\/([a-z0-9]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isRedditPostUrl(url: string): boolean {
  return (
    /reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+(\/|$)/i.test(url) &&
    !/\/comment\//i.test(url)
  );
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

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
          const limitedKeywords = similarKeywords.slice(0, 5);
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

async function fetchGoogleSearch(query: string, resultsPerQuery: number = 20): Promise<any[]> {
  const maxPerRequest = 10;
  const totalResults = Math.min(resultsPerQuery, 20);
  const requestsNeeded = Math.ceil(totalResults / maxPerRequest);
  const allResults: any[] = [];
  
  for (let i = 0; i < requestsNeeded; i++) {
    const startIndex = i * maxPerRequest + 1;
    const numResults = Math.min(maxPerRequest, totalResults - (i * maxPerRequest));
    
    try {
      const response = await customsearch.cse.list({
        auth: process.env.GCS_KEY,
        cx: "84be52ff9627b480b",
        q: query,
        num: numResults,
        start: startIndex,
        dateRestrict: "d1",
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

class RedditRateLimiter {
  private remaining: number = 60;
  private resetTime: number = Date.now() + 60000;
  private minDelay: number = 1000;
  private lastRequestTime: number = 0;

  updateFromHeaders(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    
    if (remaining !== null) {
      this.remaining = parseInt(remaining, 10);
    }
    
    if (reset !== null) {
      this.resetTime = parseInt(reset, 10) * 1000;
    }
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    if (this.remaining <= 0) {
      const waitTime = Math.max(0, this.resetTime - now);
      if (waitTime > 0) {
        console.log(`[Rate Limiter] Quota exhausted. Waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.remaining = 60;
      }
    }
    
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    if (this.remaining < 10) {
      const adaptiveDelay = (10 - this.remaining) * 200;
      await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
    }
    
    this.lastRequestTime = Date.now();
  }

  decrement() {
    if (this.remaining > 0) {
      this.remaining--;
    }
  }

  getRemaining(): number {
    return this.remaining;
  }
}

async function fetchSubredditPosts(
  keyword: string,
  subreddit: string,
  limit: number,
  accessToken: string,
  rateLimiter: RedditRateLimiter,
  retryCount: number = 0
): Promise<any[]> {
  try {
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

    rateLimiter.updateFromHeaders(response.headers);
    rateLimiter.decrement();

    if (response.status === 429) {
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 2000;
        console.warn(`[Auto-Pilot] Rate limited (429) for r/${subreddit} keyword "${keyword}". Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchSubredditPosts(keyword, subreddit, limit, accessToken, rateLimiter, retryCount + 1);
      } else {
        console.error(`[Auto-Pilot] Rate limited (429) for r/${subreddit} keyword "${keyword}". Max retries reached.`);
        return [];
      }
    }

    if (!response.ok) {
      console.error(`[Auto-Pilot] Error fetching posts from r/${subreddit} for keyword "${keyword}": ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: RedditPost[] = data.data?.children?.map((child: any) => child.data) || [];
    
    const twelveHoursAgo = Math.floor(Date.now() / 1000) - (12 * 60 * 60);
    const recentPosts = posts.filter((post: RedditPost) => post.created_utc >= twelveHoursAgo);
    
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

// Main processing function - full implementation
async function processUserAutoPilot(user: any): Promise<{ success: boolean; yesPosts: number; yesPostsList: any[]; posted: number; failed: number; error?: string }> {
  try {
    console.log(`[Auto-Pilot] Processing user: ${user.email}`);
    
    const keywords = user.keywords || [];
    const subreddits = (user.subreddits as string[]) || [];
    const productDescription = user.productDetails?.productDescription || "";
    
    if (keywords.length === 0) {
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No keywords" };
    }
    
    if (!productDescription) {
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No product description" };
    }

    const productLink = user.productDetails?.link || "";
    if (!productLink) {
      return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0, error: "No product link" };
    }

    let validAccessToken: string;
    try {
      validAccessToken = await refreshAccessToken(user.email);
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Failed to refresh token";
      return { 
        success: false, 
        yesPosts: 0,
        yesPostsList: [],
        posted: 0,
        failed: 0,
        error: `Reddit authentication failed: ${errorMessage}` 
      };
    }

    const expandedKeywords = await expandKeywords(keywords);
    console.log(`[Auto-Pilot] User ${user.email}: Expanded ${keywords.length} keywords to ${expandedKeywords.length}`);

    // Google Custom Search
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

    // Subreddit search with rate limiting
    const allSubredditResults: any[] = [];
    if (subreddits && subreddits.length > 0) {
      const rateLimiter = new RedditRateLimiter();
      const totalRequests = expandedKeywords.length * (subreddits as string[]).length;
      console.log(`[Auto-Pilot] User ${user.email}: Starting ${totalRequests} subreddit searches with rate limiting...`);
      
      let requestCount = 0;
      for (const keyword of expandedKeywords) {
        for (const subreddit of subreddits as string[]) {
          requestCount++;
          try {
            if (requestCount % 10 === 0) {
              console.log(`[Auto-Pilot] User ${user.email}: Progress ${requestCount}/${totalRequests} (${rateLimiter.getRemaining()} requests remaining)`);
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

    // Combine and deduplicate
    const allResults = [...allGoogleResults, ...allSubredditResults];
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter(result => {
      const normalized = normalizeUrl(result.link);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    });

    console.log(`[Auto-Pilot] User ${user.email}: ${uniqueResults.length} unique results after deduplication`);

    // Extract post IDs and batch fetch
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

    // Filter to past 12 hours
    const twelveHoursAgo = Math.floor(Date.now() / 1000) - (12 * 60 * 60);
    const postsToFilter: Array<{ id: string; title: string; url: string }> = [];
    const seenPostIds = new Set<string>();

    uniqueResults.forEach(result => {
      if (!result.link) return;
      
      const normalizedUrl = normalizeUrl(result.link);
      const postId = urlToPostId.get(normalizedUrl);
      if (!postId) return;

      if (seenPostIds.has(postId)) return;
      seenPostIds.add(postId);

      const postData = postDataMap.get(postId);
      
      if (postData) {
        const postCreatedUtc = postData.created_utc || 0;
        if (postCreatedUtc < twelveHoursAgo) {
          return;
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
        if (result.postData && result.postData.created_utc >= twelveHoursAgo) {
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

    console.log(`[Auto-Pilot] User ${user.email}: ${postsToFilter.length} posts to filter (past 12 hours)`);

    // Filter titles using OpenAI
    if (postsToFilter.length > 0) {
      const verdictMap = await filterTitles(
        postsToFilter.map(p => ({ id: p.id, title: p.title })),
        productDescription
      );

      const yesPosts = postsToFilter.filter(p => {
        const verdict = verdictMap.get(p.id);
        return verdict === "YES";
      });

      console.log(`[Auto-Pilot] User ${user.email}: ${yesPosts.length} YES posts out of ${postsToFilter.length} total posts`);

      if (yesPosts.length === 0) {
        return { success: true, yesPosts: 0, yesPostsList: [], posted: 0, failed: 0 };
      }

      // Check for posts that have already been processed (posted or skipped)
      const db = await getDatabase();
      const postsCollection = db.collection("postsv2");
      const existingPosts = await postsCollection.find({
        userId: user.email,
        status: { $in: ["posted", "skipped"] },
        link: { $in: yesPosts.map(p => p.url) }
      }).toArray();

      const processedUrls = new Set<string>();
      existingPosts.forEach((post: any) => {
        if (post.link) {
          processedUrls.add(normalizeUrl(post.link));
        }
      });

      // Filter out posts that have already been processed
      const newYesPosts = yesPosts.filter(post => {
        const normalizedUrl = normalizeUrl(post.url);
        const alreadyProcessed = processedUrls.has(normalizedUrl);
        if (alreadyProcessed) {
          console.log(`[Auto-Pilot] User ${user.email}: Skipping post "${post.title}" (already processed)`);
        }
        return !alreadyProcessed;
      });

      console.log(`[Auto-Pilot] User ${user.email}: ${newYesPosts.length} new posts to process (${yesPosts.length - newYesPosts.length} already processed)`);

      if (newYesPosts.length === 0) {
        console.log(`[Auto-Pilot] User ${user.email}: All YES posts have already been processed`);
        return { success: true, yesPosts: yesPosts.length, yesPostsList: yesPosts.map(p => ({ id: p.id, title: p.title, url: p.url })), posted: 0, failed: 0 };
      }

      // Generate and post comments
      const productBenefits = user.productDetails?.productBenefits || "";
      let postedCount = 0;
      let failedCount = 0;
      const postedPosts: any[] = [];
      const failedPosts: any[] = [];

      for (const yesPost of newYesPosts) {
        try {
          let fullPostData = postDataMap.get(yesPost.id);
          
          if (!fullPostData) {
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
                  postDataMap.set(yesPost.id, fullPostData);
                }
              }
            } catch (fetchError) {
              console.error(`[Auto-Pilot] Error fetching individual post ${yesPost.id}:`, fetchError);
            }
          }
          
          if (!fullPostData) {
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

          // Check subreddit promotion status
          let allowPromoting = "true";
          if (subredditName) {
            try {
              const cleanSubredditName = subredditName.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
              
              let subredditRule = await getSubredditRule(cleanSubredditName);
              
              if (subredditRule && typeof subredditRule.allowPromoting === 'boolean') {
                allowPromoting = subredditRule.allowPromoting ? "true" : "false";
                console.log(`[Auto-Pilot] User ${user.email}: Using cached rule for r/${cleanSubredditName}: ${allowPromoting}`);
              } else {
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
                    const allRules = rulesData.rules || [];
                    const rulesText = allRules
                      .map((rule: any) => rule.description || "")
                      .filter((desc: string) => desc.trim().length > 0)
                      .join("\n\n");
                    
                    if (!rulesText || rulesText.trim().length === 0) {
                      allowPromoting = "true";
                      await upsertSubredditRule(cleanSubredditName, true);
                    } else {
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
                        allowPromoting = "true";
                      } else {
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
                          output = "YES";
                        }

                        const normalizedOutput = output.trim().toUpperCase();
                        let allowsPromotion: boolean;
                        
                        if (normalizedOutput === 'YES' || normalizedOutput.startsWith('YES')) {
                          allowsPromotion = true;
                        } else if (normalizedOutput === 'NO' || normalizedOutput.startsWith('NO')) {
                          allowsPromotion = false;
                        } else {
                          allowsPromotion = false;
                        }

                        allowPromoting = allowsPromotion ? "true" : "false";
                        await upsertSubredditRule(cleanSubredditName, allowsPromotion);
                      }
                    }
                  } else {
                    allowPromoting = "true";
                  }
                } catch (fetchError) {
                  allowPromoting = "true";
                }
              }
            } catch (error) {
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
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: commentResponse.error.message });
            continue;
          }

          let commentText: string;
          try {
            const output = commentResponse.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
            
            try {
              const parsed = JSON.parse(output);
              if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
                commentText = parsed.items[0];
              } else if (Array.isArray(parsed) && parsed.length > 0) {
                commentText = parsed[0];
              } else if (typeof parsed === 'string') {
                commentText = parsed;
              } else {
                commentText = output;
              }
            } catch (jsonError) {
              commentText = output;
            }
          } catch (parseError) {
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Failed to extract comment" });
            continue;
          }

          if (!commentText || !commentText.trim()) {
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Empty comment" });
            continue;
          }

          // Post comment to Reddit
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

          const postResponseData = await postResponse.json().catch(() => null);
          
          if (!postResponse.ok) {
            const errorData = postResponseData || { error: postResponse.statusText };
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: errorData.error || postResponse.statusText });
            
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
              console.error(`[Auto-Pilot] Error saving failed post to database:`, dbError);
            }
            continue;
          }
          
          if (!postResponseData) {
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Failed to parse Reddit API response" });
            continue;
          }
          
          if (postResponseData.success === true) {
            console.log(`[Auto-Pilot] User ${user.email}: Successfully posted comment for "${yesPost.title}"`);
            
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
                notes: "Auto-pilot: Comment posted successfully",
                autoPilot: true,
              });
            } catch (dbError) {
              console.error(`[Auto-Pilot] Error saving posted comment to database:`, dbError);
            }
            
            postedCount++;
            postedPosts.push({ id: yesPost.id, title: yesPost.title, url: yesPost.url });
            continue;
          }
          
          if (postResponseData.json && postResponseData.json.errors && Array.isArray(postResponseData.json.errors) && postResponseData.json.errors.length > 0) {
            const errors = postResponseData.json.errors.map((err: any[]) => err.join(': ')).join('; ');
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: `Reddit API error: ${errors}` });
            continue;
          }

          if (postResponseData.json && postResponseData.json.data) {
            const things = postResponseData.json.data?.things || [];
            const commentId = things[0]?.data?.name || null;
            console.log(`[Auto-Pilot] User ${user.email}: Successfully posted comment. Comment ID: ${commentId}`);
          }

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
            console.error(`[Auto-Pilot] Error saving posted comment to database:`, dbError);
          }

          postedCount++;
          postedPosts.push({ id: yesPost.id, title: yesPost.title, url: yesPost.url });

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

// Main entry point
async function main() {
  try {
    console.log("[Auto-Pilot Cron] Starting auto-pilot cron job (GitHub Actions)...");
    
    // Verify required environment variables
    const requiredEnvVars = ['MONGO_URL', 'OPENAI_API_KEY', 'GCS_KEY', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName] && !(varName === 'OPENAI_API_KEY' && process.env.OPENAI_KEY));
    
    if (missingVars.length > 0) {
      console.error(`[Auto-Pilot Cron] Missing required environment variables: ${missingVars.join(', ')}`);
      process.exit(1);
    }

    const users = await getUsersWithAutoPilotEnabled();
    console.log(`[Auto-Pilot Cron] Found ${users.length} users with auto-pilot enabled`);

    if (users.length === 0) {
      console.log("[Auto-Pilot Cron] No users with auto-pilot enabled");
      process.exit(0);
    }

    const results = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[Auto-Pilot Cron] Processing user ${i + 1}/${users.length}: ${user.email}`);
      const result = await processUserAutoPilot(user);
      results.push(result);
      
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

    process.exit(0);
  } catch (error) {
    console.error("[Auto-Pilot Cron] Fatal error:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
