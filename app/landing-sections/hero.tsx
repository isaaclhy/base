"use client";

import { ChatTextarea } from "@/components/ui/chat-textarea";
import { useState, useEffect } from "react";
import { RedditPost } from "@/lib/types";
import { Copy, Check } from "lucide-react";

export default function Hero() {
    const [redditPost, setRedditPost] = useState("");
    const [website, setWebsite] = useState("");
    const [callToAction, setCallToAction] = useState("");
    const [persona, setPersona] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [displayedText, setDisplayedText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Typing animation effect
    useEffect(() => {
        if (!result) {
            setDisplayedText("");
            return;
        }

        setDisplayedText("");
        let currentIndex = 0;

        const typeInterval = setInterval(() => {
            if (currentIndex < result.length) {
                setDisplayedText(result.slice(0, currentIndex + 1));
                currentIndex++;
            } else {
                clearInterval(typeInterval);
            }
        }, 20); // 20ms per character for smooth typing effect

        return () => clearInterval(typeInterval);
    }, [result]);

    const handleSubmit = async (message: string) => {
        // Display input values via console.log
        console.log({
            redditPost: redditPost,
            website: website,
            callToAction: callToAction,
            persona: persona,
            message: message
        });
        
        // Reset previous result and set loading state
        setResult(null);
        setIsLoading(true);
        
        // Fetch Reddit post data if URL is provided, then generate comment
        if (redditPost) {
            try {
                // Step 1: Fetch Reddit post
                const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(redditPost)}`);
                
                if (!redditResponse.ok) {
                    const errorData = await redditResponse.json();
                    throw new Error(errorData.error || "Failed to fetch Reddit post");
                }

                const redditData = await redditResponse.json();
                const post: RedditPost = redditData.post;
                
                // Extract post content (title + selftext)
                const postContent = `${post.title}\n\n${post.selftext || ""}`;

                // Step 2: Generate comment using OpenAI
                const generateResponse = await fetch("/api/openai/comment", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        productIdea: message,
                        productLink: website,
                        postContent: postContent,
                    }),
                });

                if (!generateResponse.ok) {
                    const errorData = await generateResponse.json();
                    throw new Error(errorData.error || "Failed to generate comment");
                }

                const generateData = await generateResponse.json();
                const comments = generateData.comments || [];
                
                // Display the first generated comment (or join all if multiple)
                if (comments.length > 0) {
                    setResult(comments[0] || comments.join("\n\n"));
                } else {
                    setResult("No comments generated");
                }
            } catch (error) {
                console.error("Error in comment generation flow:", error);
                // Show error message to user
                setResult(`Error: ${error instanceof Error ? error.message : "Failed to generate comment"}`);
            } finally {
                setIsLoading(false);
            }
        } else {
            // If no Reddit post URL, just store the message
            setResult(message);
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (result) {
            try {
                await navigator.clipboard.writeText(result);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error("Failed to copy text:", err);
            }
        }
    };
    
    return (
        <section id="hero" className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl text-center relative z-10">
                <div className="space-y-3 mb-12">
                    <h1 className="text-3xl font-bold sm:text-6xl lg:text-6xl">
                        Find <span className="underline" style={{ textDecorationColor: 'oklch(0.65 0.22 30)', color: 'oklch(0.65 0.22 30)' }}>desperate users</span> on
                        <span className="block text-primary">Reddit in seconds</span>
                    </h1>
                    <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-base">
                        Connect with users who already need and want your product.
                    </p>
                </div>

                <div className="mx-auto w-full max-w-5xl">
                    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg lg:flex-row lg:h-[500px]">
                        {/* Left: Form Container */}
                        <div className="flex flex-1 flex-col lg:max-w-2xl lg:border-r lg:border-border/50 lg:h-full lg:rounded-l-lg">
                            <ChatTextarea
                                redditPost={redditPost}
                                onRedditPostChange={setRedditPost}
                                website={website}
                                onWebsiteChange={setWebsite}
                                callToAction={callToAction}
                                onCallToActionChange={setCallToAction}
                                persona={persona}
                                onPersonaChange={setPersona}
                                disableCallToAction={true}
                                disablePersona={true}
                                onSend={handleSubmit}
                            />
                        </div>

                        {/* Right: Results Container */}
                        <div className="relative flex-1 overflow-hidden">
                            {isLoading ? (
                                <div className="flex h-full flex-col p-4">
                                    <div className="flex flex-1 flex-col items-center justify-center rounded-md bg-muted/20">
                                        <div className="mb-4 flex space-x-2">
                                            <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                                            <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                                            <div className="h-3 w-3 animate-bounce rounded-full bg-primary"></div>
                                        </div>
                                        <p className="text-center text-sm text-muted-foreground">
                                            Generating your Reddit comment...
                                        </p>
                                    </div>
                                </div>
                            ) : result ? (
                                <div className="flex h-full flex-col p-4">
                                    <div className="mb-2 flex justify-end">
                                        <button
                                            onClick={handleCopy}
                                            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="h-4 w-4" />
                                                    <span>Copied!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-4 w-4" />
                                                    <span>Copy</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto rounded-md bg-muted/30 p-4">
                                        <p className="whitespace-pre-wrap text-left text-base leading-relaxed">{displayedText}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full flex-col p-4">
                                    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
                                        <p className="text-center text-sm text-muted-foreground">
                                            Your generated Reddit comment will appear here
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}