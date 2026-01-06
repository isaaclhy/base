"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle } from "lucide-react";
import { useSetPlaygroundTab } from "@/components/playground-layout";

interface UsageData {
  currentCount: number;
  maxCount: number;
  weekStartDate: string;
  plan?: "free" | "premium";
  syncCounter?: number;
  maxSyncsPerDay?: number;
}

export function UsageProgress() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const setActiveTab = useSetPlaygroundTab();

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

  // Calculate remaining (countdown from max to 0)
  const remaining = Math.max(0, (usage.maxCount ?? 30) - (usage.currentCount ?? 0));
  // Invert percentage: start at 100% (fully filled) and decrease to 0% as credits are used
  const remainingPercentage = (remaining / (usage.maxCount ?? 30)) * 100;
  const activePlan = usage.plan || session.user?.plan || "free";
  const syncCounter = usage.syncCounter ?? 0;
  const maxSyncsPerDay = usage.maxSyncsPerDay ?? 2;
  const syncRemaining = Math.max(0, maxSyncsPerDay - syncCounter);

  return (
    <div className="px-4 pb-2">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-gray-600 px-2.5 py-0.5 text-xs font-medium text-white capitalize">
            {activePlan} plan
          </span>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Free Credits</span>
          <span className="text-muted-foreground">
            {remaining} / {usage?.maxCount ?? 30}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              remaining === 0
                ? "bg-destructive/70"
                : remaining <= (usage.maxCount ?? 30) * 0.2
                ? "bg-yellow-400"
                : "bg-primary/70"
            )}
            style={{ width: `${Math.min(remainingPercentage, 100)}%` }}
          />
        </div>
        <div className="mt-4 mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Sync Leads</span>
          <span className="text-muted-foreground">
            {syncRemaining} / {maxSyncsPerDay}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              syncRemaining === 0
                ? "bg-destructive/70"
                : syncRemaining <= maxSyncsPerDay * 0.5
                ? "bg-yellow-400"
                : "bg-primary/70"
            )}
            style={{ width: `${Math.min((syncRemaining / maxSyncsPerDay) * 100, 100)}%` }}
          />
        </div>
        {activePlan === "free" && (
          <Button
            size="sm"
            onClick={() => setActiveTab("pricing")}
            className="mt-4 w-full bg-black text-white hover:bg-black/90 text-xs flex items-center gap-1.5 justify-center"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            Upgrade to Premium
          </Button>
        )}
      </div>
    </div>
  );
}

