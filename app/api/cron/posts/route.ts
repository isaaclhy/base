import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCronRedditPostsByUserEmail, getCronRedditPostsByCronRunId } from "@/lib/db/cron-reddit-posts";

// GET /api/cron/posts?userEmail=email@example.com
// GET /api/cron/posts?cronRunId=cron_xxx
// GET /api/cron/posts (uses current user's session)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail");
    const cronRunId = searchParams.get("cronRunId");

    let posts;

    if (cronRunId) {
      // Get posts by cron run ID
      posts = await getCronRedditPostsByCronRunId(cronRunId);
    } else if (userEmail) {
      // Get all posts for a specific user
      posts = await getCronRedditPostsByUserEmail(userEmail);
    } else {
      // Use current session user
      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "Unauthorized. Please provide userEmail or cronRunId query parameter, or log in." },
          { status: 401 }
        );
      }
      posts = await getCronRedditPostsByUserEmail(session.user.email);
    }

    return NextResponse.json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (error) {
    console.error("Error fetching cron posts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

