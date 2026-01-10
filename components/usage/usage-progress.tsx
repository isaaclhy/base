"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Info } from "lucide-react";
import { useSetPlaygroundTab } from "@/components/playground-layout";

interface UsageData {
  currentCount: number;
  maxCount: number;
  weekStartDate: string;
  plan?: "free" | "basic" | "premium";
  syncCounter?: number;
  maxSyncsPerDay?: number;
  nextSyncReset?: string;
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

  // Calculate next refresh times
  const getNextWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Current Monday
    const currentMonday = new Date(now);
    currentMonday.setDate(diff);
    currentMonday.setHours(0, 0, 0, 0);
    
    // If we're past Monday this week, get next Monday
    const nextMonday = new Date(currentMonday);
    if (now.getTime() >= currentMonday.getTime()) {
      nextMonday.setDate(nextMonday.getDate() + 7);
    }
    return nextMonday;
  };

  const formatRefreshTime = (date: Date) => {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays === 0 && diffHours === 0) {
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffDays === 0) {
      return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays === 1) {
      return `tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
      return `on ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    }
  };

  const nextWeekStart = getNextWeekStart();
  const nextSyncReset = usage.nextSyncReset ? new Date(usage.nextSyncReset) : null;

  return (
    <div className="px-4 pb-2">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-gray-600 px-2.5 py-0.5 text-xs font-medium text-white capitalize">
            {activePlan} plan
          </span>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 group relative">
            <span className="font-medium text-foreground">Free Credits</span>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            <div className="absolute left-0 top-full mt-2 w-48 px-2 py-1.5 text-xs rounded-md bg-popover border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
              Refreshes {formatRefreshTime(nextWeekStart)}
            </div>
          </div>
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
          <div className="flex items-center gap-1.5 group relative">
            <span className="font-medium text-foreground">Sync Leads</span>
            {nextSyncReset && (
              <>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                <div className="absolute left-0 top-full mt-2 w-48 px-2 py-1.5 text-xs rounded-md bg-popover border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
                  Refreshes {formatRefreshTime(nextSyncReset)}
                </div>
              </>
            )}
          </div>
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

