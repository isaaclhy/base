"use client";

import Hero from "./landing-sections/hero";
import Examples from "./landing-sections/example";
import UseCase from "./landing-sections/use-case";
import FooterCTA from "./landing-sections/footer-cta";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      {/* Hero Section */}
      <Hero />
      {/* Examples Section */}
      <Examples />
      {/* Use Cases Section */}
      <UseCase />
      {/* Footer CTA */}
      <FooterCTA />
    </div>
  );
}
