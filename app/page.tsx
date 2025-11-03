"use client";

import Navbar from "@/components/navbar";
import Hero from "./landing-sections/hero";
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
      {/* Footer */}
      <Footer />
    </div>
  );
}
