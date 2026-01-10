import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import stripe from "@/lib/stripe";
import { updateUserPlanByEmail } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Verify the session belongs to the current user
    const sessionEmail = checkoutSession.customer_details?.email || checkoutSession.customer_email;
    if (sessionEmail?.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Session does not belong to current user" },
        { status: 403 }
      );
    }

    // Check if the session was completed successfully
    // For subscriptions with trials, payment_status can be "unpaid" but status should be "complete"
    if (checkoutSession.status === "complete") {
      // Update user plan synchronously as fallback (in case webhook hasn't processed yet)
      const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;
      const subscriptionId = typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;
      const priceId = checkoutSession.metadata?.price_id;
      
      // Get plan type from metadata
      let planType = (checkoutSession.metadata?.plan_type as string) || "premium";
      if (planType === "starter") planType = "basic";
      if (planType === "pro") planType = "premium";
      const finalPlanType = planType as "basic" | "premium";
      
      // Fetch subscription to get actual status (trialing for trials, active for immediate payments)
      let subscriptionStatus = "active"; // Default fallback
      if (checkoutSession.subscription) {
        const subscription = typeof checkoutSession.subscription === "string"
          ? await stripe.subscriptions.retrieve(checkoutSession.subscription)
          : checkoutSession.subscription;
        subscriptionStatus = subscription.status;
      }

      try {
        await updateUserPlanByEmail(session.user.email, finalPlanType, {
          stripeCustomerId: customerId ?? null,
          stripeSubscriptionId: subscriptionId ?? null,
          stripePriceId: priceId,
          subscriptionStatus: subscriptionStatus as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
        });
        console.log(`Verify-checkout: Updated user plan for ${session.user.email} to ${finalPlanType} with status ${subscriptionStatus}`);
      } catch (updateError) {
        console.error(`Verify-checkout: Error updating user plan (webhook will handle):`, updateError);
        // Don't fail the request - webhook will handle the update
      }

      return NextResponse.json({
        success: true,
        session: {
          id: checkoutSession.id,
          status: checkoutSession.status,
          payment_status: checkoutSession.payment_status,
          plan: finalPlanType,
        },
      });
    }

    return NextResponse.json({
      success: false,
      message: `Checkout session not completed. Status: ${checkoutSession.status}`,
    });
  } catch (error) {
    console.error("Error verifying checkout session:", error);
    return NextResponse.json(
      { error: "Failed to verify checkout session" },
      { status: 500 }
    );
  }
}
