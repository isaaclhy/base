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

    const body = await request.json().catch(() => ({}));
    const planType = body.plan as "starter" | "premium" | undefined;

    if (!planType || (planType !== "starter" && planType !== "premium")) {
      return NextResponse.json(
        { error: "Invalid plan type. Must be 'starter' or 'premium'." },
        { status: 400 }
      );
    }

    // Get price ID based on plan type
    const priceId = planType === "starter" 
      ? (process.env.BASIC_PRICE_ID || "")
      : (process.env.PREMIUM_PRICE_ID || "price_1Smit4IkxwGMep15ryH0rrho");

    if (!priceId) {
      return NextResponse.json(
        { error: `${planType === "starter" ? "Basic" : "Premium"} price ID is not configured.` },
        { status: 500 }
      );
    }

    const dbUser = await getUserByEmail(session.user.email);

    // Check if user already has this plan or a higher plan
    if (planType === "starter" && (dbUser?.plan === "starter" || dbUser?.plan === "premium" || dbUser?.plan === "pro")) {
      return NextResponse.json(
        { error: `You are already on the ${dbUser.plan} plan.` },
        { status: 400 }
      );
    }

    if (planType === "premium" && (dbUser?.plan === "premium" || dbUser?.plan === "pro")) {
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
      cancel_url: `${origin}/playground?tab=pricing`,
      subscription_data: {
        trial_period_days: 3,
        metadata: {
          email: session.user.email,
          price_id: priceId,
          plan_type: planType,
        },
      },
      metadata: {
        email: session.user.email,
        price_id: priceId,
        plan_type: planType,
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
