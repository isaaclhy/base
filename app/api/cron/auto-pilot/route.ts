import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { getValidAccessToken, refreshAccessToken } from "@/lib/reddit/auth";
import { google, customsearch_v1 } from "googleapis";
import { createPost, PostStatus, getPostsByUserId } from "@/lib/db/posts";
import { incrementUsage, getMaxPostsPerWeekForPlan, getUserUsage } from "@/lib/db/usage";
import OpenAI from "openai";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
});

// Increase timeout for cron job (5 minutes)
export const maxDuration = 300;
// Force dynamic execution to prevent caching issues
export const dynamic = 'force-dynamic';

const customsearch = google.customsearch("v1");

interface AutoPilotRequestBody {
  userEmail?: string;
  apiKey?: string;
}

function isRedditPostUrl(url: string) {
  return (
    /reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+(\/|$)/i.test(url) &&
    !/\/comment\//i.test(url)
  );
}

function normalizeUrl(url: string): string {
  return url
    .split('?')[0]
    .replace(/\/$/, '')
    .toLowerCase();
}

async function fetchGoogleCustomSearch(
  query: string,
  resultsPerQuery: number = 50
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

    // Step 1: Fetch leads for keywords via Google Search
    console.log(`[Auto-pilot] Fetching leads for ${keywords.length} keywords:`, keywords);
    for (const keyword of keywords) {
      try {
        console.log(`[Auto-pilot] Fetching Google Search results for keyword: "${keyword}"`);
        const googleDataArray = await fetchGoogleCustomSearch(keyword, 50);
        const allItems = googleDataArray.flatMap((googleData) => googleData.items || []);
        console.log(`[Auto-pilot] Google Search returned ${allItems.length} total items for keyword "${keyword}"`);

        const redditPosts = allItems
          .filter((data) => isRedditPostUrl(data.link ?? ""))
          .slice(0, 50)
          .map((item) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            keyword,
          }));

        console.log(`[Auto-pilot] Found ${redditPosts.length} Reddit posts from Google Search for keyword "${keyword}"`);

        if (redditAccessToken && redditPosts.length > 0) {
          const postLinks = redditPosts.filter(p => p.link).map(p => p.link!);
          console.log(`[Auto-pilot] Fetching Reddit post data for ${postLinks.length} posts...`);
          const postDataMap = await fetchRedditPostsBatch(postLinks, redditAccessToken);
          console.log(`[Auto-pilot] Successfully fetched Reddit data for ${postDataMap.size} posts`);
          
          for (const post of redditPosts) {
            if (post.link) {
              const postContent = postDataMap.get(post.link);
              if (postContent) {
                const createdUtc = postContent.created_utc;
                const createdDate = createdUtc ? new Date(createdUtc * 1000).toISOString() : 'unknown';
                const isWithinWindow = createdUtc && typeof createdUtc === 'number' && createdUtc >= twoHoursAgo;
                
                console.log(`[Auto-pilot] Post: "${post.title}" | Created: ${createdDate} (${createdUtc}) | Within 2h: ${isWithinWindow} | URL: ${post.link}`);
                
                allPosts.push({
                  ...post,
                  selftext: postContent.selftext || null,
                  postData: {
                    ups: postContent.ups || 0,
                    num_comments: postContent.num_comments || 0,
                    created_utc: postContent.created_utc,
                    name: postContent.name,
                  },
                });
              } else {
                console.log(`[Auto-pilot] No Reddit data found for post: ${post.link}`);
              }
            }
          }
        } else if (!redditAccessToken) {
          console.log(`[Auto-pilot] Skipping Reddit data fetch - no access token`);
        }
      } catch (error) {
        console.error(`[Auto-pilot] Error fetching leads for keyword "${keyword}":`, error);
      }
    }

    console.log(`[Auto-pilot] Total posts fetched from Google Search: ${allPosts.length}`);

    // Step 2: Fetch leads from subreddits (if available)
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

    // Step 2.5: Filter out posts that are already in analytics (already posted/commented on)
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
    try {
      const postsForFilter = timeFiltered.map((post) => ({
        title: post.title || "",
        content: post.selftext || post.snippet || "",
      }));

      console.log(`[Auto-pilot] Sending ${postsForFilter.length} posts to AI filter API`);
      const filterApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/openai/filter-posts`;
      console.log(`[Auto-pilot] Filter API URL: ${filterApiUrl}`);
      
      const filterResponse = await fetch(filterApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          posts: postsForFilter,
          idea: productIdea,
        }),
      });
      
      console.log(`[Auto-pilot] Filter API response status: ${filterResponse.status}`);

      if (filterResponse.ok) {
        const filterData = await filterResponse.json();
        const filterResults = filterData.results || [];
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
            message: `Found ${aiFiltered.length} posts but usage limit reached`,
            posts: aiFiltered,
            totalFound: allPostsFiltered.length,
            afterTimeFilter: timeFiltered.length,
            afterAiFilter: aiFiltered.length,
            postedCount: 0,
            failedCount: 0,
            limitReached: true,
          });
        }

        // Process each filtered post
        for (let i = 0; i < Math.min(aiFiltered.length, remaining); i++) {
          const post = aiFiltered[i];
          
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

            console.log(`[Auto-pilot] Generating comment for post ${i + 1}/${aiFiltered.length}...`);
            
            // Generate comment using OpenAI
            const commentResponse = await (openaiClient as any).responses.create({
              prompt: {
                "id": "pmpt_694ff0c078ec8197ad0b92621f11735905afaefebad67788",
                "version": "7",
                "variables": {
                  "content": postContent,
                  "idea": productIdea,
                  "benefits": productBenefits || ""
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

            console.log(`[Auto-pilot] Successfully posted and saved post ${i + 1}/${aiFiltered.length}`);
            postedCount++;

            // Add small delay between posts to avoid rate limiting
            if (i < aiFiltered.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }

          } catch (error) {
            console.error(`[Auto-pilot] Error processing post ${post.link}:`, error);
            failedCount++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `Processed ${aiFiltered.length} posts: ${postedCount} posted, ${failedCount} failed`,
          posts: aiFiltered,
          totalFound: allPostsFiltered.length,
          afterTimeFilter: timeFiltered.length,
          afterAiFilter: aiFiltered.length,
          postedCount,
          failedCount,
        });
      } else {
        console.error(`[Auto-pilot] Filter API returned non-OK status: ${filterResponse.status}`);
        const errorText = await filterResponse.text().catch(() => 'Unable to read error response');
        console.error(`[Auto-pilot] Filter API error response: ${errorText}`);
      }
    } catch (filterError) {
      console.error('[Auto-pilot] Error applying AI filter:', filterError);
      if (filterError instanceof Error) {
        console.error('[Auto-pilot] Filter error stack:', filterError.stack);
      }
    }

    // If AI filter fails, return time-filtered results
    console.log(`[Auto-pilot] AI filter failed, returning ${timeFiltered.length} time-filtered posts`);
    return NextResponse.json({
      success: true,
      message: `Found ${timeFiltered.length} posts (AI filter failed)`,
      posts: timeFiltered,
      totalFound: allPosts.length,
      afterTimeFilter: timeFiltered.length,
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

