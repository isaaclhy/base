import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUserByEmail, getUserByEmail } from "@/lib/db/users";
import { getDatabase } from "@/lib/mongodb";
import stripe from "@/lib/stripe";

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const email = session.user.email.toLowerCase();

    // Get user to check for Stripe subscription
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Cancel any active Stripe subscriptions
    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        console.log(`Cancelled Stripe subscription: ${user.stripeSubscriptionId} for user: ${email}`);
      } catch (stripeError) {
        console.error(`Error cancelling Stripe subscription for user ${email}:`, stripeError);
        // Continue with deletion even if subscription cancellation fails
      }
    }

    // Delete user data from all MongoDB collections
    const db = await getDatabase();
    
    // 1. Delete all Reddit posts and analytics data
    const postsCollection = db.collection('postsv2');
    const postsDeleteResult = await postsCollection.deleteMany({ userId: email });
    console.log(`Deleted ${postsDeleteResult.deletedCount} posts for user: ${email}`);

    // 2. Usage history is preserved (not deleted) for analytics purposes
    // const usageCollection = db.collection('usage');
    // const usageDeleteResult = await usageCollection.deleteOne({ userId: email });

    // 3. Delete the user account and profile information
    const deleted = await deleteUserByEmail(email);
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete user account" },
        { status: 500 }
      );
    }
    console.log(`Deleted user account for: ${email}`);

    return NextResponse.json({ 
      success: true,
      deleted: {
        posts: postsDeleteResult.deletedCount,
        usage: 0, // Usage data is preserved
        user: deleted ? 1 : 0,
        subscription: user.stripeSubscriptionId ? 'cancelled' : 'none'
      }
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete account", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

