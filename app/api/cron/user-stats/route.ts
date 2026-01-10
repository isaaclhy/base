import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { User } from "@/lib/db/users";

// Verify the request is from cron job using a secret token
function verifyRequest(request: NextRequest): boolean {
  // Check if it's from Vercel Cron (Vercel adds this header automatically)
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  if (vercelCronHeader) {
    console.log("[User Stats Cron] Request verified via Vercel Cron header");
    return true;
  }
  
  // Check if it's from GitHub Actions or manual call with Bearer token
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET_TOKEN;
  
  if (!expectedToken) {
    console.warn("[User Stats Cron] CRON_SECRET_TOKEN not set in environment");
    return false;
  }
  
  if (authHeader === `Bearer ${expectedToken}`) {
    console.log("[User Stats Cron] Request verified via Bearer token");
    return true;
  }
  
  console.warn("[User Stats Cron] Request verification failed - no valid authorization");
  return false;
}

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
  // Split by whitespace and filter out empty strings
  return trimmed.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if user meets criteria:
 * - Product description has more than 10 words
 * - Has more than 1 keyword
 * - Has more than 1 subreddit
 */
function userMeetsCriteria(user: User): boolean {
  console.log(`[User Stats] Checking user: ${user.email}`);
  
  // Check product description word count
  const productDescription = user.productDetails?.productDescription || "";
  const wordCount = countWords(productDescription);
  console.log(`[User Stats] User ${user.email}: Product description word count: ${wordCount} (text: "${productDescription.substring(0, 50)}...")`);
  
  if (wordCount <= 10) {
    console.log(`[User Stats] User ${user.email}: FAILED - Product description has ${wordCount} words (needs > 10)`);
    return false;
  }
  
  // Check keywords count
  const keywords = user.keywords || [];
  const keywordCount = keywords.length;
  console.log(`[User Stats] User ${user.email}: Keywords count: ${keywordCount} (keywords: ${JSON.stringify(keywords)})`);
  
  if (keywordCount <= 1) {
    console.log(`[User Stats] User ${user.email}: FAILED - Has ${keywordCount} keywords (needs > 1)`);
    return false;
  }
  
  // Check subreddits count
  const subreddits = user.subreddits || [];
  const subredditCount = subreddits.length;
  console.log(`[User Stats] User ${user.email}: Subreddits count: ${subredditCount} (subreddits: ${JSON.stringify(subreddits)})`);
  
  if (subredditCount <= 1) {
    console.log(`[User Stats] User ${user.email}: FAILED - Has ${subredditCount} subreddits (needs > 1)`);
    return false;
  }
  
  console.log(`[User Stats] User ${user.email}: ✓ PASSED all criteria (words: ${wordCount}, keywords: ${keywordCount}, subreddits: ${subredditCount})`);
  return true;
}

export async function POST(request: NextRequest) {
  console.log("[User Stats Cron] ========================================");
  console.log("[User Stats Cron] Starting user stats cron job");
  console.log("[User Stats Cron] Timestamp:", new Date().toISOString());
  console.log("[User Stats Cron] ========================================");

  // Verify request
  if (!verifyRequest(request)) {
    console.error("[User Stats Cron] Unauthorized request - Invalid or missing CRON_SECRET_TOKEN");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    console.log("[User Stats Cron] Connecting to database...");
    const db = await getDatabase();
    const usersCollection = db.collection<User>('usersv2');
    
    console.log("[User Stats Cron] Fetching all users from database...");
    const allUsers = await usersCollection.find({}).toArray();
    console.log(`[User Stats Cron] Total users found in database: ${allUsers.length}`);
    
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
    
    console.log("[User Stats Cron] ========================================");
    console.log("[User Stats Cron] Starting to check each user...");
    console.log("[User Stats Cron] ========================================");
    
    for (const user of allUsers) {
      usersChecked++;
      console.log(`[User Stats Cron] --- Processing user ${usersChecked}/${allUsers.length} ---`);
      console.log(`[User Stats Cron] User email: ${user.email}`);
      console.log(`[User Stats Cron] User plan: ${user.plan || 'not set'}`);
      console.log(`[User Stats Cron] Onboarding completed: ${user.onboardingCompleted || false}`);
      
      if (userMeetsCriteria(user)) {
        qualifyingUsers++;
        qualifyingUserEmails.push(user.email);
        console.log(`[User Stats Cron] ✓ User ${user.email} QUALIFIES`);
      } else {
        // Determine why user failed
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
        console.log(`[User Stats Cron] ✗ User ${user.email} does NOT qualify: ${reason}`);
      }
      
      console.log(`[User Stats Cron] --- End of user ${usersChecked} check ---\n`);
    }
    
    console.log("[User Stats Cron] ========================================");
    console.log("[User Stats Cron] SUMMARY");
    console.log("[User Stats Cron] ========================================");
    console.log(`[User Stats Cron] Total users checked: ${usersChecked}`);
    console.log(`[User Stats Cron] Qualifying users: ${qualifyingUsers}`);
    console.log(`[User Stats Cron] Non-qualifying users: ${failingUsers.length}`);
    console.log(`[User Stats Cron] Percentage qualifying: ${usersChecked > 0 ? ((qualifyingUsers / usersChecked) * 100).toFixed(2) : 0}%`);
    
    console.log("\n[User Stats Cron] ========================================");
    console.log("[User Stats Cron] QUALIFYING USERS:");
    console.log("[User Stats Cron] ========================================");
    if (qualifyingUserEmails.length === 0) {
      console.log("[User Stats Cron] None");
    } else {
      qualifyingUserEmails.forEach((email, index) => {
        console.log(`[User Stats Cron] ${index + 1}. ${email}`);
      });
    }
    
    console.log("\n[User Stats Cron] ========================================");
    console.log("[User Stats Cron] FAILING USERS (first 20):");
    console.log("[User Stats Cron] ========================================");
    failingUsers.slice(0, 20).forEach((user, index) => {
      console.log(`[User Stats Cron] ${index + 1}. ${user.email}`);
      console.log(`[User Stats Cron]    Reason: ${user.reason}`);
      console.log(`[User Stats Cron]    Word count: ${user.wordCount}, Keywords: ${user.keywordCount}, Subreddits: ${user.subredditCount}`);
    });
    
    if (failingUsers.length > 20) {
      console.log(`[User Stats Cron] ... and ${failingUsers.length - 20} more failing users`);
    }
    
    console.log("\n[User Stats Cron] ========================================");
    console.log("[User Stats Cron] Cron job completed successfully");
    console.log("[User Stats Cron] ========================================");
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalUsers: usersChecked,
        qualifyingUsers,
        nonQualifyingUsers: failingUsers.length,
        percentageQualifying: usersChecked > 0 ? ((qualifyingUsers / usersChecked) * 100).toFixed(2) : "0.00",
      },
      qualifyingUserEmails,
      failingUsersCount: failingUsers.length,
      failingUsers: failingUsers.slice(0, 50), // Include first 50 for reference
    });
  } catch (error) {
    console.error("[User Stats Cron] ========================================");
    console.error("[User Stats Cron] ERROR occurred:");
    console.error("[User Stats Cron] ========================================");
    console.error("[User Stats Cron] Error message:", error instanceof Error ? error.message : String(error));
    console.error("[User Stats Cron] Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("[User Stats Cron] ========================================");
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
