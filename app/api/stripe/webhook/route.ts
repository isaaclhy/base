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
        // Migrate old plan names: "starter" -> "basic", "pro" -> "premium"
        let planType = (session.metadata?.plan_type as string) || "premium"; // Default to premium for backward compatibility
        if (planType === "starter") planType = "basic";
        if (planType === "pro") planType = "premium";
        
        const finalPlanType = planType as "basic" | "premium";

        console.log("Checkout session completed - Webhook received:", {
          eventId: event.id,
          sessionId: session.id,
          email,
          customerId,
          subscriptionId,
          priceId,
          planType: finalPlanType,
          metadata: session.metadata,
          customer_details: session.customer_details,
          customer_email: session.customer_email,
        });

        if (!email) {
          console.error("No email found in checkout session:", session.id);
          break;
        }

        try {
          // Fetch the actual subscription to get the correct status (trialing for trials, active for immediate payments)
          let subscriptionStatus = "active"; // Default fallback
          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              subscriptionStatus = subscription.status;
              console.log(`Subscription status for ${subscriptionId}: ${subscriptionStatus}`);
            } catch (subError) {
              console.error(`Error fetching subscription ${subscriptionId}:`, subError);
              // Fall back to default "active" if we can't fetch it
            }
          }

          const result = await updateUserPlanByEmail(email, finalPlanType, {
            stripeCustomerId: customerId ?? null,
            stripeSubscriptionId: subscriptionId ?? null,
            stripePriceId: priceId,
            subscriptionStatus: subscriptionStatus as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
          });

          if (!result) {
            console.error(`Failed to update user plan for email: ${email}`);
            // Try to find user by customer ID as fallback
            if (customerId) {
              console.log(`Attempting to update by customer ID: ${customerId}`);
              await updateUserPlanByCustomerId(customerId, finalPlanType, {
                stripeSubscriptionId: subscriptionId ?? null,
                stripePriceId: priceId,
                subscriptionStatus: subscriptionStatus as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
                emailFallback: email,
              });
            }
          } else {
            console.log(`Successfully updated user plan for ${email} to ${finalPlanType} with status ${subscriptionStatus}`);
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
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        
        console.log("Subscription updated event:", {
          customerId,
          status,
          cancelAtPeriodEnd,
          priceId,
          subscriptionId: subscription.id,
        });
        
        // If subscription is canceled or marked to cancel, set to free immediately
        // Also handle other non-active statuses (incomplete, incomplete_expired, past_due, unpaid, etc.)
        const isCanceled = status === "canceled" || 
                          status === "incomplete" || 
                          status === "incomplete_expired" ||
                          status === "unpaid" ||
                          cancelAtPeriodEnd === true;
        
        const isActiveOrTrialing = (status === "active" || status === "trialing") && !isCanceled;
        let plan: "basic" | "premium" | "free" = "free";
        
        if (isActiveOrTrialing) {
          // Determine plan based on price ID
          const basicPriceId = process.env.BASIC_PRICE_ID;
          const premiumPriceId = process.env.PREMIUM_PRICE_ID || "price_1Smit4IkxwGMep15ryH0rrho";
          
          if (priceId === basicPriceId) {
            plan = "basic";
          } else if (priceId === premiumPriceId) {
            plan = "premium";
          } else {
            // Default to premium for backward compatibility if price ID doesn't match
            plan = "premium";
          }
        }

        console.log(`Updating user plan for customer ${customerId}: plan=${plan}, status=${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}`);

        await updateUserPlanByCustomerId(customerId, plan, {
          stripeSubscriptionId: isActiveOrTrialing ? subscription.id : null,
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
