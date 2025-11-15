import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { PostStatus } from "@/lib/db/posts";

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, status, comment, notes } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: id, status" },
        { status: 400 }
      );
    }

    const allowedStatuses: PostStatus[] = ["posted", "skipped", "failed"];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'posted', 'skipped', or 'failed'" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const postsCollection = db.collection("postsv2");

    const update: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (comment !== undefined) {
      update.comment = comment;
    }

    if (notes !== undefined) {
      update.notes = notes;
    }

    const result = await postsCollection.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        userId: session.user.email,
      },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result || !result.value) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, post: result.value });
  } catch (error) {
    console.error("Error updating post status:", error);
    return NextResponse.json(
      { error: "Failed to update post status" },
      { status: 500 }
    );
  }
}
