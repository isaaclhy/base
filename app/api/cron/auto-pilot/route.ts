import { NextRequest, NextResponse } from "next/server";
import { getUsersWithAutoPilotEnabled } from "@/lib/db/users";
import { refreshAccessToken } from "@/lib/reddit/auth";
import OpenAI from "openai";
import { google } from "googleapis";
import { RedditPost } from "@/lib/types";
import { getSubredditRule } from "@/lib/db/subreddit-rules";
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
          similarKeywords.forEach((k: string) => allKeywordsSet.add(k.toLowerCase().trim()));
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
      // Use d1 (past 24 hours) since Google API doesn't support 12 hours
      // We'll filter to 12 hours later using Reddit post timestamps
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

// Fetch Reddit posts from subreddits (same as sync leads)
async function fetchSubredditPosts(
  keyword: string,
  subreddit: string,
  limit: number,
  userEmail: string
): Promise<any[]> {
  try {
    const accessToken = await refreshAccessToken(userEmail);
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
      console.error(`[Auto-Pilot] Error fetching posts from r/${subreddit} for keyword "${keyword}": ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: RedditPost[] = data.data?.children?.map((child: any) => child.data) || [];
    
    // Filter to past 12 hours (not 4 days like sync leads)
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

// Batch fetch Reddit post data (same as sync leads)
async function batchFetchPostData(
  postIds: string[],
  userEmail: string
): Promise<Map<string, RedditPost>> {
  const postDataMap = new Map<string, RedditPost>();
  
  if (postIds.length === 0) return postDataMap;

  const BATCH_SIZE = 95;
  const batches: string[][] = [];
  
  for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
    batches.push(postIds.slice(i, i + BATCH_SIZE));
  }

  const accessToken = await refreshAccessToken(userEmail);

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

// Process auto-pilot for a single user (exactly like sync leads, but 12 hours filter)
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
    const allSubredditResults: any[] = [];
    if (subreddits && subreddits.length > 0) {
      await Promise.all(
        expandedKeywords.map(async (keyword: string) => {
          await Promise.all(
            (subreddits as string[]).map(async (subreddit: string) => {
              try {
                const results = await fetchSubredditPosts(keyword, subreddit, 30, user.email);
                results.forEach(result => {
                  allSubredditResults.push({ ...result, keyword, subreddit });
                });
              } catch (error) {
                console.error(`[Auto-Pilot] Error fetching subreddit results for "${keyword}" in r/${subreddit}:`, error);
              }
            })
          );
        })
      );
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

    const postDataMap = await batchFetchPostData(postIds, user.email);

    // Step 5: Filter to past 12 hours and build filter array (same as sync leads, but 12 hours)
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

      // Get post data from map
      const postData = postDataMap.get(postId);
      
      // Filter: only include posts from the past 12 hours
      if (postData) {
        const postCreatedUtc = postData.created_utc || 0;
        if (postCreatedUtc < twelveHoursAgo) {
          return; // Skip posts older than 12 hours
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
          const fullPostData = postDataMap.get(yesPost.id);
          if (!fullPostData) {
            console.warn(`[Auto-Pilot] User ${user.email}: No post data for ${yesPost.id}, skipping`);
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
              const subredditRule = await getSubredditRule(cleanSubredditName);
              if (subredditRule && typeof subredditRule.allowPromoting === 'boolean') {
                allowPromoting = subredditRule.allowPromoting ? "true" : "false";
              }
            } catch (error) {
              console.error(`[Auto-Pilot] Error checking subreddit rule for r/${subredditName}:`, error);
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

          // Parse comment
          let commentText: string;
          try {
            const output = commentResponse.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
            const parsed = JSON.parse(output);
            if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
              commentText = parsed.items[0];
            } else if (Array.isArray(parsed) && parsed.length > 0) {
              commentText = parsed[0];
            } else if (typeof parsed === 'string') {
              commentText = parsed;
            } else {
              throw new Error("Unexpected comment format");
            }
          } catch (parseError) {
            console.error(`[Auto-Pilot] User ${user.email}: Error parsing comment for post "${yesPost.title}":`, parseError);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Failed to parse comment" });
            continue;
          }

          if (!commentText || !commentText.trim()) {
            console.warn(`[Auto-Pilot] User ${user.email}: Empty comment generated for post "${yesPost.title}"`);
            failedCount++;
            failedPosts.push({ id: yesPost.id, title: yesPost.title, error: "Empty comment" });
            continue;
          }

          // Post comment to Reddit
          const accessToken = await refreshAccessToken(user.email);
          const thingId = `t3_${yesPost.id}`;
          
          console.log(`[Auto-Pilot] User ${user.email}: Posting comment to Reddit for post "${yesPost.title}"`);
          
          const postResponse = await fetch("https://oauth.reddit.com/api/comment", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              thing_id: thingId,
              text: commentText.trim(),
            }).toString(),
          });

          if (!postResponse.ok) {
            const errorData = await postResponse.json().catch(() => ({ error: postResponse.statusText }));
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

    // Process each user
    const results = await Promise.all(
      users.map(user => processUserAutoPilot(user))
    );

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

