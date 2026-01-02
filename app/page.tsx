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
      {/* Product Hunt Banner */}
      <a
        href="https://www.producthunt.com/products/signalscouter"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 bg-[#ff8c42] text-white py-2 px-4 text-sm font-medium hover:bg-[#ff7a2e] transition-colors text-center"
      >
        <span>🎉 We just launched on Product Hunt! Check out demo video</span>
      </a>
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
