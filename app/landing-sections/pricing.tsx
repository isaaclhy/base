"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const features = {
  free: [
    "Unlimited Manual Reddit Post Searches",
    "20 keywords",
    "30 generated comments",
    "Engagement tracker",
  ],
  premium: [
    "24/7 Automated Reddit Post search",
    "30 keywords",
    "1,200 generated comments",
    "Engagement tracker",
    "Email notification on high potential posts",
  ],
  pro: [
    "1 to 1 onboarding call",
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

  const plan = (session?.user?.plan ?? "free") as "free" | "premium" | "pro";
  const isPremium = plan === "premium";
  const isPro = plan === "pro";

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

  const handleTalkToUs = () => {
    const subject = encodeURIComponent("Interested in Pro Plan");
    const body = encodeURIComponent(`Hello,\n\nI'm interested in learning more about the Pro plan.\n\nBest regards`);
    window.location.href = `mailto:leehuanyoei2025@gmail.com?subject=${subject}&body=${body}`;
  };

  return (
    <section id="pricing" className={cn(
      "bg-background",
      showCTAButtons ? "py-6" : "py-16 sm:py-24"
    )}>
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center text-center">
        {!showCTAButtons && (
          <div className={cn("space-y-4 mb-6", showCTAButtons && "mb-4")}>
            <h2 className={cn(
              "font-extrabold tracking-tight text-foreground",
              showCTAButtons ? "text-2xl" : "text-3xl sm:text-5xl"
            )}>
              Start getting customers from Reddit
            </h2>
            <p className="max-w-2xl my-4 text-base text-muted-foreground">
              Find the perfect conversations from Reddit to promote your product.
            </p>
          </div>
        )}

        <div className="grid w-full gap-6 md:grid-cols-3 mx-auto">
          <div className={cn(
            "relative flex h-full flex-col rounded-2xl border border-border bg-background text-left transition-all hover:shadow-lg",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <div className="space-y-4">
              <div>
                <h3 className={cn("font-extrabold text-foreground", showCTAButtons ? "text-2xl" : "text-2xl")}>Free</h3>
                <div className="mt-2">
                  <span className="text-3xl font-extrabold text-foreground">$0</span>
                  <span className="text-muted-foreground ml-1">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Perfect for getting started with Reddit marketing</p>
              </div>
              
              <ul className={cn("space-y-3", showCTAButtons ? "text-sm" : "text-sm")}>
                {features.free.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {showCTAButtons && (
              <Button variant="outline" size="lg" disabled className="mt-auto w-full cursor-default">
                Included in your account
              </Button>
            )}
            {!showCTAButtons && (
              <Button variant="outline" size="lg" className="mt-auto w-full" disabled>
                Current plan
              </Button>
            )}
          </div>

          <div className={cn(
            "relative flex h-full flex-col rounded-2xl border-2 border-[#ff4500] bg-background text-left shadow-lg transition-all hover:shadow-xl",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#ff4500] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Popular
            </span>
            
            <div className="space-y-4">
              <div>
                <h3 className={cn("font-extrabold text-foreground", showCTAButtons ? "text-2xl" : "text-2xl")}>Premium</h3>
                <div className="mt-2">
                  <span className="text-3xl font-extrabold text-foreground">$19.99</span>
                  <span className="text-muted-foreground ml-1">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">For growing startups with multiple products to monitor</p>
              </div>
              
              <ul className={cn("space-y-3", showCTAButtons ? "text-sm" : "text-sm")}>
                {features.premium.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[#ff4500] flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {showCTAButtons && (
              status === "loading" ? (
                <Button disabled size="lg" className="mt-auto w-full opacity-70">
                  Checking your plan...
                </Button>
              ) : isPremium ? (
                <Button
                  size="lg"
                  variant="default"
                  onClick={handleManageBilling}
                  disabled={isPortalLoading}
                  className="mt-auto w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                >
                  {isPortalLoading ? "Opening portal..." : "Manage billing"}
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleCheckout}
                  disabled={isCheckoutLoading}
                  className="mt-auto w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                >
                  {isCheckoutLoading ? "Redirecting..." : "Upgrade to Premium"}
                </Button>
              )
            )}
          </div>

          <div className={cn(
            "relative flex h-full flex-col rounded-2xl border border-border bg-background text-left shadow-lg transition-all hover:shadow-xl",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <span className="absolute -top-3 right-4 rounded-full bg-[#ff4500] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Save 20%
            </span>
            <div className="space-y-4">
              <div>
                <h3 className={cn("font-extrabold text-foreground", showCTAButtons ? "text-2xl" : "text-2xl")}>Pro</h3>
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-normal text-muted-foreground line-through">$50</span>
                    <span className="text-3xl font-extrabold text-foreground">$39.99</span>
                    <span className="text-muted-foreground ml-1">/month</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">For serious businesses that need personalized support</p>
              </div>
              
              <ul className={cn("space-y-3", showCTAButtons ? "text-sm" : "text-sm")}>
                {features.pro.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[#ff4500] flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {showCTAButtons && (
              status === "loading" ? (
                <Button disabled size="lg" className="mt-auto w-full opacity-70">
                  Checking your plan...
                </Button>
              ) : isPro ? (
                <Button
                  size="lg"
                  variant="default"
                  onClick={handleManageBilling}
                  disabled={isPortalLoading}
                  className="mt-auto w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                >
                  {isPortalLoading ? "Opening portal..." : "Manage billing"}
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleTalkToUs}
                  className="mt-auto w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                >
                  Talk to us
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
