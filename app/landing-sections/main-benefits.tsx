"use client";

import { useState, useEffect } from "react";
import { Search, MessageSquare, BarChart3, Bell, ArrowUp, MessageCircle, TrendingUp, Mail, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Animated Leads Table Component
const AnimatedLeadsTable = () => {
    const sampleRows = [
        { ups: "2", comments: "0", title: "How did you get your first 100 users", subreddit: "r/startups", date: "2m ago" },
        { ups: "1.2k", comments: "45", title: "Best tools for early stage founders", subreddit: "r/entrepreneur", date: "5h ago" },
        { ups: "850", comments: "12", title: "Looking for SaaS recommendations", subreddit: "r/SaaS", date: "1d ago" },
        { ups: "3.5k", comments: "128", title: "What marketing channels work best?", subreddit: "r/marketing", date: "3h ago" },
        { ups: "420", comments: "8", title: "Need advice on pricing strategy", subreddit: "r/startups", date: "6h ago" },
        { ups: "2.1k", comments: "67", title: "How to validate product ideas quickly", subreddit: "r/entrepreneur", date: "4h ago" },
        { ups: "650", comments: "23", title: "Best CRM for small teams", subreddit: "r/SaaS", date: "8h ago" },
        { ups: "1.8k", comments: "89", title: "Customer acquisition strategies", subreddit: "r/marketing", date: "12h ago" },
    ];

    const [displayedRows, setDisplayedRows] = useState(sampleRows.slice(0, 4));
    const [nextRowIndex, setNextRowIndex] = useState(4);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            // Add new row at the top
            setDisplayedRows(prev => [sampleRows[nextRowIndex], ...prev.slice(0, 3)]);
            setNextRowIndex(prev => (prev + 1) % sampleRows.length);
            
            // Reset animation after transition
            setTimeout(() => setIsAnimating(false), 500);
        }, 3000); // Add new row every 3 seconds

        return () => clearInterval(interval);
    }, [nextRowIndex]);

    return (
        <div className="relative h-48 w-full max-w-full rounded-xl border border-border bg-background p-3 shadow-lg overflow-hidden">
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeInSlide {
                    from {
                        opacity: 0;
                        transform: translateY(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}} />
            <div className="space-y-2 h-full flex flex-col">
                {/* Table header */}
                <div className="grid grid-cols-[40px_60px_1fr_100px_80px] gap-2 text-[10px] font-semibold text-muted-foreground border-b border-border pb-1 flex-shrink-0">
                    <div></div>
                    <div>Stats</div>
                    <div>Title</div>
                    <div>Subreddit</div>
                    <div>Date</div>
                </div>
                {/* Table rows - scrollable */}
                <div className="space-y-1.5 flex-1 overflow-y-auto">
                    {displayedRows.map((row, index) => {
                        const isNewRow = index === 0 && isAnimating;
                        return (
                        <div
                            key={`${row.title}-${index}-${isNewRow ? Date.now() : ''}`}
                            className={cn(
                                "grid grid-cols-[40px_60px_1fr_100px_80px] gap-2 items-center py-1.5 border-b border-border/50 transition-all duration-500 ease-out",
                                isNewRow && "opacity-0 -translate-y-2"
                            )}
                            style={isNewRow ? {
                                animation: 'fadeInSlide 0.5s ease-out forwards'
                            } : {}}
                        >
                            <div className="h-3 w-3 rounded border border-border bg-white"></div>
                            <div className="flex items-center gap-1.5">
                                <ArrowUp className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px]">{row.ups}</span>
                                <MessageSquare className="h-3 w-3 text-muted-foreground ml-1" />
                                <span className="text-[10px]">{row.comments}</span>
                            </div>
                            <div className="text-[10px] text-foreground truncate">{row.title}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{row.subreddit}</div>
                            <div className="text-[10px] text-muted-foreground">{row.date}</div>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const mainBenefits = [
    {
        title: "24/7 Lead Generation",
        description: "Automatically scout for relevant Reddit posts based on your keywords, finding opportunities around the clock without manual monitoring.",
        icon: Search,
        infographic: <AnimatedLeadsTable />,
    },
    {
        title: "Automated Comments",
        description: "Generate customized, context-aware comments for each post that feel natural and help you soft-sell your product effectively.",
        icon: MessageSquare,
        infographic: (
            <div className="relative h-48 w-full max-w-full rounded-xl border border-[#1e1f20] bg-[#101216] p-3 shadow-lg overflow-hidden">
                <div className="space-y-2 h-full flex flex-col">
                    {/* Reddit Post */}
                    <div className="flex-1 space-y-1.5 overflow-y-auto">
                        <div className="flex items-center gap-2 text-[9px] text-[#8b8f95]">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#ff4500] text-[8px] font-semibold text-white">r</span>
                            <span className="font-semibold text-white">r/startups</span>
                            <span>•</span>
                            <span>2m ago</span>
                        </div>
                        <h3 className="text-[11px] font-semibold text-white leading-tight">
                            How did you get your first 100 users?
                        </h3>
                        <p className="text-[10px] leading-relaxed text-[#d7d9dc] line-clamp-2">
                            I'm launching soon and need advice on getting early users. What distribution channels worked for you?
                        </p>
                    </div>
                    
                    {/* Persona Toggle */}
                    <div className="flex-shrink-0 space-y-1.5">
                        <label className="text-[9px] text-[#8b8f95]">Persona:</label>
                        <div className="inline-flex items-center gap-1 border border-[#26282b] rounded-md p-0.5 bg-[#15181d]">
                            <button
                                type="button"
                                className="px-2 py-0.5 text-[9px] font-medium rounded transition-colors bg-[#ff4500] text-white"
                            >
                                Founder
                            </button>
                            <button
                                type="button"
                                className="px-2 py-0.5 text-[9px] font-medium rounded transition-colors text-white hover:text-white"
                            >
                                User
                            </button>
                        </div>
                    </div>
                    
                    {/* Generated Comment */}
                    <div className="flex-shrink-0 rounded-lg border border-[#26282b] bg-[#ff4500]/40 p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <MessageSquare className="h-3 w-3 text-white" />
                            <span className="text-[9px] font-semibold text-white">Generated Comment</span>
                        </div>
                        <p className="text-[9px] leading-relaxed text-white line-clamp-2">
                            As a founder, I've been through this. Try engaging in niche communities and providing value...
                        </p>
                    </div>
                </div>
            </div>
        ),
    },
    {
        title: "Engagement Tracking",
        description: "Track comment interactions and automate replies to keep conversations going and maximize your engagement opportunities.",
        icon: BarChart3,
        infographic: (
            <div className="relative h-48 w-full max-w-full rounded-xl border border-border bg-background p-3 shadow-lg overflow-hidden">
                <div className="space-y-2 h-full flex flex-col">
                    {/* Table header */}
                    <div className="grid grid-cols-[90px_1fr_120px] gap-2 text-[10px] font-semibold text-muted-foreground border-b border-border pb-1 flex-shrink-0 min-w-0">
                        <div>Status</div>
                        <div>Title</div>
                        <div>Engagement</div>
                    </div>
                    {/* Table rows */}
                    <div className="space-y-1.5 flex-1 overflow-y-auto">
                        <div className="grid grid-cols-[90px_1fr_120px] gap-2 items-center py-1.5 border-b border-border/50">
                            <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-emerald-500/10 text-emerald-500">
                                    Posted
                                </span>
                            </div>
                            <div className="text-[10px] text-foreground truncate">How did you get your first 100 users</div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                <div className="flex items-center gap-0.5">
                                    <ArrowUp className="h-3 w-3" />
                                    <span>12</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>3</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr_120px] gap-2 items-center py-1.5 border-b border-border/50">
                            <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-emerald-500/10 text-emerald-500">
                                    Posted
                                </span>
                            </div>
                            <div className="text-[10px] text-foreground truncate">Best tools for early stage founders</div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                <div className="flex items-center gap-0.5">
                                    <ArrowUp className="h-3 w-3" />
                                    <span>28</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>7</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr_120px] gap-2 items-center py-1.5 border-b border-border/50">
                            <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-emerald-500/10 text-emerald-500">
                                    Posted
                                </span>
                            </div>
                            <div className="text-[10px] text-foreground truncate">Looking for SaaS recommendations</div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                <div className="flex items-center gap-0.5">
                                    <ArrowUp className="h-3 w-3" />
                                    <span>45</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>11</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr_120px] gap-2 items-center py-1.5">
                            <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-emerald-500/10 text-emerald-500">
                                    Posted
                                </span>
                            </div>
                            <div className="text-[10px] text-foreground truncate">Customer acquisition strategies</div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                <div className="flex items-center gap-0.5">
                                    <ArrowUp className="h-3 w-3" />
                                    <span>67</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>15</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
    },
    {
        title: "Instant Notifications",
        description: "Get notified via email when high-potential posts are discovered, so you never miss a valuable opportunity to connect.",
        icon: Bell,
        infographic: (
            <div className="relative h-48 w-full max-w-full rounded-xl border border-border bg-[#101216] p-4 shadow-lg overflow-hidden">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold text-white">New Alert</span>
                    </div>
                    <div className="rounded-lg border border-[#26282b] bg-[#15181d] p-3">
                        <div className="flex items-start gap-2 mb-2">
                            <Mail className="h-3 w-3 text-primary mt-0.5" />
                            <div className="flex-1">
                                <p className="text-[10px] text-white font-medium">High-potential post found</p>
                                <p className="text-[9px] text-[#8b8f95] mt-0.5">2 minutes ago</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="h-5 w-5 rounded-full bg-[#ff4500] flex items-center justify-center text-[10px] text-white font-semibold">r</div>
                            <div className="flex-1">
                                <p className="text-[10px] text-white leading-tight">Best project management tools for startups?</p>
                                <p className="text-[9px] text-[#8b8f95] mt-0.5">r/startups • 45 upvotes</p>
                            </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <div className="h-4 w-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                                <span className="text-[9px] text-green-500 font-semibold">High</span>
                            </div>
                            <span className="text-[10px] text-[#8b8f95]">Potential</span>
                        </div>
                    </div>
                </div>
            </div>
        ),
    },
];

export default function MainBenefits() {
    return (
        <section className="relative overflow-hidden pt-10 sm:pt-14 pb-4 sm:pb-6 bg-gradient-to-b from-background to-muted/30">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl space-y-3 text-center mb-8">
                <span className="inline-flex items-center rounded-full bg-[#ff4500]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#ff4500]">
            Why founders choose us
          </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                        Automate leads, sales and engagements effortlessly
                    </h2>
                    <p className="text-base text-muted-foreground sm:text-lg">
                        We automate the entire process so you can focus on your product.
                    </p>
                </div>

                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    {mainBenefits.map((benefit) => {
                        const Icon = benefit.icon;
                        return (
                            <div
                                key={benefit.title}
                                className="group relative flex flex-col gap-4 rounded-2xl p-4 sm:p-6 transition-all overflow-hidden"
                            >
                                <div className="flex-1 space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4500]/10 text-[#ff4500] transition-colors group-hover:bg-[#ff4500]/20 flex-shrink-0">
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <h3 className="text-xl font-extrabold text-foreground">
                                                {benefit.title}
                                            </h3>
                                        </div>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {benefit.description}
                                        </p>
                                    </div>
                                    {benefit.infographic}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

