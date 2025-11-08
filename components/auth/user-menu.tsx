"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function UserMenu() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!session?.user) {
    return null;
  }

  const showImage = session.user.image && !imageError;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
      >
        {showImage ? (
          <div className="relative h-6 w-6 rounded-full overflow-hidden flex-shrink-0">
            <img
              src={session.user.image || ''}
              alt={session.user.name || "User"}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {session.user.name?.charAt(0).toUpperCase() || "U"}
          </div>
        )}
        <span className="hidden sm:inline">{session.user.name || session.user.email}</span>
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-border bg-card shadow-lg">
            <div className="p-2">
              <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                {session.user.name || "User"}
              </div>
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {session.user.email}
              </div>
              <div className="mt-2 border-t border-border" />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

