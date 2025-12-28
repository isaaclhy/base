"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  initialStep?: number;
}

interface SubredditSuggestion {
  name: string;
  displayName: string;
  subscribers: number;
}

export function OnboardingModal({ isOpen, onComplete, initialStep = 1 }: OnboardingModalProps) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  
  // Check if we're returning from Reddit OAuth
  useEffect(() => {
    if (isOpen && searchParams.get("reddit_connected") === "success") {
      setCurrentStep(3);
      // Check connection status after a short delay to allow tokens to be saved
      setTimeout(async () => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
          }
        } catch (error) {
          console.error("Error checking Reddit connection:", error);
        }
      }, 1000);
    }
  }, [isOpen, searchParams]);
  
  // Step 1: Product info
  const [productName, setProductName] = useState("");
  const [productLink, setProductLink] = useState("");
  const [productDescription, setProductDescription] = useState("");
  
  // Step 2: Subreddits
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [subredditInput, setSubredditInput] = useState("");
  const [subredditSuggestions, setSubredditSuggestions] = useState<SubredditSuggestion[]>([]);
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [showSubredditDropdown, setShowSubredditDropdown] = useState(false);
  const subredditInputRef = useRef<HTMLInputElement>(null);
  const subredditDropdownRef = useRef<HTMLDivElement>(null);
  
  // Step 3: Reddit connection
  const [isConnectingReddit, setIsConnectingReddit] = useState(false);
  const [isRedditConnected, setIsRedditConnected] = useState(false);

  // Check Reddit connection status
  useEffect(() => {
    if (currentStep === 3 && isOpen) {
      const checkRedditConnection = async () => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
          }
        } catch (error) {
          console.error("Error checking Reddit connection:", error);
        }
      };
      checkRedditConnection();
      // Poll every 2 seconds to check if Reddit was connected after redirect
      const interval = setInterval(checkRedditConnection, 2000);
      return () => clearInterval(interval);
    }
  }, [currentStep, isOpen]);

  // Debounced subreddit search
  useEffect(() => {
    if (!subredditInput.trim() || subredditInput.length < 2) {
      setSubredditSuggestions([]);
      setShowSubredditDropdown(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingSubreddits(true);
      try {
        const response = await fetch(`/api/reddit/search-subreddits?q=${encodeURIComponent(subredditInput)}`);
        if (response.ok) {
          const data = await response.json();
          setSubredditSuggestions(data.subreddits || []);
          setShowSubredditDropdown(true);
        }
      } catch (error) {
        console.error("Error searching subreddits:", error);
      } finally {
        setIsLoadingSubreddits(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [subredditInput]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        subredditDropdownRef.current &&
        !subredditDropdownRef.current.contains(event.target as Node) &&
        subredditInputRef.current &&
        !subredditInputRef.current.contains(event.target as Node)
      ) {
        setShowSubredditDropdown(false);
      }
    };

    if (showSubredditDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSubredditDropdown]);

  // Fuzzy match function for subreddit suggestions
  const fuzzyMatch = (query: string, text: string): number => {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (textLower.startsWith(queryLower)) return 100;
    if (textLower.includes(queryLower)) return 50;
    
    let score = 0;
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        score += 10;
        queryIndex++;
      }
    }
    return queryIndex === queryLower.length ? score : 0;
  };

  const handleAddSubreddit = (subredditName: string) => {
    const normalizedName = subredditName.toLowerCase().replace(/^r\//, "");
    if (!subreddits.includes(normalizedName) && subreddits.length < 15) {
      setSubreddits([...subreddits, normalizedName]);
      setSubredditInput("");
      setShowSubredditDropdown(false);
    }
  };

  const handleRemoveSubreddit = (subredditName: string) => {
    setSubreddits(subreddits.filter((s) => s !== subredditName));
  };

  const handleStep1Next = async () => {
    if (!productName.trim() || !productLink.trim() || !productDescription.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: productLink,
          productDescription: productDescription,
        }),
      });

      if (response.ok) {
        setCurrentStep(2);
      }
    } catch (error) {
      console.error("Error saving product details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2Next = async () => {
    if (subreddits.length < 3) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subreddits: subreddits,
        }),
      });

      if (response.ok) {
        setCurrentStep(3);
      }
    } catch (error) {
      console.error("Error saving subreddits:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectReddit = () => {
    setIsConnectingReddit(true);
    window.location.href = "/api/reddit/auth";
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingCompleted: true,
        }),
      });

      if (response.ok) {
        onComplete();
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const sortedSuggestions = [...subredditSuggestions].sort((a, b) => {
    const scoreA = fuzzyMatch(subredditInput, a.displayName);
    const scoreB = fuzzyMatch(subredditInput, b.displayName);
    return scoreB - scoreA;
  });

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl h-[80vh] rounded-lg border border-border bg-card shadow-lg flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Welcome to SignalScouter</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Let's get you set up in just a few steps
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of 3
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-6 flex-1 overflow-y-auto">
            {/* Step 1: Product Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Product Name *
                  </label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g., My Awesome Product"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Product Website/Link *
                  </label>
                  <Input
                    value={productLink}
                    onChange={(e) => setProductLink(e.target.value)}
                    placeholder="https://yourproduct.com"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Product Description *
                  </label>
                  <div className="relative">
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder={isGeneratingDescription ? "Generating product description..." : "Describe what your product does..."}
                      disabled={isGeneratingDescription}
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 pb-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {isGeneratingDescription && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Generating...</span>
                        </div>
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="absolute bottom-2 right-2 bg-black text-white hover:bg-black/90 text-xs h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isGeneratingDescription || !productLink || !productLink.trim()}
                      onClick={async () => {
                        if (!productLink || !productLink.trim()) {
                          return;
                        }
                        
                        setIsGeneratingDescription(true);
                        try {
                          const response = await fetch("/api/openai/product", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              website: productLink,
                            }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || "Failed to generate product description");
                          }

                          const data = await response.json();
                          if (data.success && data.description) {
                            setProductDescription(data.description);
                          } else {
                            throw new Error("No description received from API");
                          }
                        } catch (error) {
                          console.error("Error generating product description:", error);
                          // You could add a toast here if needed
                        } finally {
                          setIsGeneratingDescription(false);
                        }
                      }}
                    >
                      {isGeneratingDescription ? "Generating..." : "AI generate"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Subreddits */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Select Subreddits to Engage With * <span className="text-muted-foreground font-normal">({subreddits.length}/15)</span>
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Search and add subreddits where you want to find leads and engage (minimum 3, up to 15)
                  </p>
                  <div className="relative" ref={subredditDropdownRef}>
                    <Input
                      ref={subredditInputRef}
                      value={subredditInput}
                      onChange={(e) => setSubredditInput(e.target.value)}
                      placeholder="Search for subreddits..."
                      className="w-full"
                      onFocus={() => {
                        if (subredditSuggestions.length > 0) {
                          setShowSubredditDropdown(true);
                        }
                      }}
                    />
                    {isLoadingSubreddits && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {showSubredditDropdown && sortedSuggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
                        {sortedSuggestions.slice(0, 10).map((subreddit) => (
                          <button
                            key={subreddit.name}
                            onClick={() => handleAddSubreddit(subreddit.name)}
                            className="w-full px-4 py-2 text-left hover:bg-muted transition-colors flex items-center justify-between"
                          >
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {subreddit.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {subreddit.subscribers.toLocaleString()} members
                              </div>
                            </div>
                            {subreddits.includes(subreddit.name.toLowerCase().replace(/^r\//, "")) && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {subreddits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {subreddits.map((subreddit) => (
                      <div
                        key={subreddit}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
                      >
                        <span>r/{subreddit}</span>
                        <button
                          onClick={() => handleRemoveSubreddit(subreddit)}
                          className="ml-1 hover:text-primary/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {subreddits.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No subreddits selected. Search and add at least 3 subreddits to continue.
                  </p>
                )}
                {subreddits.length > 0 && subreddits.length < 3 && (
                  <p className="text-sm text-muted-foreground">
                    Please add at least {3 - subreddits.length} more subreddit{3 - subreddits.length > 1 ? 's' : ''} to continue.
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Reddit Connection */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Connect Your Reddit Account
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Connect your Reddit account to start finding leads and posting comments automatically.
                  </p>
                  {isRedditConnected ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">Reddit account connected!</span>
                    </div>
                  ) : (
                    <Button
                      onClick={handleConnectReddit}
                      disabled={isConnectingReddit}
                      className="mx-auto"
                    >
                      {isConnectingReddit ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Connecting...
                        </>
                      ) : (
                        "Connect Reddit Account"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
                disabled={isLoading}
              >
                Back
              </Button>
            )}
            <div className="flex-1" />
            {currentStep === 1 && (
              <Button
                onClick={handleStep1Next}
                disabled={isLoading || !productName.trim() || !productLink.trim() || !productDescription.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
            {currentStep === 2 && (
              <Button
                onClick={handleStep2Next}
                disabled={isLoading || subreddits.length < 3}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
            {currentStep === 3 && (
              <Button
                onClick={handleComplete}
                disabled={isLoading || !isRedditConnected}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Completing...
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

