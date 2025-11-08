"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserInfoCard() {
  const { data: session } = useSession();
  const [imageError, setImageError] = useState(false);
  const router = useRouter();

  if (!session?.user) {
    return null;
  }

  const showImage = session.user.image && !imageError;

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
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
    </div>
  );
}

