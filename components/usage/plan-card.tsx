"use client";

import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSetPlaygroundTab } from "@/components/playground-layout";
import { usePathname } from "next/navigation";
import { ArrowUpCircle } from "lucide-react";

export function PlanCard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const setActiveTab = useSetPlaygroundTab();
  const isInPlayground = pathname === "/playground";

  if (!session?.user) {
    return null;
  }

  const plan = session.user.plan || "free";
  const isPremium = plan === "premium";

  const handleUpgrade = (e: React.MouseEvent) => {
    if (isInPlayground) {
      e.preventDefault();
      setActiveTab("pricing");
    }
    // Otherwise, let the Link handle navigation
  };

  return (
    <div className="px-4 pb-4">
      {!isPremium && (
        <Link href="/pricing" onClick={handleUpgrade} className="block">
          <Button size="sm" className="w-full bg-black text-white hover:bg-black/90 text-xs flex items-center gap-2 justify-center">
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade to Premium
          </Button>
        </Link>
      )}
      {isPremium && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold capitalize text-white">
            {plan} plan
          </span>
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            Popular
          </span>
        </div>
      )}
    </div>
  );
}

