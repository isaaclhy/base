import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createPost, PostStatus } from "@/lib/db/posts";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      status,
      query,
      title,
      link,
      snippet,
      selftext,
      postData,
      comment,
      notes,
      autoPilot,
    } = body;

    if (!status || !query) {
      return NextResponse.json(
        { error: "Missing required fields: status, query" },
        { status: 400 }
      );
    }

    if (status !== "posted" && status !== "skipped" && status !== "failed") {
      return NextResponse.json(
        { error: "Invalid status. Must be 'posted', 'skipped', or 'failed'" },
        { status: 400 }
      );
    }

    const post = await createPost({
      userId: session.user.email,
      status: status as PostStatus,
      query,
      title: title || null,
      link: link || null,
      snippet: snippet || null,
      selftext: selftext || null,
      postData: postData || null,
      comment: comment || null,
      notes: notes || null,
      autoPilot: autoPilot || false,
    });

    console.log(`Post saved to MongoDB (postsv2 collection): ${post._id?.toString()}`);

    return NextResponse.json({
      success: true,
      post: {
        id: post._id?.toString(),
        status: post.status,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating post in MongoDB:", error);
    return NextResponse.json(
      { 
        error: "Failed to create post",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

