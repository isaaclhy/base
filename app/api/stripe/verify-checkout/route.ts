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
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify the session belongs to this user
    const email = checkoutSession.customer_details?.email || checkoutSession.customer_email || checkoutSession.metadata?.email;
    if (email?.toLowerCase() !== session.user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: "Checkout session does not belong to this user" },
        { status: 403 }
      );
    }

    // Check if payment was successful
    if (checkoutSession.payment_status === "paid" && checkoutSession.status === "complete") {
      const priceId = checkoutSession.metadata?.price_id || checkoutSession.subscription?.toString();
      
      // Determine plan based on price ID
      let plan: "premium" | "pro" = "premium";
      // You can add logic here to determine if it's pro based on price ID
      
      // Update user plan directly (in case webhook hasn't processed yet)
      const customerId = typeof checkoutSession.customer === "string" 
        ? checkoutSession.customer 
        : checkoutSession.customer?.id;
      
      const subscriptionId = typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : checkoutSession.subscription?.id;

      try {
        await updateUserPlanByEmail(session.user.email, plan, {
          stripeCustomerId: customerId ?? null,
          stripeSubscriptionId: subscriptionId ?? null,
          stripePriceId: priceId || null,
          subscriptionStatus: "active",
        });

        return NextResponse.json({
          success: true,
          message: "Plan updated successfully",
        });
      } catch (error) {
        console.error("Error updating plan:", error);
        // If update fails, check if webhook already processed it
        return NextResponse.json({
          success: false,
          message: "Plan update may already be in progress",
        });
      }
    } else {
      return NextResponse.json(
        { error: "Payment not completed", payment_status: checkoutSession.payment_status },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error verifying checkout session:", error);
    return NextResponse.json(
      { error: "Failed to verify checkout session" },
      { status: 500 }
    );
  }
}

