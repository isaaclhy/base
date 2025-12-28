"use client";

import { Clock, DollarSign, TrendingUp } from "lucide-react";

export default function BenefitsSection() {
  return (
    <section className="relative overflow-hidden pt-20 sm:pt-28 pb-6 sm:pb-10">
      <div
        className="pointer-events-none absolute left-[10%] top-16 h-48 w-48 -translate-x-1/2 rounded-full bg-[#ffd8c5]/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[8%] top-32 h-40 w-40 translate-x-1/2 rounded-full bg-[#ffeadd]/50 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-3 text-center mb-12">

          <h2 className="text-3xl font-semibold tracking-tight text-[#2d1510] sm:text-4xl">
            Save time and money while scaling your outreach
          </h2>
          <p className="text-base text-[#663826] sm:text-lg">
            Automate your Reddit engagement to save hours weekly and reduce costs, all while increasing your ROI.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Left column - Reddit preview */}
          <div className="flex items-stretch">
            <div className="relative w-full h-full rounded-2xl border border-[#1e1f20] bg-[#101216] shadow-[0_16px_40px_-32px_rgba(0,0,0,0.65)] flex flex-col">
              <div className="flex items-start gap-3 p-4 text-[#d7d9dc] flex-1 min-h-full">
              <div className="hidden flex-col items-center gap-0.5 text-[#6e7176] sm:flex">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[11px] font-semibold transition hover:bg-[#ff4500]/15 hover:text-white"
                  aria-label="Upvote"
                >
                  ▲
                </button>
                <span className="text-[11px] font-semibold text-white">2</span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[11px] font-semibold transition hover:bg-[#7193ff]/15 hover:text-white"
                  aria-label="Downvote"
                >
                  ▼
                </button>
              </div>

                <div className="flex-1 flex flex-col justify-between min-h-full">
                  <div>
                <div className="flex flex-wrap items-center gap-2 text-[9px] text-[#8b8f95]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff4500] text-[9px] font-semibold text-white">
                      r
                    </span>
                    <span className="font-semibold text-white">r/startups</span>
                  </div>
                  <span>•</span>
                  <span>Posted by u/earlyphase_guy</span>
                  <span>•</span>
                    <span>2 mins ago</span>
                </div>
                  <h3 className="mt-2 text-base font-semibold text-white">
                    Please no BS junk - How did you get your first 100 users
                  </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px]">
                  <span className="rounded-full bg-[#1a4032] px-2 py-0.5 text-[#6de0af]">Software</span>
                </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#d7d9dc]">
                    Hello everyone, I am launching a product very soon. I want to know on how you got your first users.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#d7d9dc]">
                    What distribution channel you used?
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#d7d9dc]">
                    I have few people on waitlist, and I want to increase it ASAP before launching.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#d7d9dc]">
                    Would appreciate the insight.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#d7d9dc]">
                    Thanks
                  </p>

                <div className="mt-3 rounded-xl border border-[#26282b] bg-[#ff4500]/80 p-3.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-white">
                    Draft comment
                  </h4>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white">
                    What's your niche and where are those users actually hanging out online? I'm a founder too and struggled to turn early interest into a packed waitlist. Try writing helpful longform posts that solve one pain and link a waitlist, engage in niche communities by answering questions and subtly sharing value so people opt in, and run tiny targeted ads to validate messaging before scaling, each gets you real feedback fast. If you hit volume replying to threads, Bleamies helps find Reddit questions and auto-generate comments to share your product! Would love any feedback or to connect if you try it. Good luck!
                  </p>
                </div>
                </div>

                  <div className="mt-auto">
                <div className="mt-3 flex flex-col gap-2 text-[11px] text-[#8b8f95] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-[#6e7176]">
                      <span className="flex items-center gap-1 rounded-full bg-[#292c31] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#ffb799]">
                        Auto-post ready
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[#6e7176]">
                      <span className="flex items-center gap-1">
                        <span className="text-xs">💬</span>
                        <span>0 Comments</span>
                      </span>
                      <span>Share</span>
                      <span>Save</span>
                    </div>
                  </div>
                  <button className="inline-flex items-center justify-center rounded-full bg-[#ff4500] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-[#ff4500]/30 transition-transform hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#ff4500]/40">
                    Post comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>

          {/* Right column - Time saved (top) and Money saved (bottom) */}
          <div className="flex flex-col gap-4 h-full">
            {/* Top right - Time saved */}
            <div className="flex flex-col gap-3 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-[#ff6f3c]/20 backdrop-blur flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4500]/10 text-[#ff4500]">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#2d1510]">
                  Save 10+ Hours Weekly
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    No more manual Reddit scrolling
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    Automated lead discovery 24/7
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    Instant comment generation
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom right - Money saved */}
            <div className="flex flex-col gap-3 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-[#ff6f3c]/20 backdrop-blur flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4500]/10 text-[#ff4500]">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#2d1510]">
                  Save $1k+ Monthly
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    No need to hire outreach specialists
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    Scale without increasing headcount
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    Higher ROI on marketing spend
                  </p>
                </div>
              </div>
            </div>

            {/* ROI Card */}
            <div className="flex flex-col gap-3 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-[#ff6f3c]/20 backdrop-blur flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4500]/10 text-[#ff4500]">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#2d1510]">
                  10x+ ROI Potential
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    $13.9 cost vs leads and sales generated
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    People posting already need a solution
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#ff4500]"></div>
                  <p className="text-sm text-[#663826]">
                    Higher potential to convert
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
