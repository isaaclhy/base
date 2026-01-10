"use client";

import { useState, useEffect, ReactNode } from "react";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Info, X, MessageSquare, Bell, CheckCircle2 } from "lucide-react";

const features = {
  free: [
    "5 keywords",
    "600 generated comments",
    "2 lead syncs per day",
  ],
  premium: [
    "24/7 Auto-pilot function",
    "10 keywords",
    "1,200 generated comments",
    "5 lead syncs per day",
  ],
  pro: [
    "1 to 1 onboarding call",
    "24/7 Automated Reddit Post search",
    "15 keywords",
    "1,500 generated comments",
    "10 lead syncs per day",
    "Engagement tracker",
    "Email notification on high potential posts",
  ],
};

interface PricingSectionProps {
  showCTAButtons?: boolean;
}

// Auto-pilot Icon Component with Animated Counter
function AutoPilotIcon({ icon, count }: { icon: ReactNode; count: number }) {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const steps = 60; // 60 steps for smooth animation
    const increment = count / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const nextCount = Math.min(Math.ceil(increment * currentStep), count);
      setDisplayCount(nextCount);

      if (currentStep >= steps || nextCount >= count) {
        setDisplayCount(count);
        clearInterval(timer);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [count]);

  return (
    <div className="relative">
      <div className="relative">
        {icon}
        {/* Badge with animated number */}
        <div className="absolute -top-2 -right-2 bg-[#ff4500] text-white rounded-full min-w-[32px] h-8 px-2 flex items-center justify-center text-sm font-bold shadow-lg">
          {displayCount >= count ? "99+" : displayCount}
        </div>
      </div>
    </div>
  );
}

export default function PricingSection({ showCTAButtons = true }: PricingSectionProps) {
  const { data: session, status } = useSession();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [showAutoPilotModal, setShowAutoPilotModal] = useState(false);

  const plan = (session?.user?.plan ?? "free") as "free" | "starter" | "premium" | "pro";
  const isStarter = plan === "starter";
  const isPremium = plan === "premium";
  const isPro = plan === "pro";
  const [checkoutPlan, setCheckoutPlan] = useState<"starter" | "premium" | null>(null);

  const handleCheckout = async (planType: "starter" | "premium") => {
    if (!session) {
      signIn(undefined, { callbackUrl: "/pricing" });
      return;
    }

    try {
      setIsCheckoutLoading(true);
      setCheckoutPlan(planType);
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planType }),
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
      setCheckoutPlan(null);
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
              Find the perfect conversations from Reddit to promote your product. On average, users retrieve 500+ high potential leads in their first week.
            </p>
          </div>
        )}

        <div className="grid w-full gap-6 md:grid-cols-2 mx-auto max-w-4xl justify-center">
          <div className={cn(
            "relative flex h-full flex-col rounded-2xl border border-border bg-background text-left transition-all hover:shadow-lg",
            showCTAButtons ? "gap-4 p-6" : "gap-6 p-8"
          )}>
            <div className="space-y-4">
              <div>
                <h3 className={cn("font-extrabold text-foreground", showCTAButtons ? "text-2xl" : "text-2xl")}>Starter</h3>
                <div className="mt-2">
                  <span className="text-3xl font-extrabold text-foreground">$15.99</span>
                  <span className="text-muted-foreground ml-1">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Perfect for getting started with Reddit marketing</p>
                <span className="inline-block rounded-full bg-[#ff4500] px-3 py-1 text-xs font-medium text-white mt-2">3-day free trial</span>
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
              status === "loading" ? (
                <Button disabled size="lg" className="mt-auto w-full opacity-70">
                  Checking your plan...
                </Button>
              ) : isStarter || isPremium || isPro ? (
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
                <div className="mt-auto space-y-2">
                  <Button
                    size="lg"
                    onClick={() => handleCheckout("starter")}
                    disabled={isCheckoutLoading && checkoutPlan === "starter"}
                    className="w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                  >
                    {isCheckoutLoading && checkoutPlan === "starter" ? "Redirecting..." : "Start 3-Day Free Trial"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">Cancel anytime</p>
                </div>
              )
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
                  <span className="text-3xl font-extrabold text-foreground">$29.99</span>
                  <span className="text-muted-foreground ml-1">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">For growing startups trying to grow fast</p>
                <span className="inline-block rounded-full bg-[#ff4500] px-3 py-1 text-xs font-medium text-white mt-2">3-day free trial</span>
              </div>
              
              <ul className={cn("space-y-3", showCTAButtons ? "text-sm" : "text-sm")}>
                {features.premium.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[#ff4500] flex-shrink-0 mt-0.5" />
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-foreground">{feature}</span>
                      {feature === "24/7 Auto-pilot function" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAutoPilotModal(true);
                          }}
                          className="text-[#ff4500] hover:text-[#ff4500]/80 transition-colors cursor-pointer"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            {showCTAButtons && (
              status === "loading" ? (
                <Button disabled size="lg" className="mt-auto w-full opacity-70">
                  Checking your plan...
                </Button>
              ) : isPremium || isPro ? (
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
                <div className="mt-auto space-y-2">
                  <Button
                    size="lg"
                    onClick={() => handleCheckout("premium")}
                    disabled={isCheckoutLoading && checkoutPlan === "premium"}
                    className="w-full bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                  >
                    {isCheckoutLoading && checkoutPlan === "premium" ? "Redirecting..." : "Start 3-Day Free Trial"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">Cancel anytime</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Auto-pilot Modal (without CTA button) */}
      {showAutoPilotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 bg-background rounded-lg shadow-xl border border-border p-6">
            <button
              onClick={() => setShowAutoPilotModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Animated Icons Section */}
            <div className="flex justify-center gap-12 mb-8 mt-4">
              {/* Reddit Messages Icon */}
              <AutoPilotIcon
                key={`message-${showAutoPilotModal}`}
                icon={<MessageSquare className="h-16 w-16 text-[#ff4500]" />}
                count={99}
              />
              
              {/* Notifications Icon */}
              <AutoPilotIcon
                key={`bell-${showAutoPilotModal}`}
                icon={<Bell className="h-16 w-16 text-blue-500" />}
                count={99}
              />
            </div>

            {/* Description Section */}
            <div className="space-y-4 text-left">
              <h2 className="text-2xl font-bold text-foreground">
                What is Auto-pilot?
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Auto-pilot automatically finds extremely high potential Reddit posts matching your keywords, 
                generates personalized comments using AI, and posts them for you. Set it once 
                and let it work 24/7 to engage with potential customers on Reddit while you focus 
                on building your product.
              </p>
              
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Post comments only on extremely high intent posts</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Comments are customized to abide by the subreddit rules</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Runs 24/7 without any human intervention</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
