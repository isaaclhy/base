import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/auth";
import stripe from "@/lib/stripe";
import { getUserByEmail } from "@/lib/db/users";

const portalConfiguration = process.env.STRIPE_PORTAL_CONFIGURATION_ID;

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
      return NextResponse.json(
        { error: "No Stripe customer found." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: dbUser.stripeCustomerId,
      return_url: `${origin}/playground`,
    };

    if (portalConfiguration) {
      sessionParams.configuration = portalConfiguration;
    }

    const portalSession = await stripe.billingPortal.sessions.create(sessionParams);

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Error creating Stripe portal session:", error);
    return NextResponse.json(
      { error: "Failed to create billing portal session." },
      { status: 500 }
    );
  }
}
