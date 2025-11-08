"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button
      onClick={() => signIn("google", { callbackUrl: "/playground" })}
      variant="default"
      size="sm"
    >
      Sign in with Google
    </Button>
  );
}

