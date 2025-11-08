"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { SignInButton } from "@/components/auth/sign-in-button";
import { UserMenu } from "@/components/auth/user-menu";

export default function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const { data: session } = useSession();

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
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-4 min-w-0 flex-shrink">
                    <h1 className="text-lg sm:text-xl font-bold truncate">GetRedditUserFast</h1>
                    <Link 
                        href="/playground" 
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                    >
                        Playground
                    </Link>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {!session && (
                        <Button onClick={handleTryItOut} className="text-xs sm:text-sm whitespace-nowrap">
                            <span className="hidden sm:inline">I bet you want to try it out</span>
                            <span className="sm:hidden">Try it out</span>
                        </Button>
                    )}
                    {session ? <UserMenu /> : <SignInButton />}
                </div>
            </div>
        </nav>
    );
}

