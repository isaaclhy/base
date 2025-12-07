"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

const features = {
  free: [
    "Unlimited reddit post search",
    "200 generated comments",
    "Usage analytics",
  ],
  premium: [
    "Unlimited reddit post search",
    "10,000 generated comments",
    "Usage analytics",
  ],
};

export default function PricingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
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
    <div className="min-h-screen bg-background py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-4 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Simple pricing for growing teams
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Start free and upgrade when you need more scale. Premium unlocks higher usage limits and priority access to new tools.
          </p>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-2">
          <div className="flex h-full flex-col gap-6 rounded-2xl border border-border bg-card p-8 text-left shadow-sm">
            <div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Free
              </span>
              <h2 className="mt-4 text-3xl font-semibold text-foreground">$0</h2>
              <p className="text-muted-foreground">No credit card required</p>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {features.free.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="lg"
              disabled
              className="mt-auto cursor-default"
            >
              Included in your account
            </Button>
          </div>

          <div className="flex h-full flex-col gap-6 rounded-2xl border border-[#ff4500]/60 bg-white p-8 text-left shadow-[0_0_35px_-12px_rgba(255,69,0,0.65)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#ff4500] px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                  Premium
                </span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff4500] shadow-[0_0_0_1px_rgba(255,69,0,0.2)]">
                  Popular
                </span>
              </div>
              <h2 className="text-3xl font-semibold text-[#2d1510]">$13.99</h2>
              <p className="text-sm text-[#72341e]">per month, cancel anytime</p>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {features.premium.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {status === "loading" ? (
              <Button disabled size="lg" className="mt-auto opacity-70">
                Checking your plan...
              </Button>
            ) : isPremium ? (
              <Button
                size="lg"
                variant="default"
                onClick={handleManageBilling}
                disabled={isPortalLoading}
                className="mt-auto"
              >
                {isPortalLoading ? "Opening portal..." : "Manage billing"}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleCheckout}
                disabled={isCheckoutLoading}
                className="mt-auto"
              >
                {isCheckoutLoading ? "Redirecting..." : "Upgrade to Premium"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
