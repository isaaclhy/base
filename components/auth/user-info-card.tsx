"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, MoreVertical, Trash2, Loader2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export function UserInfoCard() {
  const { data: session } = useSession();
  const [imageError, setImageError] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReconnectingReddit, setIsReconnectingReddit] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  if (!session?.user) {
    return null;
  }

  const showImage = session.user.image && !imageError;

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  const handleDeleteAccount = () => {
    setShowDeleteModal(true);
    setIsMenuOpen(false);
  };

  const handleReconnectReddit = () => {
    setIsMenuOpen(false);
    setIsReconnectingReddit(true);
    // Start Reddit OAuth flow with reset flag to clear existing tokens
    window.location.href = "/api/reddit/auth?reset=1";
  };

  const clearAllCache = () => {
    try {
      // Clear main localStorage items
      localStorage.removeItem("productIdeas");
      localStorage.removeItem("redditLinks");
      localStorage.removeItem("savedQueries");

      // Collect all keys first (to avoid index shifting issues when removing)
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          allKeys.push(key);
        }
      }

      // Clear all cached comments (pattern: redditComment_*)
      const commentKeys = allKeys.filter((key) => key.startsWith("redditComment_"));
      commentKeys.forEach((key) => localStorage.removeItem(key));

      // Clear all cached posts (pattern: redditPost_*)
      const postKeys = allKeys.filter((key) => key.startsWith("redditPost_"));
      postKeys.forEach((key) => localStorage.removeItem(key));

      console.log(`Cleared ${commentKeys.length} cached comments and ${postKeys.length} cached posts`);
    } catch (error) {
      console.error("Error clearing cache:", error);
      // Continue with account deletion even if cache clearing fails
    }
  };

  const confirmDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete account");
      }

      // Clear all cached values before signing out
      clearAllCache();

      await signOut({ redirect: false });
      router.push("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to delete account. Please try again.");
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="border-t border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        {showImage ? (
          <div className="relative h-10 w-10 rounded-full border-2 border-border overflow-hidden flex-shrink-0">
            <img
              src={session.user.image || ''}
              alt={session.user.name || "User"}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground text-sm font-medium">
            {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {session.user.name || "User"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {session.user.email}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-full p-1.5 hover:bg-muted transition-colors"
            aria-label="User menu"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute bottom-full right-0 mb-2 z-20 w-48 rounded-md border border-border bg-card shadow-lg">
                <div className="p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs"
                    onClick={handleReconnectReddit}
                    disabled={isReconnectingReddit}
                  >
                    {isReconnectingReddit ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Reconnecting Reddit...
                      </>
                    ) : (
                      <>Reconnect Reddit</>
                    )}
                  </Button>
                </div>
                <div className="p-1 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete account
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-xs"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm transition-opacity"
            onClick={() => !isDeleting && setShowDeleteModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Delete Account</h3>
                </div>
                {!isDeleting && (
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete your account? This action cannot be undone and will permanently delete:
                </p>
                <ul className="text-sm text-muted-foreground space-y-2 mb-6 ml-4 list-disc">
                  <li>Your account and profile information</li>
                  <li>All your Reddit posts and analytics data</li>
                  <li>Your usage history and preferences</li>
                  <li>Any active subscriptions</li>
                </ul>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDeleteAccount}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

