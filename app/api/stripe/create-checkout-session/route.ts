import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import stripe from "@/lib/stripe";
import { getUserByEmail } from "@/lib/db/users";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID is not configured." },
        { status: 500 }
      );
    }

    const dbUser = await getUserByEmail(session.user.email);

    if (dbUser?.plan === "premium") {
      return NextResponse.json(
        { error: "You are already on the premium plan." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: dbUser?.stripeCustomerId ?? undefined,
      customer_email: dbUser?.stripeCustomerId ? undefined : session.user.email,
      allow_promotion_codes: true,
      success_url: `${origin}/playground?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      subscription_data: {
        metadata: {
          email: session.user.email,
          price_id: priceId,
        },
      },
      metadata: {
        email: session.user.email,
        price_id: priceId,
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Unable to create checkout session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
