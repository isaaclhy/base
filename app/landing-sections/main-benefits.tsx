"use client";

import { Search, MessageSquare, BarChart3, Bell, ArrowUp, MessageCircle, TrendingUp, Mail } from "lucide-react";

const mainBenefits = [
    {
        title: "24/7 Lead Generation",
        description: "Automatically scout for relevant Reddit posts based on your keywords, finding opportunities around the clock without manual monitoring.",
        icon: Search,
        infographic: (
            <div className="relative h-48 w-full rounded-xl border border-border bg-[#101216] p-4 shadow-lg">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span>Active monitoring</span>
                    </div>
                    <div className="rounded-lg border border-[#26282b] bg-[#15181d] p-3">
                        <div className="flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-[#ff4500] flex items-center justify-center text-[10px] text-white font-semibold">r</div>
                            <div className="flex-1 space-y-1">
                                <p className="text-[11px] text-white font-medium leading-tight">Best project management tools for startups?</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] text-[#8b8f95]">r/startups</span>
                                    <span className="text-[10px] text-[#8b8f95]">•</span>
                                    <span className="text-[10px] text-[#8b8f95]">45 upvotes</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Search className="h-3 w-3 text-primary" />
                        <span className="text-xs text-muted-foreground">Scanning 24/7...</span>
                    </div>
                </div>
            </div>
        ),
    },
    {
        title: "Automated Comments",
        description: "Generate customized, context-aware comments for each post that feel natural and help you soft-sell your product effectively.",
        icon: MessageSquare,
        infographic: (
            <div className="relative h-48 w-full rounded-xl border border-border bg-[#101216] p-4 shadow-lg">
                <div className="space-y-3">
                    <div className="rounded-lg border border-[#26282b] bg-[#15181d] p-3">
                        <div className="mb-2">
                            <p className="text-[11px] text-white font-medium leading-tight">Looking for project management solutions...</p>
                        </div>
                        <div className="rounded-lg bg-[#1a4032] p-2.5 border border-[#26282b]">
                            <div className="flex items-center gap-2 mb-1.5">
                                <MessageSquare className="h-3 w-3 text-[#6de0af]" />
                                <span className="text-[10px] font-semibold text-[#6de0af]">Generated Comment</span>
                            </div>
                            <p className="text-[10px] text-[#d7d9dc] leading-relaxed">
                                We've been using a similar approach and it's been working great for our team...
                            </p>
                        </div>
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
            <div className="relative h-48 w-full rounded-xl border border-border bg-[#101216] p-4 shadow-lg">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Engagement Stats</span>
                        <TrendingUp className="h-3 w-3 text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg bg-[#15181d] p-2 border border-[#26282b]">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="h-3 w-3 text-primary" />
                                <span className="text-xs text-[#8b8f95]">Replies</span>
                            </div>
                            <span className="text-xs font-semibold text-white">12</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-[#15181d] p-2 border border-[#26282b]">
                            <div className="flex items-center gap-2">
                                <ArrowUp className="h-3 w-3 text-green-500" />
                                <span className="text-xs text-[#8b8f95]">Upvotes</span>
                            </div>
                            <span className="text-xs font-semibold text-white">45</span>
                        </div>
                        <div className="h-8 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-primary">Auto-reply enabled</span>
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
            <div className="relative h-48 w-full rounded-xl border border-border bg-[#101216] p-4 shadow-lg">
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
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Automate leads, sales and engagements effortlessly
                    </h2>
                    <p className="text-base text-muted-foreground sm:text-lg">
                        We automate the entire process so you can focus on your product.
                    </p>
                </div>

                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {mainBenefits.map((benefit) => {
                        const Icon = benefit.icon;
                        return (
                            <div
                                key={benefit.title}
                                className="group relative flex flex-col gap-4 rounded-2xl p-6 transition-all"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ff4500]/10 text-[#ff4500] transition-colors group-hover:bg-[#ff4500]/20">
                                    <Icon className="h-6 w-6" />
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold text-foreground">
                                            {benefit.title}
                                        </h3>
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

