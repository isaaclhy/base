import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { RedditPost } from "@/lib/types";

export interface CronRedditPost {
  _id?: ObjectId;
  userEmail: string; // User email
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
  userEmail: string;
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
    userEmail: postData.userEmail,
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

export async function getCronRedditPostsByUserEmail(userEmail: string): Promise<CronRedditPost[]> {
  const db = await getDatabase();
  const cronPostsCollection = db.collection<CronRedditPost>("cronRedditPost");

  return await cronPostsCollection
    .find({ userEmail })
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

export async function getCronRedditPostByLinkAndUserEmail(
  link: string,
  userEmail: string
): Promise<CronRedditPost | null> {
  const db = await getDatabase();
  const cronPostsCollection = db.collection<CronRedditPost>("cronRedditPost");

  return await cronPostsCollection.findOne({
    link: link,
    userEmail: userEmail,
  });
}

