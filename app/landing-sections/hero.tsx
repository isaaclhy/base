"use client";

import { ArrowRight, MessageSquare, ArrowUp, TrendingUp, Zap, Eye } from "lucide-react";
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
        <section id="hero" className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl text-center relative z-10">
                <div className="space-y-6 mb-16">
                    <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
                        Find <span className="underline" style={{ textDecorationColor: 'oklch(0.65 0.22 30)', color: 'oklch(0.65 0.22 30)' }}>desperate users</span> on
                        <span className="block text-primary">Reddit in seconds</span>
                    </h1>
                    <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
                        Automatically discover high-potential Reddit posts, organize them in one place, and engage with AI-generated comments. On average, users retrieve 500+ high potential leads in their first week.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                        <button
                            onClick={handleGetStarted}
                            className="inline-flex items-center justify-center rounded-lg bg-[#ff4500] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[#ff4500]/90 gap-2"
                        >
                            Get Started Free
                            <ArrowRight className="h-5 w-5" />
                        </button>
                        <p className="text-sm text-muted-foreground">No credit card required</p>
                    </div>
                </div>

                {/* Visual Workflow Preview */}
                <div className="mx-auto w-full max-w-5xl">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="rounded-lg bg-[#ff4500]/10 p-2">
                                    <TrendingUp className="h-4 w-4 text-[#ff4500]" />
                                </div>
                                <div className="text-base font-bold text-muted-foreground">Reddits Captured</div>
                            </div>
                            <div className="flex items-baseline justify-between">
                                <div className="text-4xl font-extrabold text-foreground">1,247</div>
                                <div className="text-[9px] text-muted-foreground">Last 24 hours</div>
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="rounded-lg bg-[#ff4500]/10 p-2">
                                    <Zap className="h-4 w-4 text-[#ff4500]" />
                                </div>
                                <div className="text-base font-bold text-muted-foreground">High Potential Leads</div>
                            </div>
                            <div className="flex items-baseline justify-between">
                                <div className="text-4xl font-extrabold text-foreground">500+</div>
                                <div className="text-[9px] text-muted-foreground">In your first week</div>
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="rounded-lg bg-[#ff4500]/10 p-2">
                                    <Eye className="h-4 w-4 text-[#ff4500]" />
                                </div>
                                <div className="text-base font-bold text-muted-foreground">Total Views</div>
                            </div>
                            <div className="flex items-baseline justify-between">
                                <div className="text-4xl font-extrabold text-foreground">12.5k</div>
                                <div className="text-[9px] text-muted-foreground">Across all posts</div>
                            </div>
                                        </div>
                                    </div>
                    <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
                        {/* Realistic Leads Table Preview */}
                        <div className="p-6 bg-background">
                            <div className="rounded-lg border border-border bg-background overflow-hidden">
                                {/* Table Header */}
                                <div className="grid grid-cols-[60px_1fr_100px_80px_240px] gap-2 items-center px-4 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground">
                                    <div className="text-left pr-2">Stats</div>
                                    <div className="text-left px-1 pl-3">Title</div>
                                    <div className="text-left px-1">Subreddit</div>
                                    <div className="text-left px-1">Date</div>
                                    <div className="text-left px-1">Comments</div>
                                </div>
                                {/* Sample Rows - More realistic */}
                                <div>
                                    {[
                                        { title: "How did you get your first 100 users?", subreddit: "r/startups", upvotes: "2", comments: "0", date: "2m ago", isExpanded: true },
                                        { title: "Best tools for early stage founders", subreddit: "r/entrepreneur", upvotes: "1.2k", comments: "45", date: "5h ago" },
                                        { title: "Looking for SaaS recommendations", subreddit: "r/SaaS", upvotes: "850", comments: "12", date: "1d ago" },
                                        { title: "What marketing channels worked best for you?", subreddit: "r/indiebiz", upvotes: "450", comments: "28", date: "3h ago" },
                                        { title: "Need advice on customer acquisition", subreddit: "r/smallbusiness", upvotes: "320", comments: "15", date: "6h ago" },
                                        { title: "How to find product-market fit?", subreddit: "r/growmybusiness", upvotes: "280", comments: "9", date: "8h ago" },
                                        { title: "What's the best way to validate an idea?", subreddit: "r/startups", upvotes: "180", comments: "7", date: "12h ago" },
                                        { title: "How do you handle customer support as a solo founder?", subreddit: "r/indiebiz", upvotes: "95", comments: "12", date: "1d ago" },
                                        { title: "Looking for feedback on my MVP", subreddit: "r/entrepreneur", upvotes: "420", comments: "23", date: "4h ago" },
                                        { title: "Best pricing strategies for SaaS products?", subreddit: "r/SaaS", upvotes: "650", comments: "18", date: "7h ago" },
                                    ].map((row, idx) => (
                                        <div key={idx}>
                                            <div className={`grid grid-cols-[60px_1fr_100px_80px_240px] gap-2 ${row.isExpanded ? 'items-start' : 'items-center'} px-4 py-2.5 hover:bg-muted/30 transition-colors ${idx > 0 ? 'border-t border-border' : ''}`}>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pr-2">
                                                    <div className="flex items-center gap-0.5">
                                                        <ArrowUp className="h-3 w-3" />
                                                        <span>{row.upvotes}</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <MessageSquare className="h-3 w-3" />
                                                        <span>{row.comments}</span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-foreground truncate text-left px-1 pl-3">{row.title}</div>
                                                <div className="text-[10px] text-muted-foreground truncate text-left px-1">{row.subreddit}</div>
                                                <div className="text-[10px] text-muted-foreground text-left px-1">{row.date}</div>
                                                <div className="px-1">
                                                    {row.isExpanded ? (
                                                        <div className="w-[240px] space-y-2">
                                                            <textarea
                                                                readOnly
                                                                className="w-full min-h-[80px] text-xs text-foreground bg-background border border-border rounded-md p-2 resize-none overflow-hidden"
                                                                value="As a founder who's been through this, I'd recommend focusing on a few key channels. For me, Product Hunt launch + engaging in relevant Reddit communities worked best."
                                                            />
                                                            <div className="flex justify-start">
                                                                <button className="text-[9px] px-2 py-1 rounded bg-[#ff4500] text-white hover:bg-[#ff4500]/90 transition-colors">
                                                                    Post Comment
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                                        <div className="flex justify-start">
                                                            <button className="text-[10px] px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                                                                Generate Comment
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                    </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}