import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { RedditPost } from "@/lib/types";

export type PostStatus = "posted" | "skipped" | "failed";

export interface Post {
  _id?: ObjectId;
  userId: string; // User email
  status: PostStatus;
  query: string;
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  comment?: string | null; // The comment that was posted (if status is "posted")
  notes?: string | null; // Additional notes
  autoPilot?: boolean; // Whether this post was created by auto-pilot
  createdAt: Date;
  updatedAt: Date;
}

export async function createPost(postData: {
  userId: string;
  status: PostStatus;
  query: string;
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  comment?: string | null;
  notes?: string | null;
  autoPilot?: boolean;
}): Promise<Post> {
  const db = await getDatabase();
  const postsCollection = db.collection<Post>("postsv2");

  const now = new Date();

  const newPost: Post = {
    userId: postData.userId,
    status: postData.status,
    query: postData.query,
    title: postData.title || null,
    link: postData.link || null,
    snippet: postData.snippet || null,
    selftext: postData.selftext || null,
    postData: postData.postData || null,
    comment: postData.comment || null,
    notes: postData.notes || null,
    autoPilot: postData.autoPilot || false,
    createdAt: now,
    updatedAt: now,
  };

  const result = await postsCollection.insertOne(newPost);

  if (!result.insertedId) {
    throw new Error("Failed to create post");
  }

  return {
    ...newPost,
    _id: result.insertedId,
  };
}

export async function getPostsByUserId(userId: string): Promise<Post[]> {
  const db = await getDatabase();
  const postsCollection = db.collection<Post>("postsv2");

  return await postsCollection
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getPostsByStatus(
  userId: string,
  status: PostStatus
): Promise<Post[]> {
  const db = await getDatabase();
  const postsCollection = db.collection<Post>("postsv2");

  return await postsCollection
    .find({ userId, status })
    .sort({ createdAt: -1 })
    .toArray();
}

