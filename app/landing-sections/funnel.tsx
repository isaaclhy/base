"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function FunnelSection() {
  const posts = [
    { subreddit: "r/startups", title: "How did you get your first 100 users?", time: "2m", upvotes: "2", color: "#ff4500" },
    { subreddit: "r/entrepreneur", title: "Best tools for early stage founders", time: "5h", upvotes: "1.2k", color: "#7193ff" },
    { subreddit: "r/SaaS", title: "Looking for SaaS recommendations", time: "1d", upvotes: "850", color: "#6de0af" },
    { subreddit: "r/indiebiz", title: "What marketing channels worked best for you?", time: "3h", upvotes: "450", color: "#ff6b9d" },
    { subreddit: "r/smallbusiness", title: "Need advice on customer acquisition", time: "6h", upvotes: "320", color: "#ffa500" },
    { subreddit: "r/growmybusiness", title: "How to find product-market fit?", time: "8h", upvotes: "280", color: "#9b59b6" },
  ];

  const tableRows = [
    { title: "How did you get your first 100 users?", subreddit: "r/startups", upvotes: "2", comments: "0" },
    { title: "Best tools for early stage founders", subreddit: "r/entrepreneur", upvotes: "1.2k", comments: "45" },
    { title: "Looking for SaaS recommendations", subreddit: "r/SaaS", upvotes: "850", comments: "12" },
    { title: "What marketing channels worked best for you?", subreddit: "r/indiebiz", upvotes: "450", comments: "28" },
    { title: "Need advice on customer acquisition", subreddit: "r/smallbusiness", upvotes: "320", comments: "15" },
    { title: "How to find product-market fit?", subreddit: "r/growmybusiness", upvotes: "280", comments: "9" },
    { title: "What's the best way to validate an idea?", subreddit: "r/startups", upvotes: "180", comments: "7" },
    { title: "How do you handle customer support as a solo founder?", subreddit: "r/indiebiz", upvotes: "95", comments: "12" },
    { title: "Looking for feedback on my MVP", subreddit: "r/entrepreneur", upvotes: "420", comments: "23" },
    { title: "Best pricing strategies for SaaS products?", subreddit: "r/SaaS", upvotes: "650", comments: "18" },
    { title: "How to build an email list from scratch?", subreddit: "r/smallbusiness", upvotes: "210", comments: "11" },
    { title: "What's your go-to stack for building MVPs?", subreddit: "r/startups", upvotes: "340", comments: "19" },
  ];

  return (
    <section className="relative overflow-hidden pt-16 sm:pt-24 pb-12 sm:pb-16 bg-background">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideDown {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-50%);
          }
        }
        @keyframes slideUp {
          0% {
            transform: translateY(-50%);
          }
          100% {
            transform: translateY(0);
          }
        }
        .slide-down {
          animation: slideDown 30s linear infinite;
        }
        .slide-up {
          animation: slideUp 30s linear infinite;
        }
      `}} />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            From scattered posts to organized opportunities
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg max-w-2xl mx-auto">
            SignalScouter monitors multiple subreddits and unifies all relevant posts into one easy-to-manage table.
          </p>
        </div>

        <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:items-start lg:gap-8">
          {/* Left: Multiple Subreddit Posts - Two Columns with Opposite Animations */}
          <div className="w-full lg:w-auto lg:max-w-md relative">
            <div className="grid grid-cols-2 gap-2">
              {/* Left Column - Slides Up */}
              <div className="h-[400px] overflow-hidden">
                <div className="slide-up">
                  {/* First set */}
                  <div className="space-y-2">
                    {posts.map((post, idx) => (
                      <div key={`post-left-1-${idx}`} className="relative rounded-lg border border-border bg-card p-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: post.color }}></div>
                          <span className="text-xs font-medium text-foreground">{post.subreddit}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-foreground line-clamp-2">{post.title}</div>
                          <div className="text-[10px] text-muted-foreground">{post.time} • {post.upvotes}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Duplicate set for seamless loop */}
                  <div className="space-y-2 mt-2">
                    {posts.map((post, idx) => (
                      <div key={`post-left-2-${idx}`} className="relative rounded-lg border border-border bg-card p-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: post.color }}></div>
                          <span className="text-xs font-medium text-foreground">{post.subreddit}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-foreground line-clamp-2">{post.title}</div>
                          <div className="text-[10px] text-muted-foreground">{post.time} • {post.upvotes}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Slides Down */}
              <div className="h-[400px] overflow-hidden">
                <div className="slide-down">
                  {/* First set */}
                  <div className="space-y-2">
                    {posts.map((post, idx) => (
                      <div key={`post-right-1-${idx}`} className="relative rounded-lg border border-border bg-card p-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: post.color }}></div>
                          <span className="text-xs font-medium text-foreground">{post.subreddit}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-foreground line-clamp-2">{post.title}</div>
                          <div className="text-[10px] text-muted-foreground">{post.time} • {post.upvotes}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Duplicate set for seamless loop */}
                  <div className="space-y-2 mt-2">
                    {posts.map((post, idx) => (
                      <div key={`post-right-2-${idx}`} className="relative rounded-lg border border-border bg-card p-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: post.color }}></div>
                          <span className="text-xs font-medium text-foreground">{post.subreddit}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-foreground line-clamp-2">{post.title}</div>
                          <div className="text-[10px] text-muted-foreground">{post.time} • {post.upvotes}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow from Reddit Posts to SignalScouter */}
          <div className="hidden lg:flex items-center justify-center flex-shrink-0 self-center">
            <ArrowRight className="h-6 w-6" style={{ color: '#ff4500' }} />
          </div>

          {/* Center: SignalScouter Logo/Icon */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center gap-0 z-10 self-center">
            <div className="rounded-full p-8">
              <Image 
                src="/favicon.ico" 
                alt="SignalScouter" 
                width={64} 
                height={64}
                className="h-16 w-16 rounded-lg"
              />
            </div>
            <span className="text-sm font-semibold text-foreground">SignalScouter</span>
          </div>

          {/* Arrow from SignalScouter to Leads Table */}
          <div className="hidden lg:flex items-center justify-center flex-shrink-0 self-center">
            <ArrowRight className="h-6 w-6" style={{ color: '#ff4500' }} />
          </div>

          {/* Right: Unified Table */}
          <div className="w-full lg:w-auto lg:max-w-md">
            <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden h-[400px] flex flex-col">
              {/* Table Header */}
              <div className="grid grid-cols-[60px_1fr_100px_120px] gap-2 items-center px-3 py-2 bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground flex-shrink-0">
                <div>Stats</div>
                <div>Title</div>
                <div>Subreddit</div>
                <div>Comments</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border overflow-y-auto flex-1">
                {tableRows.map((row, idx) => (
                  <div key={`row-${idx}`} className="grid grid-cols-[60px_1fr_100px_120px] gap-2 items-center px-3 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{row.upvotes}</span>
                      <span>•</span>
                      <span>{row.comments}</span>
                    </div>
                    <div className="text-xs text-foreground truncate">{row.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{row.subreddit}</div>
                    <div>
                      <button className="text-[10px] px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                        Generate Comment
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

