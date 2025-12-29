"use client";

import Navbar from "@/components/navbar";
import Hero from "./landing-sections/hero";
import BenefitsSection from "./landing-sections/benefits";
import MainBenefits from "./landing-sections/main-benefits";
import FunnelSection from "./landing-sections/funnel";
import PricingSection from "./landing-sections/pricing";
import Footer from "./landing-sections/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-sans">
      {/* Navigation */}
      <Navbar />
      {/* Hero Section */}
      <Hero />
      {/* Main Benefits Section */}
      <MainBenefits />
      {/* Funnel Section */}
      <FunnelSection />
      {/* Benefits Section */}
      <BenefitsSection />
      {/* Pricing Section */}
      <PricingSection showCTAButtons={false} />
      {/* Footer */}
      <Footer />
    </div>
  );
}
