import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type UserPlan = "free" | "premium";

export interface User {
  _id?: ObjectId;
  email: string;
  name?: string | null;
  image?: string | null;
  plan: UserPlan;
  createdAt: Date;
  updatedAt: Date;
  provider?: string;
  providerId?: string;
  // Reddit OAuth tokens
  redditAccessToken?: string;
  redditRefreshToken?: string;
  redditTokenExpiresAt?: Date;
  // Stripe billing fields
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  subscriptionStatus?: string | null;
}

export async function createOrUpdateUser(userData: {
  email: string;
  name?: string | null;
  image?: string | null;
  provider?: string;
  providerId?: string;
}): Promise<User> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  const now = new Date();
  
  // Check if user already exists
  const existingUser = await usersCollection.findOne({ email: userData.email });

  if (existingUser) {
    // Update existing user
    // If plan doesn't exist, set it to "free" (migration for old users)
    const updateData: Partial<User> = {
      name: userData.name,
      image: userData.image,
      updatedAt: now,
      provider: userData.provider,
      providerId: userData.providerId,
    };
    
    // Only set plan if it doesn't exist (migration for existing users)
    if (!existingUser.plan) {
      updateData.plan = "free";
    }

    const updatedUser = await usersCollection.findOneAndUpdate(
      { email: userData.email },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    // Ensure plan is set (fallback for TypeScript)
    const result = updatedUser as User;
    if (!result.plan) {
      result.plan = "free";
    }

    return result;
  } else {
    // Create new user with free plan by default
    const newUser: User = {
      email: userData.email,
      name: userData.name || null,
      image: userData.image || null,
      plan: "free",
      createdAt: now,
      updatedAt: now,
      provider: userData.provider,
      providerId: userData.providerId,
    };

    const result = await usersCollection.insertOne(newUser);
    
    if (!result.insertedId) {
      throw new Error('Failed to create user');
    }

    return {
      ...newUser,
      _id: result.insertedId,
    };
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  const user = await usersCollection.findOne({ email });
  
  // If user exists but doesn't have a plan, set it to free and update
  if (user && !user.plan) {
    const updatedUser = await usersCollection.findOneAndUpdate(
      { email },
      { $set: { plan: "free" } },
      { returnDocument: 'after' }
    );
    return updatedUser as User;
  }
  
  return user;
}

export async function updateUserRedditTokens(
  email: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }
): Promise<User> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  const updatedUser = await usersCollection.findOneAndUpdate(
    { email },
    {
      $set: {
        redditAccessToken: tokens.accessToken,
        redditRefreshToken: tokens.refreshToken,
        redditTokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  if (!updatedUser) {
    throw new Error('Failed to update Reddit tokens');
  }

  return updatedUser as User;
}

export async function updateUserPlanByEmail(
  email: string,
  plan: UserPlan,
  options?: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    subscriptionStatus?: string | null;
  }
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  const update: Partial<User> = {
    plan,
    updatedAt: new Date(),
  };

  if (options) {
    if (options.stripeCustomerId !== undefined) {
      update.stripeCustomerId = options.stripeCustomerId;
    }
    if (options.stripeSubscriptionId !== undefined) {
      update.stripeSubscriptionId = options.stripeSubscriptionId;
    }
    if (options.stripePriceId !== undefined) {
      update.stripePriceId = options.stripePriceId;
    }
    if (options.subscriptionStatus !== undefined) {
      update.subscriptionStatus = options.subscriptionStatus;
    }
  }

  const result = await usersCollection.findOneAndUpdate(
    { email },
    { $set: update },
    { returnDocument: "after" }
  );

  return result as User | null;
}

export async function updateUserPlanByCustomerId(
  stripeCustomerId: string,
  plan: UserPlan,
  options?: {
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    subscriptionStatus?: string | null;
    emailFallback?: string;
  }
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  const update: Partial<User> = {
    plan,
    updatedAt: new Date(),
    stripeCustomerId,
  };

  if (options) {
    if (options.stripeSubscriptionId !== undefined) {
      update.stripeSubscriptionId = options.stripeSubscriptionId;
    }
    if (options.stripePriceId !== undefined) {
      update.stripePriceId = options.stripePriceId;
    }
    if (options.subscriptionStatus !== undefined) {
      update.subscriptionStatus = options.subscriptionStatus;
    }
  }

  let result = await usersCollection.findOneAndUpdate(
    { stripeCustomerId },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result && options?.emailFallback) {
    result = await usersCollection.findOneAndUpdate(
      { email: options.emailFallback },
      { $set: update },
      { returnDocument: "after" }
    );
  }

  return result as User | null;
}
 
export async function getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  return usersCollection.findOne({ stripeCustomerId });
}

