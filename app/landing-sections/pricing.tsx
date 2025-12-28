"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = {
  free: [
    "Unlimited Manual Reddit Post Searches",
    "20 keywords",
    "30 generated comments",
    "Engagement tracker",
  ],
  premium: [
    "24/7 Automated Reddit Post search",
    "50 keywords",
    "2,000 generated comments",
    "Engagement tracker",
    "Email notification on high potential posts",
  ],
};

interface PricingSectionProps {
  showCTAButtons?: boolean;
}

export default function PricingSection({ showCTAButtons = true }: PricingSectionProps) {
  const { data: session, status } = useSession();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  const plan = session?.user?.plan ?? "free";
  const isPremium = plan === "premium";

  const handleCheckout = async () => {
    if (!session) {
      signIn(undefined, { callbackUrl: "/pricing" });
      return;
    }

    try {
      setIsCheckoutLoading(true);
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Unable to start checkout.");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error starting Stripe checkout:", error);
      alert(error instanceof Error ? error.message : "Unable to start checkout.");
      setIsCheckoutLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setIsPortalLoading(true);
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Unable to open billing portal.");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error opening billing portal:", error);
      alert(error instanceof Error ? error.message : "Unable to open billing portal.");
      setIsPortalLoading(false);
    }
  };

  return (
    <section id="pricing" className={cn(
      "bg-background",
      showCTAButtons ? "py-6" : "py-16 sm:py-24"
    )}>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 text-center">
        <div className={cn("space-y-4 mb-6", showCTAButtons && "mb-4")}>
          <h2 className={cn(
            "font-bold tracking-tight text-foreground",
            showCTAButtons ? "text-2xl" : "text-3xl sm:text-4xl"
          )}>
            Simple pricing for growing teams
          </h2>
          {!showCTAButtons && (
            <p className="max-w-2xl my-4 text-base text-muted-foreground">
              Start free and upgrade when you need more.
            </p>
          )}
        </div>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className={cn(
            "flex h-full flex-col rounded-2xl border border-border text-left shadow-sm",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <div>
              <h3 className={cn("font-semibold text-foreground", showCTAButtons ? "text-2xl" : "text-3xl")}>Free</h3>
              <p className={cn("text-muted-foreground mt-1", showCTAButtons ? "text-sm" : "text-base")}>$0 • No credit card required</p>
            </div>
            <ul className={cn("text-sm text-muted-foreground", showCTAButtons ? "space-y-2" : "space-y-3")}>
              {features.free.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {showCTAButtons && (
              <Button variant="outline" size={showCTAButtons ? "default" : "lg"} disabled className="mt-auto cursor-default">
                Included in your account
              </Button>
            )}
          </div>

          <div className={cn(
            "relative flex h-full flex-col rounded-2xl border border-[#ff4500]/60 text-left shadow-[0_0_35px_-12px_rgba(255,69,0,0.65)]",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#ff4500] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Popular
            </span>
            <div>
              <h3 className={cn("font-semibold text-[#2d1510]", showCTAButtons ? "text-2xl" : "text-3xl")}>Premium</h3>
              <p className={cn("text-[#72341e] mt-1", showCTAButtons ? "text-sm" : "text-base")}>$13.99 per month • Cancel anytime</p>
            </div>
            <ul className={cn("text-sm text-muted-foreground", showCTAButtons ? "space-y-2" : "space-y-3")}>
              {features.premium.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {showCTAButtons && (
              status === "loading" ? (
                <Button disabled size="default" className="mt-auto opacity-70">
                  Checking your plan...
                </Button>
              ) : isPremium ? (
                <Button
                  size="default"
                  variant="default"
                  onClick={handleManageBilling}
                  disabled={isPortalLoading}
                  className="mt-auto"
                >
                  {isPortalLoading ? "Opening portal..." : "Manage billing"}
                </Button>
              ) : (
                <Button
                  size="default"
                  onClick={handleCheckout}
                  disabled={isCheckoutLoading}
                  className="mt-auto"
                >
                  {isCheckoutLoading ? "Redirecting..." : "Upgrade to Premium"}
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
