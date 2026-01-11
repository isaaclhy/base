#!/usr/bin/env node
/**
 * Standalone user stats cron job script
 * Runs entirely in GitHub Actions (no Vercel CPU usage)
 * 
 * Usage: npx tsx scripts/user-stats-cron.ts
 * 
 * Required environment variables:
 * - MONGO_URL
 * - OPENAI_API_KEY or OPENAI_KEY
 * - GCS_KEY (Google Custom Search API key)
 * - REDDIT_CLIENT_ID
 * - REDDIT_CLIENT_SECRET
 */

import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import { google } from 'googleapis';
import { getDatabase } from '@/lib/mongodb';
import { User, getUserByEmail } from '@/lib/db/users';
import { refreshAccessToken } from '@/lib/reddit/auth';
import { RedditPost } from '@/lib/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

const customsearch = google.customsearch("v1");

/**
 * Count words in a string
 */
function countWords(text: string | null | undefined): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(word => word.length > 0).length;
}

function normalizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  return url
    .split('?')[0]
    .replace(/\/$/, '')
    .toLowerCase();
}

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
          console.error(`[User Stats] Error expanding keyword "${keyword}":`, response.error);
          return;
        }

        const output = response.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
        
        try {
          const parsed = JSON.parse(output);
          const similarKeywords = Array.isArray(parsed) ? parsed : (parsed.keywords || []);
          similarKeywords.forEach((k: string) => allKeywordsSet.add(k.toLowerCase().trim()));
        } catch (parseError) {
          console.error(`[User Stats] Error parsing similar keywords for "${keyword}":`, parseError);
        }
      } catch (err) {
        console.error(`[User Stats] Error expanding keyword "${keyword}":`, err);
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
        dateRestrict: "d4",
      });
      
      if (response.data.items) {
        allResults.push(...response.data.items);
      }
    } catch (error) {
      console.error(`[User Stats] Error fetching Google search for query "${query}":`, error);
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

async function fetchSubredditPosts(
  keyword: string,
  subreddit: string,
  limit: number,
  accessToken: string
): Promise<any[]> {
  try {
    const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}&t=week&restrict_sr=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`[User Stats] Error fetching posts from r/${subreddit} for keyword "${keyword}": ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts = data.data?.children?.map((child: any) => child.data) || [];
    
    const fourDaysAgo = Math.floor(Date.now() / 1000) - (4 * 24 * 60 * 60);
    const recentPosts = posts.filter((post: any) => post.created_utc >= fourDaysAgo);
    
    return recentPosts.slice(0, limit).map((post: any) => ({
      title: post.title,
      link: `https://www.reddit.com${post.permalink}`,
      snippet: post.selftext?.substring(0, 200) || post.title,
      selftext: post.selftext || null,
      postData: post,
    }));
  } catch (error) {
    console.error(`[User Stats] Error fetching posts from r/${subreddit} for keyword "${keyword}":`, error);
    return [];
  }
}

async function batchFetchPostData(
  postIds: string[],
  accessToken: string
): Promise<Map<string, any>> {
  const postDataMap = new Map<string, any>();
  
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
          
          posts.forEach((child: { data: any }) => {
            const post = child.data;
            const permalinkMatch = post.permalink?.match(/\/comments\/([a-z0-9]+)/i);
            if (permalinkMatch && permalinkMatch[1]) {
              const postId = permalinkMatch[1];
              postDataMap.set(postId, post);
            }
          });
        }
      } catch (error) {
        console.error(`[User Stats] Error fetching batch post data:`, error);
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
          console.error('[User Stats] OpenAI filter error:', response.error);
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
          console.error('[User Stats] Error parsing OpenAI response:', parseError);
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
          console.error('[User Stats] Error parsing filter results:', parseError);
          batch.forEach(post => verdictMap.set(post.id, 'NO'));
        }

        batch.forEach(post => {
          if (!verdictMap.has(post.id)) {
            verdictMap.set(post.id, 'NO');
          }
        });
      } catch (error) {
        console.error('[User Stats] Error filtering titles:', error);
        batch.forEach(post => verdictMap.set(post.id, 'NO'));
      }
    })
  );

  return verdictMap;
}

async function syncLeadsForUser(user: User): Promise<{ success: boolean; leadsCount: number; leads: any[]; error?: string }> {
  try {
    const keywords = user.keywords || [];
    const subreddits = user.subreddits || [];
    const productDescription = user.productDetails?.productDescription || "";
    
    if (keywords.length === 0) {
      return { success: false, leadsCount: 0, leads: [], error: "No keywords" };
    }
    
    if (!productDescription) {
      return { success: false, leadsCount: 0, leads: [], error: "No product description" };
    }

    let validAccessToken: string;
    try {
      validAccessToken = await refreshAccessToken(user.email);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[User Stats] [Sync Leads] User ${user.email}: Reddit auth failed - ${errorMessage}`);
      return { success: false, leadsCount: 0, leads: [], error: `Reddit authentication failed: ${errorMessage}` };
    }

    const expandedKeywords = await expandKeywords(keywords);

    const allGoogleResults: any[] = [];
    await Promise.all(
      expandedKeywords.map(async (keyword) => {
        try {
          const results = await fetchGoogleSearch(keyword, 20);
          results.forEach(result => {
            allGoogleResults.push({ ...result, keyword });
          });
        } catch (error) {
          console.error(`[User Stats] [Sync Leads] Error fetching Google results for keyword "${keyword}":`, error);
        }
      })
    );

    const allSubredditResults: any[] = [];
    if (subreddits && subreddits.length > 0) {
      await Promise.all(
        expandedKeywords.map(async (keyword: string) => {
          await Promise.all(
            (subreddits as string[]).map(async (subreddit: string) => {
              try {
                const results = await fetchSubredditPosts(keyword, subreddit, 30, validAccessToken);
                results.forEach(result => {
                  allSubredditResults.push({ ...result, keyword, subreddit });
                });
              } catch (error) {
                console.error(`[User Stats] [Sync Leads] Error fetching subreddit results for "${keyword}" in r/${subreddit}:`, error);
              }
            })
          );
        })
      );
    }

    const allResults = [...allGoogleResults, ...allSubredditResults];

    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter(result => {
      const normalized = normalizeUrl(result.link);
      if (seenUrls.has(normalized)) return false;
      seenUrls.add(normalized);
      return true;
    });

    const postIds: string[] = [];
    const urlToPostId = new Map<string, string>();
    
    uniqueResults.forEach(result => {
      const postId = extractRedditPostId(result.link || "");
      if (postId) {
        postIds.push(`t3_${postId}`);
        urlToPostId.set(normalizeUrl(result.link || ""), postId);
      }
    });

    const postDataMap = await batchFetchPostData(postIds, validAccessToken);

    const fourDaysAgo = Math.floor(Date.now() / 1000) - (4 * 24 * 60 * 60);
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
        if (postCreatedUtc < fourDaysAgo) {
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
        if (result.postData && result.postData.created_utc >= fourDaysAgo) {
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

    if (postsToFilter.length === 0) {
      console.log(`[User Stats] [Sync Leads] User ${user.email}: Found 0 leads`);
      return { success: true, leadsCount: 0, leads: [] };
    }

    const verdictMap = await filterTitles(
      postsToFilter.map(p => ({ id: p.id, title: p.title })),
      productDescription
    );

    const yesPosts = postsToFilter.filter(p => {
      const verdict = verdictMap.get(p.id);
      return verdict === "YES";
    });

    console.log(`[User Stats] [Sync Leads] User ${user.email}: Found ${yesPosts.length} YES leads`);

    return { 
      success: true, 
      leadsCount: yesPosts.length, 
      leads: yesPosts.map(p => ({
        title: p.title,
        url: p.url,
        postId: p.id
      }))
    };
  } catch (error) {
    console.error(`[User Stats] [Sync Leads] Error syncing leads for user ${user.email}:`, error);
    return { 
      success: false, 
      leadsCount: 0, 
      leads: [], 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

function userMeetsCriteria(user: User): boolean {
  const productDescription = user.productDetails?.productDescription || "";
  const wordCount = countWords(productDescription);
  
  if (wordCount <= 10) {
    return false;
  }
  
  const keywords = user.keywords || [];
  const keywordCount = keywords.length;
  
  if (keywordCount <= 1) {
    return false;
  }
  
  const subreddits = user.subreddits || [];
  const subredditCount = subreddits.length;
  
  if (subredditCount <= 1) {
    return false;
  }
  
  return true;
}

async function main() {
  try {
    console.log("[User Stats Cron] Starting user stats cron job");
    
    // Verify required environment variables
    const requiredEnvVars = ['MONGO_URL', 'OPENAI_API_KEY', 'GCS_KEY', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName] && !(varName === 'OPENAI_API_KEY' && process.env.OPENAI_KEY));
    
    if (missingVars.length > 0) {
      console.error(`[User Stats Cron] Missing required environment variables: ${missingVars.join(', ')}`);
      process.exit(1);
    }

    const db = await getDatabase();
    const usersCollection = db.collection<User>('usersv2');
    
    const allUsers = await usersCollection.find({}).toArray();
    
    let qualifyingUsers = 0;
    let usersChecked = 0;
    const qualifyingUserEmails: string[] = [];
    const failingUsers: Array<{
      email: string;
      reason: string;
      wordCount?: number;
      keywordCount?: number;
      subredditCount?: number;
    }> = [];
    
    for (const user of allUsers) {
      usersChecked++;
      if (userMeetsCriteria(user)) {
        qualifyingUsers++;
        qualifyingUserEmails.push(user.email);
        
        const syncResult = await syncLeadsForUser(user);
        if (syncResult.error) {
          console.error(`[User Stats Cron] User ${user.email}: Error - ${syncResult.error}`);
        }
      } else {
        const productDescription = user.productDetails?.productDescription || "";
        const wordCount = countWords(productDescription);
        const keywordCount = (user.keywords || []).length;
        const subredditCount = (user.subreddits || []).length;
        
        let reason = "";
        if (wordCount <= 10) {
          reason = `Product description too short (${wordCount} words, needs > 10)`;
        } else if (keywordCount <= 1) {
          reason = `Not enough keywords (${keywordCount}, needs > 1)`;
        } else if (subredditCount <= 1) {
          reason = `Not enough subreddits (${subredditCount}, needs > 1)`;
        } else {
          reason = "Unknown reason";
        }
        
        failingUsers.push({
          email: user.email,
          reason,
          wordCount,
          keywordCount,
          subredditCount,
        });
      }
    }
    
    console.log(`[User Stats Cron] Summary: ${usersChecked} users checked, ${qualifyingUsers} qualifying, ${failingUsers.length} non-qualifying`);
    
    process.exit(0);
  } catch (error) {
    console.error("[User Stats Cron] ========================================");
    console.error("[User Stats Cron] ERROR occurred:");
    console.error("[User Stats Cron] ========================================");
    console.error("[User Stats Cron] Error message:", error instanceof Error ? error.message : String(error));
    console.error("[User Stats Cron] Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("[User Stats Cron] ========================================");
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
