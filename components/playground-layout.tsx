"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Settings,
  FileText,
  BarChart3,
  Users,
  Menu,
  X,
  CreditCard,
} from "lucide-react";
import { UserInfoCard } from "@/components/auth/user-info-card";
import { UsageProgress } from "@/components/usage/usage-progress";

interface PlaygroundLayoutProps {
  children: React.ReactNode;
}

type TabId = "dashboard" | "analytics" | "billing";

const PlaygroundTabContext = createContext<{
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  sidebarOpen: boolean;
  refreshUsage: () => void;
}>({
  activeTab: "dashboard",
  setActiveTab: () => {},
  sidebarOpen: true,
  refreshUsage: () => {},
});

export function usePlaygroundTab() {
  const context = useContext(PlaygroundTabContext);
  return context.activeTab;
}

export function usePlaygroundSidebar() {
  const context = useContext(PlaygroundTabContext);
  return context.sidebarOpen;
}

export function useRefreshUsage() {
  const context = useContext(PlaygroundTabContext);
  return context.refreshUsage;
}

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: "dashboard", label: "Discovery", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "billing", label: "Manage billing", icon: CreditCard },
];

export default function PlaygroundLayout({ children }: PlaygroundLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [billingRedirecting, setBillingRedirecting] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const refreshUsage = () => {
    // Dispatch custom event to refresh usage
    window.dispatchEvent(new Event("refreshUsage"));
  };

  const openBillingPortal = useCallback(async () => {
    try {
      setBillingRedirecting(true);
      setBillingError(null);
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
      setBillingRedirecting(false);
      setBillingError(
        error instanceof Error ? error.message : "Unable to open billing portal."
      );
    }
  }, []);

  useEffect(() => {
    const checkScreenSize = () => {
      // lg breakpoint is 1024px in Tailwind
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Force sidebar open on laptop/desktop views
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (activeTab === "billing") {
      openBillingPortal();
    } else {
      setBillingRedirecting(false);
      setBillingError(null);
    }
  }, [activeTab, openBillingPortal]);

  const handleSidebarToggle = (open: boolean) => {
    // Only allow toggling on mobile
    if (isMobile) {
      setSidebarOpen(open);
    }
  };

  // Always show sidebar on laptop/desktop, respect state on mobile
  const isSidebarVisible = !isMobile || sidebarOpen;

  return (
    <PlaygroundTabContext.Provider value={{ activeTab, setActiveTab, sidebarOpen: isSidebarVisible, refreshUsage }}>
      <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out",
          isSidebarVisible ? "w-56" : "w-0 overflow-hidden"
        )}
      >
        {/* Sidebar Header */}
        {isSidebarVisible && (
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <Link href="/" className="text-lg font-semibold">
              GetUsersFromReddit
            </Link>
            {/* Only show close button on mobile */}
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSidebarToggle(false)}
                className="ml-auto"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}

        {/* Sidebar Navigation */}
        {isSidebarVisible && (
          <>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
            <UsageProgress />
            <UserInfoCard />
          </>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {isMobile && !sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSidebarToggle(true)}
            className="absolute left-4 top-4 z-50"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        {activeTab === "billing" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            {billingRedirecting ? (
              <>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span>Opening billing portal…</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This may open in a new tab. If nothing happens, click retry.
                </p>
              </>
            ) : billingError ? (
              <>
                <p className="text-sm text-destructive">{billingError}</p>
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={openBillingPortal}>
                    Retry
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("dashboard")}
                  >
                    Back to Discovery
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <span>Preparing billing portal…</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">{children}</div>
        )}
      </main>
    </div>
    </PlaygroundTabContext.Provider>
  );
}

