"use client";

import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PlanCard() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  const plan = session.user.plan || "free";
  const isPremium = plan === "premium";

  return (
    <div className="px-4 pb-4">
      <div className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        isPremium && "border-orange-500/50 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/20 dark:to-background"
      )}>
        {isPremium && (
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold capitalize text-white">
                {plan} plan
              </span>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                Popular
              </span>
            </div>
          </div>
        )}
        {!isPremium && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Upgrade to unlock more features
            </p>
            <Link href="/pricing" className="block">
              <Button size="sm" variant="outline" className="w-full text-xs">
                Upgrade to Premium
              </Button>
            </Link>
          </div>
        )}
        {isPremium && (
          <p className="text-xs text-muted-foreground">
            Enjoying unlimited access
          </p>
        )}
      </div>
    </div>
  );
}

