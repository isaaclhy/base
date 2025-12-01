import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import stripe from "@/lib/stripe";
import { updateUserPlanByEmail, updateUserPlanByCustomerId } from "@/lib/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = (session.metadata?.email || session.customer_details?.email || session.customer_email)?.toLowerCase();
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const priceId = session.metadata?.price_id;

        console.log("Checkout session completed - Webhook received:", {
          eventId: event.id,
          sessionId: session.id,
          email,
          customerId,
          subscriptionId,
          priceId,
          metadata: session.metadata,
          customer_details: session.customer_details,
          customer_email: session.customer_email,
        });

        if (!email) {
          console.error("No email found in checkout session:", session.id);
          break;
        }

        try {
          const result = await updateUserPlanByEmail(email, "premium", {
            stripeCustomerId: customerId ?? null,
            stripeSubscriptionId: subscriptionId ?? null,
            stripePriceId: priceId,
            subscriptionStatus: "active",
          });

          if (!result) {
            console.error(`Failed to update user plan for email: ${email}`);
            // Try to find user by customer ID as fallback
            if (customerId) {
              console.log(`Attempting to update by customer ID: ${customerId}`);
              await updateUserPlanByCustomerId(customerId, "premium", {
                stripeSubscriptionId: subscriptionId ?? null,
                stripePriceId: priceId,
                subscriptionStatus: "active",
                emailFallback: email,
              });
            }
          } else {
            console.log(`Successfully updated user plan for ${email} to premium`);
          }
        } catch (error) {
          console.error(`Error updating user plan for ${email}:`, error);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const plan = status === "active" || status === "trialing" ? "premium" : "free";

        await updateUserPlanByCustomerId(customerId, plan, {
          stripeSubscriptionId: plan === "premium" ? subscription.id : null,
          stripePriceId: priceId,
          subscriptionStatus: status,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await updateUserPlanByCustomerId(customerId, "free", {
          stripeSubscriptionId: null,
          subscriptionStatus: subscription.status,
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error handling Stripe webhook:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
