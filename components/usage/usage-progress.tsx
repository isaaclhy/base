"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface UsageData {
  currentCount: number;
  maxCount: number;
  weekStartDate: string;
  plan?: "free" | "premium";
}

export function UsageProgress() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!session?.user?.email) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/usage");
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error("Error fetching usage:", error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email]);

  // Fetch usage when session is available or when plan changes
  useEffect(() => {
    if (session?.user?.email) {
      fetchUsage();
    } else {
      setLoading(false);
    }
  }, [session?.user?.email, session?.user?.plan, fetchUsage]);

  // Listen for usage refresh events (triggered when new posts are generated)
  useEffect(() => {
    const handleRefresh = () => {
      fetchUsage();
    };

    window.addEventListener("refreshUsage", handleRefresh);
    return () => window.removeEventListener("refreshUsage", handleRefresh);
  }, [fetchUsage]);

  if (!session || loading || !usage) {
    return null;
  }

  const percentage = (usage.currentCount / usage.maxCount) * 100;
  const activePlan = usage.plan || session.user?.plan || "free";

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-white capitalize">
            {activePlan} plan
          </span>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Weekly Usage</span>
          <span className="text-muted-foreground">
            {usage?.currentCount ?? 0} / {usage?.maxCount ?? 200}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              percentage >= 100
                ? "bg-destructive"
                : percentage >= 80
                ? "bg-yellow-500"
                : "bg-primary"
            )}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

