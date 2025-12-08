"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = {
  free: [
    "Unlimited reddit post search",
    "200 generated comments",
    "Usage analytics",
  ],
  premium: [
    "Unlimited reddit post search",
    "10,000 generated comments",
    "24/7 automated comment posting on relevant posts",
    "Usage analytics",
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
        <div className={cn("space-y-2 mb-6", showCTAButtons && "mb-4")}>
          <h2 className={cn(
            "font-bold tracking-tight text-foreground",
            showCTAButtons ? "text-2xl" : "text-3xl sm:text-4xl"
          )}>
            Simple pricing for growing teams
          </h2>
          {!showCTAButtons && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              Start free and upgrade when you need more scale. Premium unlocks higher usage limits and priority access to new tools.
            </p>
          )}
        </div>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className={cn(
            "flex h-full flex-col rounded-2xl border border-border bg-card text-left shadow-sm",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Free
              </span>
              <h3 className={cn("font-semibold text-foreground", showCTAButtons ? "mt-2 text-2xl" : "mt-4 text-3xl")}>$0</h3>
              <p className={cn("text-muted-foreground", showCTAButtons && "text-xs")}>No credit card required</p>
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
            "flex h-full flex-col rounded-2xl border border-[#ff4500]/60 bg-white text-left shadow-[0_0_35px_-12px_rgba(255,69,0,0.65)]",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <div className={showCTAButtons ? "space-y-2" : "space-y-3"}>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#ff4500] px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                  Premium
                </span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff4500] shadow-[0_0_0_1px_rgba(255,69,0,0.2)]">
                  Popular
                </span>
              </div>
              <h3 className={cn("font-semibold text-[#2d1510]", showCTAButtons ? "text-2xl" : "text-3xl")}>$13.99</h3>
              <p className={cn("text-[#72341e]", showCTAButtons ? "text-xs" : "text-sm")}>per month, cancel anytime</p>
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
