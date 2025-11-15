import Link from "next/link";

export default function PricingSuccessPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold text-foreground">Thanks for upgrading!</h1>
          <p className="text-muted-foreground">
            Your payment was successful. Premium access will unlock automatically within a few moments.
            If you don't see the upgrade right away, refresh your session.
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/playground"
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to playground
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
