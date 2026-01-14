"use client";

import { ArrowRight, MessageSquare, ArrowUp, Search, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Hero() {
    const { data: session } = useSession();
    const router = useRouter();

    const handleGetStarted = () => {
        if (session) {
            router.push("/playground");
        } else {
            signIn("google", { callbackUrl: "/playground" });
        }
    };
    
    return (
        <section id="hero" className="relative flex min-h-screen flex-col overflow-hidden px-4 pt-20 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    {/* Left Column - Text Content */}
                    <div className="text-center lg:text-left space-y-8">
                        <div className="space-y-6">
                            {/* Status Indicator */}
                            <div className="flex items-center justify-center lg:justify-start">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span className="text-sm text-foreground font-medium">Real-time Reddit monitoring</span>
                                </div>
                            </div>
                            
                            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
                                Turn Reddit users<br />
                                <span className="text-[#ff4500]">into customers</span>
                            </h1>
                            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                                Find high-potential Reddit posts where people are looking for solutions like yours. Organize them in one place and engage with AI-generated comments.
                            </p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                            <button
                                onClick={handleGetStarted}
                                className="inline-flex items-center justify-center rounded-lg bg-[#ff4500] px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#ff4500]/90 gap-2 shadow-lg"
                            >
                                Find leads
                                <ArrowRight className="h-5 w-5" />
                            </button>
                            <p className="text-sm text-muted-foreground">No credit card required</p>
                        </div>
                    </div>

                    {/* Right Column - Product Demo Preview */}
                    <div className="relative">
                        <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
                            {/* Demo Header */}
                            <div className="bg-muted/50 border-b border-border px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        </div>
                                        <div className="text-sm font-medium text-foreground">Monitoring</div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">r/SaaS</div>
                                </div>
                            </div>

                            {/* Demo Content */}
                            <div className="p-6 bg-background space-y-4">
                                {/* Search/Post Preview */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Search className="h-4 w-4" />
                                        <span>Looking for a tool to monitor social mentions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-[#ff4500] animate-pulse" />
                                        <span className="text-sm text-muted-foreground italic">Analyzing...</span>
                                    </div>
                                </div>

                                {/* Leads Table Preview */}
                                <div className="rounded-lg border border-border bg-background overflow-hidden">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-[60px_1fr_100px] gap-2 items-center px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground">
                                        <div className="text-left">Stats</div>
                                        <div className="text-left">Title</div>
                                        <div className="text-left">Subreddit</div>
                                    </div>
                                    {/* Sample Rows */}
                                    <div>
                                        {[
                                            { title: "How did you get your first 100 users?", subreddit: "r/startups", upvotes: "2", comments: "0" },
                                            { title: "Best tools for early stage founders", subreddit: "r/entrepreneur", upvotes: "1.2k", comments: "45" },
                                            { title: "Looking for SaaS recommendations", subreddit: "r/SaaS", upvotes: "850", comments: "12" },
                                            { title: "What marketing channels worked best?", subreddit: "r/indiebiz", upvotes: "450", comments: "28" },
                                        ].map((row, idx) => (
                                            <div key={idx} className={`grid grid-cols-[60px_1fr_100px] gap-2 items-center px-4 py-2.5 hover:bg-muted/20 transition-colors ${idx > 0 ? 'border-t border-border' : ''}`}>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    <div className="flex items-center gap-0.5">
                                                        <ArrowUp className="h-3 w-3" />
                                                        <span>{row.upvotes}</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <MessageSquare className="h-3 w-3" />
                                                        <span>{row.comments}</span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-foreground truncate text-left">{row.title}</div>
                                                <div className="text-[10px] text-muted-foreground truncate text-left">{row.subreddit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Status Footer */}
                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        <span>Monitoring Reddit 24/7 for you</span>
                                    </div>
                                    <button className="text-xs text-[#ff4500] hover:underline">Product demo</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
