import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import stripe from "@/lib/stripe";

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
      return NextResponse.json({
        success: true,
        session: {
          id: checkoutSession.id,
          status: checkoutSession.status,
          payment_status: checkoutSession.payment_status,
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
