import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { RedditPost } from "@/lib/types";

export interface CronRedditPost {
  _id?: ObjectId;
  userId: string; // User email
  query: string; // Search query used to find this post
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  cronRunId?: string; // Optional: to group posts from the same cron run
  createdAt: Date;
}

export async function createCronRedditPost(postData: {
  userId: string;
  query: string;
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
  selftext?: string | null;
  postData?: RedditPost | null;
  cronRunId?: string;
}): Promise<CronRedditPost> {
  const db = await getDatabase();
  const cronPostsCollection = db.collection<CronRedditPost>("cronRedditPost");

  const now = new Date();

  const newPost: CronRedditPost = {
    userId: postData.userId,
    query: postData.query,
    title: postData.title || null,
    link: postData.link || null,
    snippet: postData.snippet || null,
    selftext: postData.selftext || null,
    postData: postData.postData || null,
    cronRunId: postData.cronRunId,
    createdAt: now,
  };

  const result = await cronPostsCollection.insertOne(newPost);

  if (!result.insertedId) {
    throw new Error("Failed to create cron Reddit post");
  }

  return {
    ...newPost,
    _id: result.insertedId,
  };
}

export async function getCronRedditPostsByUserId(userId: string): Promise<CronRedditPost[]> {
  const db = await getDatabase();
  const cronPostsCollection = db.collection<CronRedditPost>("cronRedditPost");

  return await cronPostsCollection
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getCronRedditPostsByCronRunId(cronRunId: string): Promise<CronRedditPost[]> {
  const db = await getDatabase();
  const cronPostsCollection = db.collection<CronRedditPost>("cronRedditPost");

  return await cronPostsCollection
    .find({ cronRunId })
    .sort({ createdAt: -1 })
    .toArray();
}

