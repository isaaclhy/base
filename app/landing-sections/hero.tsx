"use client";

import { ChatTextarea } from "@/components/ui/chat-textarea";
import { useState } from "react";
import { RedditPost } from "@/lib/types";

export default function Hero() {
    const [redditPost, setRedditPost] = useState("");
    const [website, setWebsite] = useState("");
    const [callToAction, setCallToAction] = useState("");
    const [persona, setPersona] = useState("");
    const [result, setResult] = useState<string | null>(null);

    const handleSubmit = async (message: string) => {
        // Display input values via console.log
        console.log({
            redditPost: redditPost,
            website: website,
            callToAction: callToAction,
            persona: persona,
            message: message
        });
        
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
            }
        } else {
            // If no Reddit post URL, just store the message
            setResult(message);
        }
    };
    
    return (
        <section className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl text-center">
                <h1 className="mb-6 text-3xl font-bold sm:text-6xl lg:text-6xl">
                    Find <span className="underline" style={{ textDecorationColor: 'oklch(0.65 0.22 30)', color: 'oklch(0.65 0.22 30)' }}>desperate users</span> on
                    <span className="block text-primary">Reddit in seconds</span>
                </h1>
                <p className="mx-auto mb-8 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    The all-in-one platform that helps you achieve more. Powerful features,
                    beautiful design, and seamless experience.
                </p>

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
                                onSend={handleSubmit}
                            />
                        </div>

                        {/* Right: Results Container */}
                        <div className="flex-1 p-6 lg:overflow-y-auto">
                            <h3 className="mb-4 text-lg font-semibold">Generated Comment</h3>
                            {result ? (
                                <div className="rounded-md border border-border bg-muted/30 p-4">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
                                </div>
                            ) : (
                                <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
                                    <p className="text-center text-sm text-muted-foreground">
                                        Your generated Reddit comment will appear here
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}