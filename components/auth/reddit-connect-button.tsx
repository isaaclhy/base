"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";

export function RedditConnectButton() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Check if user has Reddit connected (you might want to fetch this from an API)
  // For now, we'll assume not connected and show the button

  const handleConnect = async () => {
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    setIsConnecting(true);
    try {
      // Redirect to Reddit OAuth
      window.location.href = "/api/reddit/auth";
    } catch (error) {
      console.error("Error connecting Reddit:", error);
      setIsConnecting(false);
    }
  };

  // Check connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (session?.user?.email) {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsConnected(data.connected);
          }
        } catch (error) {
          console.error("Error checking Reddit connection:", error);
        }
      }
    };
    checkConnection();
  }, [session?.user?.email]);

  // Check for success/error query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reddit_connected") === "success") {
      setIsConnected(true);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        <span>Reddit Connected</span>
      </div>
    );
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" />
          <span>Connect Reddit</span>
        </>
      )}
    </Button>
  );
}

