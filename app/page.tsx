"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center p-16 bg-white dark:bg-black sm:items-start">
        <Link href="/playground" className="text-2xl font-medium text-blue-600">
          Go to Playground
        </Link>
        <p>dedw</p>
        <Button
          onClick={() => null}
        >Click me</Button>
      </main>
    </div>
  );
}
