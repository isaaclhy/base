"use client";

import { MessageSquare, Compass, Send } from "lucide-react";

const benefits = [
  {
    title: "Find related Reddit posts automatically",
    description: "Skip the scrolling. We surface threads that match your audience in real time.",
  },
  {
    title: "Generate tailor-made comments",
    description: "Turn post context into a relevant reply that sounds like you wrote it.",
  },
  {
    title: "Post comments automatically",
    description: "Approve once and we publish your comment instantly to Reddit.",
  },
];

const desktopArrowOffsets = [100, 240, 380];
const compactArrowOffsets = [80, 190, 300];
const calloutConfig = [
  { side: "left" as const, top: 20 },
  { side: "left" as const, top: 260 },
  { side: "right" as const, top: 240 },
];

export default function BenefitsSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
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
          <span className="inline-flex items-center rounded-full bg-[#ff4500]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#ff4500]">
            Why founders choose us
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-[#2d1510] sm:text-4xl">
            Ship meaningful conversations without manual busywork
          </h2>
          <p className="text-base text-[#663826] sm:text-lg">
            Automate the parts that drain your time while keeping your outreach personal, relevant, and effective.
          </p>
        </div>

        <div className="relative mx-auto flex w-full max-w-5xl justify-center">
          {/* Left callouts with arrows (desktop) */}
          {benefits.map((benefit, index) => {
            const config = calloutConfig[index];
            return (
              <div
                key={benefit.title}
                className="hidden w-64 max-w-xs text-left lg:flex"
                style={{
                  position: "absolute",
                  top: `${config.top}px`,
                  ...(config.side === "left" ? { left: "-20px" } : { right: "-20px" }),
                }}
              >
                <div className="relative flex flex-col gap-2.5 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-[#ff6f3c]/20 backdrop-blur">
                  <span className="text-base font-semibold text-[#2d1510] text-left text-balance">
                    {benefit.title}
                  </span>
                  <p className="text-xs leading-relaxed text-[#663826]">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Central Reddit-style preview */}
          <div className="relative w-full max-w-lg rounded-2xl border border-[#1e1f20] bg-[#101216] shadow-[0_16px_40px_-32px_rgba(0,0,0,0.65)]">
            <div className="flex items-start gap-3 p-4 text-[#d7d9dc]">
              <div className="hidden flex-col items-center gap-0.5 text-[#6e7176] sm:flex">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[11px] font-semibold transition hover:bg-[#ff4500]/15 hover:text-white"
                  aria-label="Upvote"
                >
                  ▲
                </button>
                <span className="text-[11px] font-semibold text-white">123</span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[11px] font-semibold transition hover:bg-[#7193ff]/15 hover:text-white"
                  aria-label="Downvote"
                >
                  ▼
                </button>
              </div>

              <div className="flex-1">
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
                  <span>3 days ago</span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-white">
                  I finally found a habit tracker that actually works for me
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px]">
                  <span className="rounded-full bg-[#1a4032] px-2 py-0.5 text-[#6de0af]">Software</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#d7d9dc]">
                  I’ve always sucked at keeping habits. I’d do something one day, then forget the next. I tried a bunch of apps, they all show just one day at a time, not a whole week, so I don’t understand what’s the progress.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#d7d9dc]">
                  What I needed was to see my week like okay, I did it 4 times this week, not perfect, but progress. After hours of searching I found this small app and it just worked for me. The dev listens, updates quickly, and now I can even add notes for habits.
                </p>

                <div className="mt-3 rounded-xl border border-[#26282b] bg-[#15181d] p-3.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#9fa4ac]">
                    Draft comment
                  </h4>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#f2f4f7]">
                    Love seeing this! We run a daily Reddit sweep to surface posts like these and jump in when it’s a great fit for our product. Want a breakdown of the exact automation we use? Happy to share what finds threads like this in seconds.
                  </p>
                </div>

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
                        <span>37 Comments</span>
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

        {/* Mobile callouts */}
        <div className="mt-12 grid gap-4 lg:hidden">
          {benefits.map((benefit) => {
            return (
              <div
                key={benefit.title}
                className="flex flex-col gap-2 rounded-2xl border border-[#ff6f3c]/20 bg-white/90 p-5 shadow-sm"
              >
                <h3 className="text-base font-semibold text-[#2d1510]">{benefit.title}</h3>
                <p className="text-xs leading-relaxed text-[#663826]">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
