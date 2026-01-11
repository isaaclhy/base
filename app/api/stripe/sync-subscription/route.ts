import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import stripe from "@/lib/stripe";
import { getUserByEmail, updateUserPlanByCustomerId } from "@/lib/db/users";

/**
 * API endpoint to sync subscription status from Stripe
 * This can be called when users return from the Stripe portal to ensure their plan is up-to-date
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const dbUser = await getUserByEmail(session.user.email);

    if (!dbUser?.stripeCustomerId) {
      return NextResponse.json({
        success: true,
        message: "No Stripe customer found",
        plan: dbUser?.plan || "free",
      });
    }

    // Fetch all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: dbUser.stripeCustomerId,
      status: "all",
      limit: 10,
    });

    // Find the most recent active/trialing subscription
    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === "active" || sub.status === "trialing"
    );

    // If no active subscription, or subscription is canceled/marked to cancel, set to free
    const isCanceled = !activeSubscription || 
                      activeSubscription.status === "canceled" ||
                      activeSubscription.status === "incomplete" ||
                      activeSubscription.status === "incomplete_expired" ||
                      activeSubscription.status === "unpaid" ||
                      activeSubscription.cancel_at_period_end === true;

    let plan: "basic" | "premium" | "free" = "free";

    if (!isCanceled && activeSubscription) {
      const priceId = activeSubscription.items?.data?.[0]?.price?.id;
      const basicPriceId = process.env.BASIC_PRICE_ID;
      const premiumPriceId = process.env.PREMIUM_PRICE_ID || "price_1Smit4IkxwGMep15ryH0rrho";

      if (priceId === basicPriceId) {
        plan = "basic";
      } else if (priceId === premiumPriceId) {
        plan = "premium";
      }
    }

    // Update user plan in database
    await updateUserPlanByCustomerId(dbUser.stripeCustomerId, plan, {
      stripeSubscriptionId: isCanceled ? null : activeSubscription?.id || null,
      stripePriceId: activeSubscription?.items?.data?.[0]?.price?.id || null,
      subscriptionStatus: activeSubscription?.status || null,
    });

    console.log(`Synced subscription for ${session.user.email}: plan=${plan}, subscriptionStatus=${activeSubscription?.status || 'none'}`);

    return NextResponse.json({
      success: true,
      plan,
      subscriptionStatus: activeSubscription?.status || null,
      cancelAtPeriodEnd: activeSubscription?.cancel_at_period_end || false,
    });
  } catch (error) {
    console.error("Error syncing subscription:", error);
    return NextResponse.json(
      { error: "Failed to sync subscription" },
      { status: 500 }
    );
  }
}
