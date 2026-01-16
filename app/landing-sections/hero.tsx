"use client";

import { ArrowRight, Search, Radio } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function Hero() {
    const { data: session } = useSession();
    const router = useRouter();
    const [dotPositions, setDotPositions] = useState<Array<{ angle: number; radius: number; delay: number }>>([]);

    useEffect(() => {
        // Fixed positions for 5 dots
        const positions = [
            { angle: 45, radius: 45, delay: 0 },   // Top-right
            { angle: 105, radius: 40, delay: 5 },   // Bottom-right
            { angle: 1, radius: 5, delay: 10 },  // Bottom-left
            { angle: 315, radius: 39, delay: 15 },  // Top-left
            { angle: 270, radius: 40, delay: 20 },  // Middle-left
        ];
        setDotPositions(positions);
    }, []);

    const handleGetStarted = () => {
        if (session) {
            router.push("/playground");
        } else {
            signIn("google", { callbackUrl: "/playground" });
        }
    };
    
    return (
        <section id="hero" className="relative flex flex-col overflow-hidden px-4 py-20 sm:px-6 lg:px-20">
            <div className="mx-auto w-full max-w-7xl">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    {/* Left Column - Text Content */}
                    <div className="text-center lg:text-left space-y-8">
                        <div className="space-y-6">
                            {/* Status Indicator */}
                            <div className="flex items-center justify-center lg:justify-start">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border shadow-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                    <span className="text-xs text-foreground font-medium">Real-time Reddit monitoring</span>
                                </div>
                            </div>
                            
                            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
                                Turn Reddit users<br />
                                <span className="text-[#ff4500]">into customers</span>
                            </h1>
                            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                                Find high-potential Reddit posts where people are looking for solutions like yours. Organize them in one place and engage with AI-generated comments or on 
                            </p>
                        </div>
                        
                        <div className="flex flex-col items-center lg:items-start gap-4">
                            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                                <button
                                    onClick={handleGetStarted}
                                    className="inline-flex items-center justify-center rounded-lg bg-[#ff4500] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ff4500]/90 gap-2 shadow-lg"
                                >
                                    Find leads
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                                <p className="text-xs text-muted-foreground">No credit card required</p>
                            </div>
                            
                            {/* Join section */}
                            <div className="flex flex-col items-center lg:items-start gap-2 mt-2">
                                <p className="text-sm text-muted-foreground">
                                    Join <span className="font-semibold text-foreground">130+</span> founders and businesses
                                </p>
                                <div className="flex items-center -space-x-2">
                                    {/* Profile pictures */}
                                    <img 
                                        src="/avatars/avatar-1.jpg" 
                                        alt="Founder 1" 
                                        className="w-8 h-8 rounded-full border-2 border-background object-cover" 
                                    />
                                    <img 
                                        src="/avatars/avatar-2.jpg" 
                                        alt="Founder 2" 
                                        className="w-8 h-8 rounded-full border-2 border-background object-cover" 
                                    />
                                    <img 
                                        src="/avatars/avatar-3.jpg" 
                                        alt="Founder 3" 
                                        className="w-8 h-8 rounded-full border-2 border-background object-cover" 
                                    />
                                    <img 
                                        src="/avatars/avatar-4.jpg" 
                                        alt="Founder 4" 
                                        className="w-8 h-8 rounded-full border-2 border-background object-cover" 
                                    />
                                    {/* +X,XXX circle */}
                                    <span className="text-xs ml-4 font-medium text-muted-foreground">+130</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Radar Visualization */}
                    <div className="relative flex items-center justify-center">
                        <div className="relative w-full max-w-sm aspect-square">
                            {/* Radar Background Circles */}
                            <div className="absolute inset-0 rounded-full border-2 border-border/30"></div>
                            <div className="absolute inset-6 rounded-full border border-border/20"></div>
                            <div className="absolute inset-12 rounded-full border border-border/10"></div>
                            
                            {/* Scanning Line */}
                            <div className="absolute inset-0 rounded-full overflow-hidden">
                                <div className="absolute inset-0" style={{
                                    background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255, 69, 0, 0.1) 60deg, transparent 120deg)',
                                    animation: 'radar-scan 6s linear infinite'
                                }}></div>
                            </div>
                            
                            {/* Center Icon */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-[#ff4500] flex items-center justify-center shadow-lg">
                                    <Radio className="h-6 w-6 text-white" />
                                </div>
                            </div>
                            
                            {/* Reddit Post Dots (4 positions around the circle - random positions) */}
                            {dotPositions.length > 0 && dotPositions.map((dot, idx) => {
                                const angleRad = (dot.angle * Math.PI) / 180;
                                const x = 40 + dot.radius * Math.cos(angleRad);
                                const y = 50 + dot.radius * Math.sin(angleRad);
                                
                                return (
                                    <div
                                        key={idx}
                                        className="absolute"
                                        style={{
                                            left: `${x}%`,
                                            top: `${y}%`,
                                            transform: 'translate(-50%, -50%)',
                                        }}
                                    >
                                        {idx < 5 ? (
                                            <div className="relative z-10">
                                                {/* Dot */}
                                                <div className="w-2 h-2 rounded-full bg-[#ff4500] shadow-lg relative z-20"></div>
                                                {/* Reddit Post Preview - always visible, no animation, higher z-index, positioned inside radar */}
                                                <div 
                                                    className="absolute w-40 bg-background border border-border rounded-lg shadow-xl p-2 pointer-events-none whitespace-nowrap z-30" 
                                                    style={{ 
                                                        opacity: 1,
                                                        ...(idx === 0 && { top: '-150px', right: '150px' }),
                                                        ...(idx === 1 && { top: '-270px', left: '-65px' }),
                                                        ...(idx === 2 && { top: '0px', left: '-165px' }),
                                                        ...(idx === 3 && { top: '80px', left: '0px' }),
                                                        ...(idx === 4 && { top: '2px', left: '20px' }),
                                                    }}
                                                >
                                                    {/* Green badge */}
                                                    <div className="inline-flex items-center px-1 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 mb-1">
                                                        <span className="text-[8px] font-medium text-green-600 dark:text-green-400">Strong signal</span>
                                                    </div>
                                                    <div className="text-xs font-semibold text-foreground truncate">
                                                        {idx === 0 && "Looking for SaaS tools"}
                                                        {idx === 1 && "Need help finding customers"}
                                                        {idx === 2 && "Best way to get early users?"}
                                                        {idx === 3 && "How to validate my product idea"}
                                                        {idx === 4 && "Looking for marketing strategies"}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        {idx === 0 && "r/SaaS • 2m ago"}
                                                        {idx === 1 && "r/startups • 5m ago"}
                                                        {idx === 2 && "r/entrepreneur • 3m ago"}
                                                        {idx === 3 && "r/SideProject • 7m ago"}
                                                        {idx === 4 && "r/marketing • 4m ago"}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Dot only for other dots */
                                            <div className="w-2 h-2 rounded-full bg-[#ff4500] shadow-lg"></div>
                                        )}
                                    </div>
                                );
                            })}
                            
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
