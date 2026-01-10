import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export type UserPlan = "free" | "basic" | "premium";

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
  // Product details
  productDetails?: {
    link?: string;
    productName?: string;
    productDescription?: string;
    productBenefits?: string;
    keywords?: string;
  };
  // Keywords array
  keywords?: string[];
  // Subreddits array
  subreddits?: string[];
  // Onboarding completion status
  onboardingCompleted?: boolean;
  // Auto-pilot enabled status
  autoPilotEnabled?: boolean;
}

export interface CreateOrUpdateUserResult {
  user: User;
  isNew: boolean;
}

export async function createOrUpdateUser(userData: {
  email: string;
  name?: string | null;
  image?: string | null;
  provider?: string;
  providerId?: string;
}): Promise<CreateOrUpdateUserResult> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  const now = new Date();
  
  // Normalize email to lowercase for consistent storage and lookup
  const normalizedEmail = userData.email.toLowerCase();
  
  // Check if user already exists
  const existingUser = await usersCollection.findOne({ email: normalizedEmail });

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
      { email: normalizedEmail },
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

    return { user: result, isNew: false };
  } else {
    // Create new user with free plan by default and onboarding not completed
    const newUser: User = {
      email: normalizedEmail,
      name: userData.name || null,
      image: userData.image || null,
      plan: "free",
      createdAt: now,
      updatedAt: now,
      provider: userData.provider,
      providerId: userData.providerId,
      onboardingCompleted: false,
    };

    const result = await usersCollection.insertOne(newUser);
    
    if (!result.insertedId) {
      throw new Error('Failed to create user');
    }

    return {
      user: {
        ...newUser,
        _id: result.insertedId,
      },
      isNew: true,
    };
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const user = await usersCollection.findOne({ email: normalizedEmail });
  
  // If user exists but doesn't have a plan, set it to free and update
  if (user && !user.plan) {
    const updatedUser = await usersCollection.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: { plan: "free" } },
      { returnDocument: 'after' }
    );
    return updatedUser as User;
  }
  
  // Migrate old plan names: "starter" -> "basic", "pro" -> "premium"
  if (user && (user.plan === "starter" || user.plan === "pro")) {
    const migratedPlan = user.plan === "starter" ? "basic" : "premium";
    const updatedUser = await usersCollection.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: { plan: migratedPlan } },
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

  // Normalize email to lowercase for consistent lookup
  const normalizedEmail = email.toLowerCase();

  // First, try to find the user
  let updatedUser = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
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

  // If user not found, try case-insensitive search (for old data)
  if (!updatedUser) {
    console.warn(`User with email ${normalizedEmail} not found with exact case. Trying case-insensitive search...`);
    const regex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existingUser = await usersCollection.findOne({ email: { $regex: regex } });
    
    if (existingUser) {
      // Found user with different case - update it
      updatedUser = await usersCollection.findOneAndUpdate(
        { _id: existingUser._id },
        {
          $set: {
            redditAccessToken: tokens.accessToken,
            redditRefreshToken: tokens.refreshToken,
            redditTokenExpiresAt: tokens.expiresAt,
            email: normalizedEmail, // Normalize email to lowercase
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );
      console.log(`Found user with different case, normalized email to ${normalizedEmail} and updated Reddit tokens`);
    }
  }

  // If still not found, create a new user with Reddit tokens
  // This handles edge cases where user exists in NextAuth but not in our DB
  if (!updatedUser) {
    console.warn(`User with email ${normalizedEmail} not found. Creating new user with Reddit tokens...`);
    const now = new Date();
    const newUser: User = {
      email: normalizedEmail,
      name: null,
      image: null,
      plan: "free",
      createdAt: now,
      updatedAt: now,
      redditAccessToken: tokens.accessToken,
      redditRefreshToken: tokens.refreshToken,
      redditTokenExpiresAt: tokens.expiresAt,
      onboardingCompleted: false,
    };

    const result = await usersCollection.insertOne(newUser);
    
    if (!result.insertedId) {
      throw new Error('Failed to create user with Reddit tokens');
    }

    return {
      ...newUser,
      _id: result.insertedId,
    };
  }

  return updatedUser as User;
}

export async function clearUserRedditTokens(email: string): Promise<void> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>("usersv2");

  await usersCollection.updateOne(
    { email },
    {
      $unset: {
        redditAccessToken: "",
        redditRefreshToken: "",
        redditTokenExpiresAt: "",
      },
      $set: {
        updatedAt: new Date(),
      },
    }
  );
}

export async function updateUserPlanByEmail(
  email: string,
  plan: UserPlan | "starter" | "pro", // Allow old plan names for backward compatibility
  options?: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    subscriptionStatus?: string | null;
  }
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  // Migrate old plan names
  let finalPlan: UserPlan = plan as UserPlan;
  if (plan === "starter") finalPlan = "basic";
  if (plan === "pro") finalPlan = "premium";

  const update: Partial<User> = {
    plan: finalPlan,
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

  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  // Try case-sensitive lookup first (assuming emails are stored in lowercase)
  let result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    { $set: update },
    { returnDocument: "after" }
  );

  // If not found, try case-insensitive search as fallback (for old data)
  if (!result) {
    console.warn(`User with email ${normalizedEmail} not found with exact case. Trying case-insensitive search...`);
    const regex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existingUser = await usersCollection.findOne({ email: { $regex: regex } });
    
    if (existingUser) {
      // Found user with different case - update it and normalize the email
      result = await usersCollection.findOneAndUpdate(
        { _id: existingUser._id },
        { 
          $set: { 
            ...update,
            email: normalizedEmail // Normalize email to lowercase
          } 
        },
        { returnDocument: "after" }
      );
      console.log(`Found user with different case, normalized email to ${normalizedEmail} and updated plan to ${finalPlan}`);
    }
  }

  if (!result) {
    console.error(`Failed to update user plan: User with email ${normalizedEmail} not found in database`);
    console.error(`Update data was:`, JSON.stringify(update, null, 2));
  } else {
    console.log(`✓ Successfully updated user plan for ${normalizedEmail} to ${finalPlan}`);
    console.log(`Updated user document:`, {
      email: result.email,
      plan: result.plan,
      stripeCustomerId: result.stripeCustomerId,
      stripeSubscriptionId: result.stripeSubscriptionId,
    });
  }

  return result as User | null;
}

export async function updateUserPlanByCustomerId(
  stripeCustomerId: string,
  plan: UserPlan | "starter" | "pro", // Allow old plan names for backward compatibility
  options?: {
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    subscriptionStatus?: string | null;
    emailFallback?: string;
  }
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');

  // Migrate old plan names
  let finalPlan: UserPlan = plan as UserPlan;
  if (plan === "starter") finalPlan = "basic";
  if (plan === "pro") finalPlan = "premium";

  const update: Partial<User> = {
    plan: finalPlan,
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

export async function deleteUserByEmail(email: string): Promise<boolean> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.deleteOne({ email: normalizedEmail });
  
  return result.deletedCount > 0;
}

export async function updateUserProductDetails(
  email: string,
  productDetails: {
    link?: string;
    productName?: string;
    productDescription?: string;
    productBenefits?: string;
    keywords?: string;
  }
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        productDetails,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    console.error(`Failed to update product details: User with email ${normalizedEmail} not found in database`);
    return null;
  }
  
  return result as User;
}

export async function updateUserKeywords(
  email: string,
  keywords: string[]
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        keywords,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    console.error(`Failed to update keywords: User with email ${normalizedEmail} not found in database`);
    return null;
  }
  
  return result as User;
}

export async function updateUserSubreddits(
  email: string,
  subreddits: string[]
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        subreddits,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    console.error(`Failed to update subreddits: User with email ${normalizedEmail} not found in database`);
    return null;
  }
  
  return result as User;
}

export async function updateUserOnboardingStatus(
  email: string,
  onboardingCompleted: boolean
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        onboardingCompleted,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    console.error(`Failed to update onboarding status: User with email ${normalizedEmail} not found in database`);
    return null;
  }
  
  return result as User;
}

export async function updateUserAutoPilotStatus(
  email: string,
  autoPilotEnabled: boolean
): Promise<User | null> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  // Normalize email to lowercase for lookup
  const normalizedEmail = email.toLowerCase();
  
  const result = await usersCollection.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        autoPilotEnabled,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    console.error(`Failed to update auto-pilot status: User with email ${normalizedEmail} not found in database`);
    return null;
  }
  
  return result as User;
}

export async function getUsersWithAutoPilotEnabled(): Promise<User[]> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('usersv2');
  
  return usersCollection.find({ autoPilotEnabled: true }).toArray();
}

