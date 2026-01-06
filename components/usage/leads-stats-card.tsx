"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function LeadsStatsCard() {
  const { data: session } = useSession();
  const [totalLeadsGenerated, setTotalLeadsGenerated] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLeadsSinceLastSync, setNewLeadsSinceLastSync] = useState<number>(0);

  useEffect(() => {
    if (!session?.user?.email) {
      setLoading(false);
      return;
    }

    const fetchLeadsCount = async () => {
      try {
        // Fetch total leads generated from usage API
        const response = await fetch("/api/usage");
        if (response.ok) {
          const data = await response.json();
          setTotalLeadsGenerated(data.totalLeadsGenerated ?? 0);
        }
      } catch (error) {
        console.error("Error fetching leads count:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeadsCount();

    // Load new leads count from localStorage
    try {
      const saved = localStorage.getItem("newLeadsSinceLastSync");
      if (saved) {
        const count = parseInt(saved, 10);
        if (!isNaN(count)) {
          setNewLeadsSinceLastSync(count);
        }
      }
    } catch (e) {
      console.error("Error loading newLeadsSinceLastSync:", e);
    }

    // Listen for refresh events (when new leads are synced)
    const handleRefresh = async () => {
      // Refresh total leads from API
      try {
        const response = await fetch("/api/usage");
        if (response.ok) {
          const data = await response.json();
          setTotalLeadsGenerated(data.totalLeadsGenerated ?? 0);
        }
      } catch (error) {
        console.error("Error fetching leads count:", error);
      }
      // Also refresh new leads count from localStorage
      try {
        const saved = localStorage.getItem("newLeadsSinceLastSync");
        if (saved) {
          const count = parseInt(saved, 10);
          if (!isNaN(count)) {
            setNewLeadsSinceLastSync(count);
          }
        }
      } catch (e) {
        console.error("Error loading newLeadsSinceLastSync:", e);
      }
    };

    window.addEventListener("refreshUsage", handleRefresh);
    return () => window.removeEventListener("refreshUsage", handleRefresh);
  }, [session?.user?.email]);

  if (!session || loading) {
    return null;
  }

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="text-xs text-muted-foreground mb-1">
          Generated Leads
        </div>
        <div className="text-2xl font-semibold text-foreground">
          {totalLeadsGenerated !== null ? totalLeadsGenerated : 0}
        </div>
        {newLeadsSinceLastSync > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            <span className="font-bold">+{newLeadsSinceLastSync}</span> added since last sync
          </div>
        )}
      </div>
    </div>
  );
}

