"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 0);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const handleTryItOut = () => {
        // Scroll to the hero section where users can try it
        const heroSection = document.getElementById("hero");
        if (heroSection) {
            heroSection.scrollIntoView({ behavior: "smooth" });
        }
    };

    return (
        <nav className={isScrolled 
            ? "sticky top-0 z-50 w-full border-b border-border/50 bg-white/10 backdrop-blur-sm supports-[backdrop-filter]:bg-white/5"
            : "sticky top-0 z-50 w-full border-b border-border bg-white backdrop-blur supports-[backdrop-filter]:bg-white"
        }>
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center">
                    <h1 className="text-xl font-bold">GetRedditUserFast</h1>
                </div>
                <div className="flex items-center">
                    <Button onClick={handleTryItOut}>
                        I bet you want to try it out
                    </Button>
                </div>
            </div>
        </nav>
    );
}

