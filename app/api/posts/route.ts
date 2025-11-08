import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPostsByUserId } from "@/lib/db/posts";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const posts = await getPostsByUserId(session.user.email);

    return NextResponse.json({
      success: true,
      posts: posts.map((post) => ({
        id: post._id?.toString(),
        userId: post.userId,
        status: post.status,
        query: post.query,
        title: post.title,
        link: post.link,
        snippet: post.snippet,
        selftext: post.selftext,
        postData: post.postData,
        comment: post.comment,
        notes: post.notes,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch posts",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

