import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { getValidAccessToken, refreshAccessToken } from "@/lib/reddit/auth";
import { createPost, PostStatus, getPostsByUserId } from "@/lib/db/posts";
import { incrementUsage, incrementCronUsage, getMaxPostsPerWeekForPlan, getUserUsage } from "@/lib/db/usage";
import { getSubredditRule } from "@/lib/db/subreddit-rules";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

// Increase timeout for cron job (5 minutes)
export const maxDuration = 300;
// Force dynamic execution to prevent caching issues
export const dynamic = 'force-dynamic';


interface AutoPilotRequestBody {
  userEmail?: string;
  apiKey?: string;
}

function normalizeUrl(url: string): string {
  return url
    .split('?')[0]
    .replace(/\/$/, '')
    .toLowerCase();
}


// Batch fetch multiple Reddit posts using OAuth endpoint
async function fetchRedditPostsBatch(
  postUrls: string[],
  accessToken: string
): Promise<Map<string, any>> {
  const postDataMap = new Map<string, any>();
  
  if (postUrls.length === 0 || !accessToken) {
    return postDataMap;
  }

  try {
    const postIds: string[] = [];
    const urlToPostIdMap = new Map<string, string>();
    
    for (const postUrl of postUrls) {
      const urlMatch = postUrl.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
      if (urlMatch) {
        const postId = urlMatch[2];
        const redditPostId = `t3_${postId}`;
        postIds.push(redditPostId);
        urlToPostIdMap.set(postUrl, redditPostId);
      }
    }

    if (postIds.length === 0) {
      return postDataMap;
    }

    const postIdsString = postIds.join(",");
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

    if (!response.ok) {
      console.error(`[Auto-pilot] OAuth endpoint returned HTTP ${response.status}`);
      return postDataMap;
    }

    const data = await response.json();
    
    if (data && data.data && data.data.children) {
      const posts = data.data.children.map((child: any) => child.data);
      
      for (const post of posts) {
        const redditPostId = post.name;
        for (const [url, id] of urlToPostIdMap.entries()) {
          if (id === redditPostId) {
            postDataMap.set(url, post);
            break;
          }
        }
      }
    }

    return postDataMap;
  } catch (error) {
    console.error(`[Auto-pilot] Error batch fetching Reddit posts:`, error);
    return postDataMap;
  }
}

// Handle GET requests (for GitHub Actions with query params)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const isValidManualTrigger = authHeader === `Bearer ${process.env.CRON_API_KEY}` || 
                                  authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isValidManualTrigger) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail") || process.env.CRON_USER_EMAIL;

    if (!userEmail) {
      return NextResponse.json(
        { error: "userEmail is required. Set CRON_USER_EMAIL environment variable or pass as query parameter." },
        { status: 400 }
      );
    }

    return await handleAutoPilotRequest(userEmail);
  } catch (error) {
    console.error("Auto-pilot cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Handle POST requests
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: AutoPilotRequestBody = await request.json();
    const { userEmail, apiKey } = body;

    if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!userEmail) {
      return NextResponse.json(
        { error: "userEmail is required" },
        { status: 400 }
      );
    }

    return await handleAutoPilotRequest(userEmail);
  } catch (error) {
    console.error("Auto-pilot cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function handleAutoPilotRequest(email: string): Promise<NextResponse> {
  try {
    console.log(`[Auto-pilot] ============================================`);
    console.log(`[Auto-pilot] Starting auto-pilot for user: ${email}`);
    console.log(`[Auto-pilot] Timestamp: ${new Date().toISOString()}`);

    const dbUser = await getUserByEmail(email);
    if (!dbUser) {
      console.error(`[Auto-pilot] User not found: ${email}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's keywords and subreddits
    const keywords = dbUser.keywords || [];
    const subreddits = dbUser.subreddits || [];
    const productIdea = dbUser.productDetails?.productDescription;

    console.log(`[Auto-pilot] User configuration:`);
    console.log(`[Auto-pilot]   - Keywords: ${keywords.length} (${keywords.join(', ')})`);
    console.log(`[Auto-pilot]   - Subreddits: ${subreddits.length} (${subreddits.join(', ')})`);
    console.log(`[Auto-pilot]   - Product idea present: ${!!productIdea}`);
    console.log(`[Auto-pilot]   - Product idea length: ${productIdea?.length || 0} characters`);

    if (keywords.length === 0) {
      console.error(`[Auto-pilot] No keywords found for user ${email}`);
      return NextResponse.json(
        { error: "No keywords found. Please add keywords in the Product tab." },
        { status: 400 }
      );
    }

    if (!productIdea) {
      console.error(`[Auto-pilot] No product description found for user ${email}`);
      return NextResponse.json(
        { error: "No product description found. Please add product details in the Product tab." },
        { status: 400 }
      );
    }

    // Get Reddit OAuth access token
    let redditAccessToken: string | undefined;
    try {
      if (dbUser.redditAccessToken) {
        console.log(`[Auto-pilot] Getting valid Reddit access token...`);
        redditAccessToken = await getValidAccessToken(email);
        console.log(`[Auto-pilot] Reddit access token obtained: ${redditAccessToken ? 'YES' : 'NO'}`);
      } else {
        console.log(`[Auto-pilot] User has no Reddit access token stored`);
      }
    } catch (tokenError) {
      console.error(`[Auto-pilot] Error getting Reddit access token:`, tokenError);
    }

    if (!redditAccessToken) {
      console.error(`[Auto-pilot] Reddit account not connected for user ${email}`);
      return NextResponse.json(
        { error: "Reddit account not connected. Please connect your Reddit account." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const twoHoursAgo = Math.floor(now / 1000) - (2 * 60 * 60);
    const twoHoursAgoMs = now - (2 * 60 * 60 * 1000);
    
    console.log(`[Auto-pilot] Time window: ${new Date(twoHoursAgoMs).toISOString()} to ${new Date(now).toISOString()}`);
    console.log(`[Auto-pilot] Unix timestamp threshold: ${twoHoursAgo} (2 hours ago)`);
    
    const allPosts: Array<{
      title?: string | null;
      link?: string | null;
      snippet?: string | null;
      selftext?: string | null;
      postData?: any;
      keyword?: string;
    }> = [];

    // Step 1: Fetch leads from subreddits (if available)
    if (subreddits.length > 0 && redditAccessToken) {
      console.log(`[Auto-pilot] Fetching leads from ${subreddits.length} subreddits for ${keywords.length} keywords...`);
      
      for (const keyword of keywords) {
        for (const subreddit of subreddits) {
          try {
            console.log(`[Auto-pilot] Searching r/${subreddit} for keyword "${keyword}"...`);
            
            // Search Reddit posts in subreddit by keyword, sorted by new, limited to this week
            const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=30&t=week&restrict_sr=1`;
            
            const response = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'reddit-comment-tool/0.1 by isaaclhy13',
                'Accept': 'application/json',
                'Authorization': `Bearer ${redditAccessToken}`,
              },
              cache: 'no-store'
            });

            if (response.ok) {
              const data = await response.json();
              const posts: any[] = data.data?.children?.map((child: any) => child.data) || [];
              
              console.log(`[Auto-pilot] Found ${posts.length} posts in r/${subreddit} for keyword "${keyword}"`);
              
              // Convert to the format expected
              const subredditPosts = posts.map((post: any) => ({
                title: post.title,
                link: `https://www.reddit.com${post.permalink}`,
                snippet: post.selftext?.substring(0, 200) || post.title,
                selftext: post.selftext || null,
                keyword,
                postData: {
                  ups: post.ups || 0,
                  num_comments: post.num_comments || 0,
                  created_utc: post.created_utc,
                  name: post.name,
                },
              }));
              
              allPosts.push(...subredditPosts);
              console.log(`[Auto-pilot] Added ${subredditPosts.length} posts from r/${subreddit} for keyword "${keyword}"`);
            } else {
              console.error(`[Auto-pilot] Failed to fetch from r/${subreddit} for keyword "${keyword}": HTTP ${response.status}`);
            }
          } catch (error) {
            console.error(`[Auto-pilot] Error fetching from r/${subreddit} for keyword "${keyword}":`, error);
          }
        }
      }
      
      console.log(`[Auto-pilot] Total posts after subreddit search: ${allPosts.length}`);
    } else if (subreddits.length === 0) {
      console.log(`[Auto-pilot] No subreddits configured, skipping subreddit fetching`);
    } else {
      console.log(`[Auto-pilot] No Reddit access token, skipping subreddit fetching`);
    }

    // Step 2: Filter out posts that are already in analytics (already posted/commented on)
    console.log(`[Auto-pilot] Fetching analytics posts to filter out already-posted posts...`);
    const analyticsPosts = await getPostsByUserId(email);
    const analyticsUrlSet = new Set<string>();
    analyticsPosts.forEach((post) => {
      if (post.link) {
        analyticsUrlSet.add(normalizeUrl(post.link));
      }
    });
    console.log(`[Auto-pilot] Found ${analyticsPosts.length} posts in analytics, ${analyticsUrlSet.size} unique URLs`);
    
    const beforeAnalyticsFilter = allPosts.length;
    const allPostsFiltered = allPosts.filter((post) => {
      if (!post.link) return false;
      const normalizedUrl = normalizeUrl(post.link);
      const isInAnalytics = analyticsUrlSet.has(normalizedUrl);
      if (isInAnalytics) {
        console.log(`[Auto-pilot] Filtered out already-posted post: "${post.title}" | URL: ${post.link}`);
      }
      return !isInAnalytics;
    });
    console.log(`[Auto-pilot] Filtered out ${beforeAnalyticsFilter - allPostsFiltered.length} already-posted posts. ${allPostsFiltered.length} posts remaining.`);

    // Step 3: Filter by time (2 hours)
    console.log(`[Auto-pilot] Filtering ${allPostsFiltered.length} posts by time (last 2 hours)...`);
    const timeFiltered = allPostsFiltered.filter((post) => {
      if (post.postData && typeof post.postData.created_utc === 'number') {
        const isWithinWindow = post.postData.created_utc >= twoHoursAgo;
        if (!isWithinWindow) {
          const createdDate = new Date(post.postData.created_utc * 1000).toISOString();
          const hoursAgo = ((now / 1000) - post.postData.created_utc) / 3600;
          console.log(`[Auto-pilot] Filtered out: "${post.title}" | Created: ${createdDate} (${hoursAgo.toFixed(2)} hours ago)`);
        }
        return isWithinWindow;
      } else {
        console.log(`[Auto-pilot] Filtered out: "${post.title}" | Missing or invalid created_utc: ${post.postData?.created_utc}`);
        return false;
      }
    });

    console.log(`[Auto-pilot] ${timeFiltered.length} posts remaining after 2-hour filter (out of ${allPostsFiltered.length} total, ${allPosts.length} before analytics filter)`);
    
    if (timeFiltered.length > 0) {
      console.log(`[Auto-pilot] Time-filtered posts:`, timeFiltered.map(p => ({
        title: p.title,
        created_utc: p.postData?.created_utc,
        created_date: p.postData?.created_utc ? new Date(p.postData.created_utc * 1000).toISOString() : 'unknown',
        link: p.link
      })));
    }

    if (timeFiltered.length === 0) {
      console.log(`[Auto-pilot] No posts found within the last 2 hours. Returning empty results.`);
      
      // Calculate age statistics for debugging
      const postsWithTimestamps = allPostsFiltered
        .filter(p => p.postData?.created_utc && typeof p.postData.created_utc === 'number')
        .map(p => ({
          title: p.title,
          created_utc: p.postData!.created_utc!,
          created_date: new Date(p.postData!.created_utc! * 1000).toISOString(),
          hours_ago: ((now / 1000) - p.postData!.created_utc!) / 3600,
          link: p.link
        }))
        .sort((a, b) => b.created_utc - a.created_utc); // Sort by newest first
      
      const oldestPost = postsWithTimestamps[postsWithTimestamps.length - 1];
      const newestPost = postsWithTimestamps[0];
      const postsWithMissingTimestamps = allPosts.filter(p => !p.postData?.created_utc || typeof p.postData.created_utc !== 'number').length;
      
      return NextResponse.json({
        success: true,
        message: "No posts found within the last 2 hours",
        posts: [],
        totalFound: allPosts.length,
        afterTimeFilter: 0,
        debug: {
          totalPosts: allPosts.length,
          postsWithValidTimestamps: postsWithTimestamps.length,
          postsWithMissingTimestamps: postsWithMissingTimestamps,
          timeThreshold: twoHoursAgo,
          timeThresholdISO: new Date(twoHoursAgo * 1000).toISOString(),
          nowISO: new Date(now).toISOString(),
          newestPost: newestPost ? {
            title: newestPost.title,
            created_date: newestPost.created_date,
            hours_ago: newestPost.hours_ago.toFixed(2),
            link: newestPost.link
          } : null,
          oldestPost: oldestPost ? {
            title: oldestPost.title,
            created_date: oldestPost.created_date,
            hours_ago: oldestPost.hours_ago.toFixed(2),
            link: oldestPost.link
          } : null,
          samplePosts: postsWithTimestamps.slice(0, 10).map(p => ({
            title: p.title,
            created_date: p.created_date,
            hours_ago: p.hours_ago.toFixed(2),
            link: p.link
          }))
        }
      });
    }

    // Step 4: Apply AI filter
    let filterError: unknown = null;
    try {
      // Check if API key is configured
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY or OPENAI_KEY environment variable.');
      }

      const postsForFilter = timeFiltered.map((post) => ({
        title: post.title || "",
        content: post.selftext || post.snippet || "",
      }));

      console.log(`[Auto-pilot] Filtering ${postsForFilter.length} posts using OpenAI...`);
      
      // Format posts as JSON string (OpenAI expects string, not array)
      const postsString = JSON.stringify(postsForFilter);
      
      const filterResponse = await (openaiClient as any).responses.create({
        prompt: {
          "id": "pmpt_6954083f58708193b7fbe2c0ed6396530bbdd28382fe1384",
          "version": "9",
          "variables": {
            "posts": postsString,
            "idea": productIdea
          }
        }
      });

      if (filterResponse.error) {
        console.error('[Auto-pilot] OpenAI filter API error:', filterResponse.error);
        const errorMessage = filterResponse.error?.message || JSON.stringify(filterResponse.error);
        throw new Error(`OpenAI filter error: ${errorMessage}`);
      }

      // Extract the output - handle different possible response structures
      let output: string;
      try {
        if (filterResponse.output && Array.isArray(filterResponse.output)) {
          const message = filterResponse.output.find((res: any) => res.type === 'message');
          if (message && message.content && Array.isArray(message.content)) {
            const outputText = message.content.find((res: any) => res.type === 'output_text');
            if (outputText && outputText.text) {
              output = outputText.text;
            } else {
              throw new Error('Could not find output_text in message content');
            }
          } else {
            throw new Error('Could not find message in output');
          }
        } else if (filterResponse.data) {
          output = typeof filterResponse.data === 'string' ? filterResponse.data : JSON.stringify(filterResponse.data);
        } else if (typeof filterResponse === 'string') {
          output = filterResponse;
        } else {
          throw new Error('Unexpected response structure');
        }
      } catch (extractError) {
        console.error('[Auto-pilot] Error extracting filter output:', extractError);
        output = JSON.stringify(filterResponse);
      }

      console.log(`[Auto-pilot] Raw OpenAI filter output:`, output);

      // Parse the response - should be an array of YES/MAYBE/NO
      let filterResults: string[];
      try {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed)) {
          filterResults = parsed.map((r: any) => String(r).trim().toUpperCase());
        } else if (typeof parsed === 'string') {
          filterResults = parsed.split(/\n|,/).map((r: string) => r.trim().toUpperCase()).filter(Boolean);
        } else {
          throw new Error('Unexpected response format');
        }
      } catch (e) {
        console.log('[Auto-pilot] Filter output is not JSON, trying to parse as plain text');
        const lines = output.split(/\n/).filter((line: string) => line.trim().length > 0);
        filterResults = lines.map((line: string) => {
          const match = line.match(/\b(YES|NO|MAYBE)\b/i);
          return match ? match[1].toUpperCase() : line.trim().toUpperCase();
        }).filter(Boolean);
      }

      // Validate that we have the right number of results
      if (filterResults.length !== postsForFilter.length) {
        console.warn(`[Auto-pilot] Expected ${postsForFilter.length} filter results, got ${filterResults.length}`);
        if (filterResults.length < postsForFilter.length) {
          filterResults = [...filterResults, ...Array(postsForFilter.length - filterResults.length).fill('NO')];
        } else {
          filterResults = filterResults.slice(0, postsForFilter.length);
        }
      }

      console.log(`[Auto-pilot] Filter API returned ${filterResults.length} results:`, filterResults);
      
      const aiFiltered = timeFiltered.filter((post, index) => {
        const result = filterResults[index]?.toUpperCase();
        const isKept = result && result !== 'NO';
        if (!isKept) {
          console.log(`[Auto-pilot] AI filter removed: "${post.title}" | Result: ${result}`);
        }
        return isKept;
      });

      console.log(`[Auto-pilot] ${aiFiltered.length} posts remaining after AI filter (out of ${timeFiltered.length} time-filtered posts)`);

      // Deduplicate aiFiltered by URL to avoid posting multiple comments on the same post
      const seenUrls = new Set<string>();
      const uniqueAiFiltered = aiFiltered.filter((post) => {
        if (!post.link) return false;
        const normalizedUrl = normalizeUrl(post.link);
        if (seenUrls.has(normalizedUrl)) {
          console.log(`[Auto-pilot] Filtering out duplicate post: "${post.title}" | URL: ${post.link}`);
          return false;
        }
        seenUrls.add(normalizedUrl);
        return true;
      });
      
      console.log(`[Auto-pilot] Deduplicated ${aiFiltered.length} posts to ${uniqueAiFiltered.length} unique posts`);

        // Step 5: Generate comments, post them, and save to database
        const productLink = dbUser.productDetails?.link || "";
        const productBenefits = dbUser.productDetails?.productBenefits || "";
        let postedCount = 0;
        let failedCount = 0;

        // Check usage limits before proceeding
        const plan = dbUser.plan ?? "free";
        const maxPerWeek = getMaxPostsPerWeekForPlan(plan);
        const currentUsage = await getUserUsage(email);
        const remaining = Math.max(0, maxPerWeek - currentUsage.currentCount);

        if (remaining === 0) {
          console.log(`[Auto-pilot] Usage limit reached for user ${email}. Cannot post comments.`);
          return NextResponse.json({
            success: true,
            message: `Found ${uniqueAiFiltered.length} unique posts but usage limit reached`,
            posts: uniqueAiFiltered,
            totalFound: allPostsFiltered.length,
            afterTimeFilter: timeFiltered.length,
            afterAiFilter: aiFiltered.length,
            afterDeduplication: uniqueAiFiltered.length,
            postedCount: 0,
            failedCount: 0,
            limitReached: true,
          });
        }

        // Process each filtered post (now deduplicated)
        for (let i = 0; i < Math.min(uniqueAiFiltered.length, remaining); i++) {
          const post = uniqueAiFiltered[i];
          
          try {
            // Check if we have enough remaining quota
            const currentUsageCheck = await getUserUsage(email);
            const remainingCheck = Math.max(0, maxPerWeek - currentUsageCheck.currentCount);
            if (remainingCheck === 0) {
              console.log(`[Auto-pilot] Usage limit reached during processing. Stopping.`);
              break;
            }

            if (!post.link || !post.postData?.name) {
              console.log(`[Auto-pilot] Skipping post - missing link or postData.name`);
              failedCount++;
              continue;
            }

            // Generate comment using Founder persona
            const postContent = `${post.title || ""}\n\n${post.selftext || post.snippet || ""}`;
            const thingId = post.postData.name; // e.g., "t3_abc123"

            console.log(`[Auto-pilot] Generating comment for post ${i + 1}/${uniqueAiFiltered.length}...`);
            
            // Check subreddit promotion status from database
            let allowPromoting = "true"; // Default to true (if no rules found, allow promotion)
            if (post.postData?.subreddit) {
              try {
                const cleanSubredditName = post.postData.subreddit.replace(/^r\//, "").replace(/^r/, "").toLowerCase();
                const subredditRule = await getSubredditRule(cleanSubredditName);
                if (subredditRule && typeof subredditRule.allowPromoting === 'boolean') {
                  allowPromoting = subredditRule.allowPromoting ? "true" : "false";
                }
                // If no rule found in database, default to true (allows promotion)
              } catch (error) {
                console.error(`[Auto-pilot] Error checking subreddit promotion status for ${post.postData.subreddit}:`, error);
                // Default to true if check fails (allows promotion)
              }
            }
            
            // Generate comment using OpenAI
            const commentResponse = await (openaiClient as any).responses.create({
              prompt: {
                "id": "pmpt_694ff0c078ec8197ad0b92621f11735905afaefebad67788",
                "version": "8",
                "variables": {
                  "content": postContent,
                  "idea": productIdea,
                  "benefits": productBenefits || "",
                  "allowpromoting": allowPromoting
                }
              }
            });

            if (commentResponse.error) {
              console.error(`[Auto-pilot] OpenAI error for post ${post.link}:`, commentResponse.error);
              failedCount++;
              continue;
            }

            const output = commentResponse.output.filter((res: any) => res.type == 'message')[0].content.filter((res: any) => res.type == 'output_text')[0].text;
            
            let generatedComment: string;
            try {
              const parsed = JSON.parse(output);
              if (parsed.items && Array.isArray(parsed.items)) {
                generatedComment = parsed.items.join("\n\n");
              } else if (Array.isArray(parsed)) {
                generatedComment = parsed.join("\n\n");
              } else if (typeof parsed === 'string') {
                generatedComment = parsed;
              } else {
                generatedComment = output;
              }
            } catch (e) {
              generatedComment = output;
            }

            if (!generatedComment || generatedComment.trim().length === 0) {
              console.error(`[Auto-pilot] Empty comment generated for post ${post.link}`);
              failedCount++;
              continue;
            }

            // Post comment to Reddit
            console.log(`[Auto-pilot] Posting comment to Reddit...`);
            let postCommentResponse = await fetch("https://oauth.reddit.com/api/comment", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${redditAccessToken}`,
                "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                thing_id: thingId,
                text: generatedComment.trim(),
              }).toString(),
            });

            // If 401, try refreshing token once
            if (postCommentResponse.status === 401) {
              try {
                redditAccessToken = await refreshAccessToken(email);
                postCommentResponse = await fetch("https://oauth.reddit.com/api/comment", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${redditAccessToken}`,
                    "User-Agent": "web:comment-tool:0.1 (by /u/isaaclhy13)",
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    thing_id: thingId,
                    text: generatedComment.trim(),
                  }).toString(),
                });
              } catch (refreshError) {
                console.error(`[Auto-pilot] Failed to refresh token:`, refreshError);
                failedCount++;
                continue;
              }
            }

            if (!postCommentResponse.ok) {
              const errorData = await postCommentResponse.json().catch(() => ({ error: postCommentResponse.statusText }));
              console.error(`[Auto-pilot] Failed to post comment for ${post.link}:`, errorData);
              failedCount++;
              continue;
            }

            // Save to database
            const query = post.keyword || "auto-pilot";
            await createPost({
              userId: email,
              status: "posted" as PostStatus,
              query,
              title: post.title || null,
              link: post.link || null,
              snippet: post.snippet || null,
              selftext: post.selftext || null,
              postData: post.postData || null,
              comment: generatedComment.trim(),
              notes: null,
            });

            // Increment usage
            await incrementUsage(email, 1, maxPerWeek);
            
            // Increment cron usage separately
            await incrementCronUsage(email, 1);

            console.log(`[Auto-pilot] Successfully posted and saved post ${i + 1}/${uniqueAiFiltered.length}`);
            postedCount++;

            // Add small delay between posts to avoid rate limiting
            if (i < uniqueAiFiltered.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }

          } catch (error) {
            console.error(`[Auto-pilot] Error processing post ${post.link}:`, error);
            failedCount++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `Processed ${uniqueAiFiltered.length} unique posts: ${postedCount} posted, ${failedCount} failed`,
          posts: uniqueAiFiltered,
          totalFound: allPostsFiltered.length,
          afterTimeFilter: timeFiltered.length,
          afterAiFilter: aiFiltered.length,
          afterDeduplication: uniqueAiFiltered.length,
          postedCount,
          failedCount,
        });
    } catch (error: any) {
      filterError = error;
      console.error('[Auto-pilot] ============================================');
      console.error('[Auto-pilot] Error applying AI filter:', error);
      
      // Handle OpenAI API errors specifically
      if (error?.status === 401 || error?.code === 'invalid_api_key') {
        console.error('[Auto-pilot] OpenAI authentication failed - 401 Unauthorized');
        console.error('[Auto-pilot] This usually means:');
        console.error('[Auto-pilot]   1. OPENAI_API_KEY or OPENAI_KEY environment variable is missing');
        console.error('[Auto-pilot]   2. The API key is invalid or expired');
        console.error('[Auto-pilot]   3. The API key does not have access to the prompts/responses API');
        filterError = 'OpenAI API authentication failed (401). Please check your API key configuration.';
      } else if (error?.status) {
        console.error(`[Auto-pilot] OpenAI API returned status ${error.status}`);
        console.error('[Auto-pilot] Error response:', error.message || error.error || JSON.stringify(error));
      } else if (error instanceof Error) {
        console.error('[Auto-pilot] Filter error message:', error.message);
        console.error('[Auto-pilot] Filter error stack:', error.stack);
      } else {
        console.error('[Auto-pilot] Filter error (non-Error object):', JSON.stringify(error));
      }
      console.error('[Auto-pilot] ============================================');
    }

    // If AI filter fails, return time-filtered results
    console.log(`[Auto-pilot] AI filter failed, returning ${timeFiltered.length} time-filtered posts`);
    return NextResponse.json({
      success: true,
      message: `Found ${timeFiltered.length} posts (AI filter failed)`,
      posts: timeFiltered,
      totalFound: allPostsFiltered.length,
      afterTimeFilter: timeFiltered.length,
      filterError: filterError instanceof Error ? filterError.message : filterError ? String(filterError) : 'Unknown error'
    });

  } catch (err: unknown) {
    console.error("[Auto-pilot] ============================================");
    console.error("[Auto-pilot] Fatal error:", err);
    if (err instanceof Error) {
      console.error("[Auto-pilot] Error stack:", err.stack);
    }
    console.error("[Auto-pilot] ============================================");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

