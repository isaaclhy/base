"use client";

import { useSession } from "next-auth/react";

export function PlanCard() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  const plan = session.user.plan || "free";
  const isPremium = plan === "premium";

  return (
    <div className="px-4 pb-4">
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

