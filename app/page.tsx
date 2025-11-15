"use client";

import Navbar from "@/components/navbar";
import Hero from "./landing-sections/hero";
import BenefitsSection from "./landing-sections/benefits";
import PricingSection from "./landing-sections/pricing";
import Examples from "./landing-sections/example";
import Footer from "./landing-sections/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      {/* Navigation */}
      <Navbar />
      {/* Hero Section */}
      <Hero />
      {/* Examples Section */}
      <Examples />
      {/* Benefits Section */}
      <BenefitsSection />
      {/* Pricing Section */}
      <PricingSection showCTAButtons={false} />
      {/* Footer */}
      <Footer />
    </div>
  );
}
