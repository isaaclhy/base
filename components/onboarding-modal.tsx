"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, ChevronRight, ChevronLeft, CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onClose?: () => void;
  initialStep?: number;
}

interface SubredditSuggestion {
  name: string;
  displayName: string;
  subscribers: number;
}

export function OnboardingModal({ isOpen, onComplete, onClose, initialStep = 1 }: OnboardingModalProps) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  
  // Step 1: Reddit connection
  const [isConnectingReddit, setIsConnectingReddit] = useState(false);
  const [isRedditConnected, setIsRedditConnected] = useState(false);
  const [redditUserInfo, setRedditUserInfo] = useState<{
    name?: string;
    icon_img?: string;
    total_karma?: number;
    subreddit_count?: number;
  } | null>(null);

  // Reset loading state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsConnectingReddit(false);
      // Reset the fetch flag when modal opens (in case user disconnects and reconnects)
      if (currentStep === 1) {
        hasFetchedUserInfoRef.current = false;
      }
    }
  }, [isOpen, currentStep]);
  
  // Step 2: Product info
  const [productName, setProductName] = useState("");
  const [productLink, setProductLink] = useState("");
  const [productDescription, setProductDescription] = useState("");
  
  // Step 3: Keywords
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [recommendedKeywords, setRecommendedKeywords] = useState<string[]>([]);
  const [isLoadingKeywordSuggestions, setIsLoadingKeywordSuggestions] = useState(false);
  const recommendedKeywordsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeftKeywords, setCanScrollLeftKeywords] = useState(false);
  const [canScrollRightKeywords, setCanScrollRightKeywords] = useState(false);
  
  // Step 4: Subreddits
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [subredditInput, setSubredditInput] = useState("");
  const [subredditSuggestions, setSubredditSuggestions] = useState<SubredditSuggestion[]>([]);
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [showSubredditDropdown, setShowSubredditDropdown] = useState(false);
  const subredditInputRef = useRef<HTMLInputElement>(null);
  const subredditDropdownRef = useRef<HTMLDivElement>(null);
  const recommendedSubredditsScrollRef = useRef<HTMLDivElement>(null);
  const [recommendedSubreddits, setRecommendedSubreddits] = useState<Array<{ name: string; count: number; subscribers?: number }>>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const hasFetchedUserInfoRef = useRef(false); // Track if we've already fetched user info

  // Check if we're returning from Reddit OAuth
  useEffect(() => {
    if (isOpen) {
      // Reset loading state when modal opens (handles case where user left and came back)
      setIsConnectingReddit(false);
      
      if (searchParams.get("reddit_connected") === "success") {
      setCurrentStep(1);
        // Check connection status immediately and retry if needed
        const checkConnection = async (retryCount = 0) => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
              // If connected, fetch user info
              if (data.connected) {
                try {
                  const userInfoResponse = await fetch("/api/reddit/me");
                  if (userInfoResponse.ok) {
                    const userInfoData = await userInfoResponse.json();
                    if (userInfoData.success && userInfoData.user) {
                      setRedditUserInfo({
                        name: userInfoData.user.name,
                        icon_img: userInfoData.user.icon_img,
                        total_karma: userInfoData.user.total_karma,
                      });
                    }
                  }
                } catch (error) {
                  console.error("Error fetching Reddit user info:", error);
                }
              }
              // If not connected yet and we haven't retried too many times, retry after a delay
              if (!data.connected && retryCount < 3) {
                setTimeout(() => checkConnection(retryCount + 1), 1000);
              }
            } else if (retryCount < 3) {
              // Retry on error
              setTimeout(() => checkConnection(retryCount + 1), 1000);
          }
        } catch (error) {
          console.error("Error checking Reddit connection:", error);
            if (retryCount < 3) {
              setTimeout(() => checkConnection(retryCount + 1), 1000);
        }
          }
        };
        checkConnection();
      }
    }
  }, [isOpen, searchParams]);

  // Check Reddit connection status
  useEffect(() => {
    if (currentStep === 1 && isOpen) {
      // Reset loading state when checking connection status
      setIsConnectingReddit(false);
      
      const checkRedditConnection = async () => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
            // If connected, ensure loading state is reset and fetch user info (only once)
            if (data.connected && !hasFetchedUserInfoRef.current && !redditUserInfo) {
              setIsConnectingReddit(false);
              hasFetchedUserInfoRef.current = true; // Mark as fetched
              // Fetch Reddit user info
              try {
                const userInfoResponse = await fetch("/api/reddit/me");
                if (userInfoResponse.ok) {
                  const userInfoData = await userInfoResponse.json();
                  if (userInfoData.success && userInfoData.user) {
                    setRedditUserInfo({
                      name: userInfoData.user.name,
                      icon_img: userInfoData.user.icon_img,
                      total_karma: userInfoData.user.total_karma,
                      subreddit_count: userInfoData.user.subreddit_count,
                    });
                  }
                }
              } catch (error) {
                console.error("Error fetching Reddit user info:", error);
              }
            }
          }
        } catch (error) {
          console.error("Error checking Reddit connection:", error);
        }
      };
      
      // Only check once if we already have user info, otherwise poll
      if (redditUserInfo || hasFetchedUserInfoRef.current) {
        checkRedditConnection(); // Just check connection status once
      } else {
      checkRedditConnection();
      // Poll every 2 seconds to check if Reddit was connected after redirect
        // Stop polling once we have user info
        const interval = setInterval(() => {
          if (!redditUserInfo && !hasFetchedUserInfoRef.current) {
            checkRedditConnection();
          } else {
            clearInterval(interval);
          }
        }, 2000);
      return () => clearInterval(interval);
    }
    }
  }, [currentStep, isOpen, redditUserInfo]);

  // Generate keyword suggestions based on product description when step 3 is reached
  useEffect(() => {
    if (currentStep === 3 && productDescription && productDescription.trim().length > 0 && recommendedKeywords.length === 0 && !isLoadingKeywordSuggestions) {
      const generateKeywordSuggestions = async () => {
        setIsLoadingKeywordSuggestions(true);
        try {
          const response = await fetch("/api/openai/suggest-keywords", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              product: productDescription,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.keywords && Array.isArray(data.keywords)) {
              setRecommendedKeywords(data.keywords);
            }
          } else {
            console.error("Error fetching keyword suggestions:", response.status);
          }
        } catch (error) {
          console.error("Error generating keyword suggestions:", error);
        } finally {
          setIsLoadingKeywordSuggestions(false);
        }
      };

      generateKeywordSuggestions();
    }
  }, [currentStep, productDescription, recommendedKeywords.length, isLoadingKeywordSuggestions]);

  // Check scroll state for recommended keywords
  useEffect(() => {
    if (recommendedKeywords.length > 0 && recommendedKeywordsScrollRef.current) {
      const checkScrollState = () => {
        if (recommendedKeywordsScrollRef.current) {
          const { scrollLeft, scrollWidth, clientWidth } = recommendedKeywordsScrollRef.current;
          setCanScrollLeftKeywords(scrollLeft > 0);
          setCanScrollRightKeywords(scrollLeft < scrollWidth - clientWidth - 1);
        }
      };
      
      // Check immediately
      checkScrollState();
      
      // Also check on window resize
      window.addEventListener('resize', checkScrollState);
      return () => window.removeEventListener('resize', checkScrollState);
    }
  }, [recommendedKeywords.length]);

  // Check scroll state for recommended subreddits
  useEffect(() => {
    if (recommendedSubreddits.length > 0 && recommendedSubredditsScrollRef.current) {
      const checkScrollState = () => {
        if (recommendedSubredditsScrollRef.current) {
          const { scrollLeft, scrollWidth, clientWidth } = recommendedSubredditsScrollRef.current;
          setCanScrollLeft(scrollLeft > 0);
          setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
        }
      };
      
      // Check immediately
      checkScrollState();
      
      // Also check on window resize
      window.addEventListener('resize', checkScrollState);
      return () => window.removeEventListener('resize', checkScrollState);
    }
  }, [recommendedSubreddits.length]);

  // Generate subreddit recommendations based on keywords when step 4 is reached
  useEffect(() => {
    if (currentStep === 4 && keywords.length > 0 && recommendedSubreddits.length === 0 && !isLoadingRecommendations) {
      const generateRecommendations = async () => {
        setIsLoadingRecommendations(true);
        try {
          const subredditCounts = new Map<string, number>();

          // Search for each keyword concurrently using Google Custom Search (10 results per keyword, no date restrictions)
          const searchPromises = keywords.map(async (keyword) => {
            try {
              const response = await fetch("/api/google/search", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  searchQuery: `site:reddit.com ${keyword}`,
                  resultsPerQuery: 10,
                  noDateRestrict: true, // No date restrictions
                }),
              });

              if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                
                console.log(`[Keyword: "${keyword}"] Results returned: ${results.length} (expected: 10)`);

                // Extract subreddit names from Reddit URLs and count them
                results.forEach((result: any) => {
                  if (result.link) {
                    // Extract subreddit from Reddit URL: https://www.reddit.com/r/{subreddit}/comments/...
                    const urlMatch = result.link.match(/reddit\.com\/r\/([^\/]+)\//i);
                    if (urlMatch) {
                      const subredditName = urlMatch[1].toLowerCase();
                      subredditCounts.set(
                        subredditName,
                        (subredditCounts.get(subredditName) || 0) + 1
                      );
                    }
                  }
                });
              } else {
                console.error(`[Keyword: "${keyword}"] API returned status: ${response.status}`);
              }
            } catch (error) {
              console.error(`Error searching for keyword "${keyword}":`, error);
            }
          });

          // Wait for all searches to complete concurrently
          await Promise.all(searchPromises);

          // Log the map of counts
          console.log("Subreddit counts map:", Object.fromEntries(subredditCounts));

          // Convert to array and sort by count (display all, not just top 5)
          const sortedSubreddits = Array.from(subredditCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count); // Sort by count descending

          // Fetch subscriber counts for each recommended subreddit
          const subredditsWithInfo = await Promise.all(
            sortedSubreddits.map(async (rec) => {
              try {
                const response = await fetch(`/api/reddit/search-subreddits?q=${encodeURIComponent(rec.name)}`);
                if (response.ok) {
                  const data = await response.json();
                  const matchingSubreddit = data.subreddits?.find(
                    (s: any) => s.name.toLowerCase() === rec.name.toLowerCase()
                  );
                  if (matchingSubreddit) {
                    return {
                      ...rec,
                      subscribers: matchingSubreddit.subscribers || 0,
                    };
                  }
                }
              } catch (error) {
                console.error(`Error fetching subreddit info for ${rec.name}:`, error);
              }
              return { ...rec, subscribers: 0 };
            })
          );

          setRecommendedSubreddits(subredditsWithInfo);
        } catch (error) {
          console.error("Error generating subreddit recommendations:", error);
        } finally {
          setIsLoadingRecommendations(false);
        }
      };

      generateRecommendations();
    }
  }, [currentStep, keywords, recommendedSubreddits.length, isLoadingRecommendations]);

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

  const handleAddKeyword = () => {
    const trimmedKeyword = keywordInput.trim();
    if (trimmedKeyword && !keywords.includes(trimmedKeyword) && keywords.length < 5) {
      setKeywords([...keywords, trimmedKeyword]);
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleKeywordInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleStep1Next = async () => {
    if (!isRedditConnected) {
      return;
    }
    setCurrentStep(2);
  };

  const handleStep2Next = async () => {
    if (!productName.trim() || !productDescription.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: productLink,
          productName: productName,
          productDescription: productDescription,
        }),
      });

      if (response.ok) {
        setCurrentStep(3);
      }
    } catch (error) {
      console.error("Error saving product details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep3Next = async () => {
    if (keywords.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords,
        }),
      });

      if (response.ok) {
        setCurrentStep(4);
      }
    } catch (error) {
      console.error("Error saving keywords:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep4Next = async () => {
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
        // Complete onboarding
        await handleComplete();
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
      {/* Backdrop that excludes the sidebar on desktop (224px = w-56), full screen on mobile */}
      {/* On mobile, always cover full screen. On desktop (lg+), exclude sidebar area */}
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:left-[224px]" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:left-[224px]">
        <div className="relative w-full max-w-2xl h-[80vh] rounded-lg border border-border bg-card shadow-lg flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-4 gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Welcome to SignalScouter</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Let's get you set up in just a few steps
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                Step {currentStep} of 4
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-6 flex-1 overflow-y-auto">
            {/* Step 1: Reddit Connection */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Connect Your Reddit Account
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Connect your Reddit account to search for subreddits and start finding leads.
                  </p>
                  {isRedditConnected ? (
                    <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">Reddit account connected!</span>
                      </div>
                      {redditUserInfo && (
                        <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                          {redditUserInfo.icon_img && (
                            <img
                              src={redditUserInfo.icon_img.replace(/&amp;/g, '&')}
                              alt={redditUserInfo.name || "Reddit user"}
                              className="w-12 h-12 rounded-full"
                            />
                          )}
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-foreground">
                              u/{redditUserInfo.name}
                            </span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {redditUserInfo.total_karma !== undefined && (
                                <span>
                                  {redditUserInfo.total_karma.toLocaleString()} karma
                                </span>
                              )}
                              {redditUserInfo.subreddit_count !== undefined && (
                                <span>
                                  {redditUserInfo.subreddit_count.toLocaleString()} subreddit{redditUserInfo.subreddit_count !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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

            {/* Step 2: Product Information */}
            {currentStep === 2 && (
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
                    Product Website/Link
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

            {/* Step 3: Keywords */}
            {currentStep === 3 && (
              <div className="space-y-4">
                {/* Recommended Keywords */}
                {isLoadingKeywordSuggestions && (
                  <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/50 border border-border">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Generating keyword suggestions based on your product description...</span>
                  </div>
                )}
                {!isLoadingKeywordSuggestions && recommendedKeywords.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                      Recommended Keywords
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Based on your product description, here are some suggested keywords:
                    </p>
                    <div className="relative">
                      <div
                        ref={recommendedKeywordsScrollRef}
                        className="overflow-x-auto pb-2 -mx-6 px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
                        onScroll={() => {
                          if (recommendedKeywordsScrollRef.current) {
                            const { scrollLeft, scrollWidth, clientWidth } = recommendedKeywordsScrollRef.current;
                            setCanScrollLeftKeywords(scrollLeft > 0);
                            setCanScrollRightKeywords(scrollLeft < scrollWidth - clientWidth - 1);
                          }
                        }}
                      >
                        <div className="flex gap-3 min-w-max">
                          {recommendedKeywords.map((keyword) => {
                            const normalizedRecommended = keyword.toLowerCase().trim();
                            const isAdded = keywords.some(k => k.toLowerCase().trim() === normalizedRecommended);
                            const isDisabled = isAdded || keywords.length >= 5;
                            return (
                              <div
                                key={keyword}
                                className="flex-shrink-0 w-64 rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow relative items-center flex flex-row justify-between"
                              >
                                <div className="space-y-2 flex flex-col">
                                  <div className="pr-8">
                                    <h4 className="text-sm font-semibold text-foreground">
                                      {keyword}
                                    </h4>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    if (!isAdded && keywords.length < 5) {
                                      const trimmedKeyword = keyword.toLowerCase().trim();
                                      if (!keywords.includes(trimmedKeyword)) {
                                        setKeywords([...keywords, trimmedKeyword]);
                                      }
                                    }
                                  }}
                                  disabled={isDisabled}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-0 ${
                                    isAdded 
                                      ? "bg-black border-black hover:bg-black/90" 
                                      : "bg-white border-border hover:bg-muted"
                                  }`}
                                >
                                  {isAdded ? (
                                    <CheckCircle2 className="h-3 w-3 text-white" />
                                  ) : (
                                    <Plus className="h-3 w-3 text-foreground" />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Left scroll button */}
                      {canScrollLeftKeywords && (
                        <button
                          onClick={() => {
                            if (recommendedKeywordsScrollRef.current) {
                              recommendedKeywordsScrollRef.current.scrollBy({
                                left: -272,
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md hover:bg-background flex items-center justify-center transition-colors"
                          aria-label="Scroll left"
                        >
                          <ChevronLeft className="h-5 w-5 text-foreground" />
                        </button>
                      )}
                      {/* Right scroll button */}
                      {canScrollRightKeywords && (
                        <button
                          onClick={() => {
                            if (recommendedKeywordsScrollRef.current) {
                              recommendedKeywordsScrollRef.current.scrollBy({
                                left: 272,
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md hover:bg-background flex items-center justify-center transition-colors"
                          aria-label="Scroll right"
                        >
                          <ChevronRight className="h-5 w-5 text-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Add Keywords * <span className="text-muted-foreground font-normal">({keywords.length}/5)</span>
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Please enter broad keywords for best results
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={handleKeywordInputKeyDown}
                      placeholder="Enter a keyword and press Enter..."
                      className="w-full"
                    />
                    <div className="relative group">
                      <Button
                        onClick={handleAddKeyword}
                        disabled={!keywordInput.trim() || keywords.includes(keywordInput.trim()) || keywords.length >= 5}
                        size="sm"
                      >
                        Add
                      </Button>
                      {keywords.length >= 5 && keywordInput.trim() && !keywords.includes(keywordInput.trim()) && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-md shadow-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                          Max keywords reached
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword) => (
                      <div
                        key={keyword}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
                      >
                        <span>{keyword}</span>
                        <button
                          onClick={() => handleRemoveKeyword(keyword)}
                          className="ml-1 hover:text-primary/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {keywords.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No keywords added. Add at least one keyword to continue.
                  </p>
                )}
              </div>
            )}

            {/* Step 4: Subreddits */}
            {currentStep === 4 && (
              <div className="space-y-4">
                {/* Recommended Subreddits */}
                {isLoadingRecommendations && (
                  <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/50 border border-border">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analyzing your keywords to recommend subreddits...</span>
                  </div>
                )}
                {!isLoadingRecommendations && recommendedSubreddits.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                      Recommended Subreddits
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Based on your keywords, these subreddits appear most frequently in relevant posts:
                    </p>
                    <div className="relative">
                      <div
                        ref={recommendedSubredditsScrollRef}
                        className="overflow-x-auto pb-2 -mx-6 px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
                        onScroll={() => {
                          if (recommendedSubredditsScrollRef.current) {
                            const { scrollLeft, scrollWidth, clientWidth } = recommendedSubredditsScrollRef.current;
                            setCanScrollLeft(scrollLeft > 0);
                            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
                          }
                        }}
                      >
                        <div className="flex gap-3 min-w-max">
                        {recommendedSubreddits.map((rec) => {
                          const isAdded = subreddits.includes(rec.name.toLowerCase().replace(/^r\//, ""));
                          const isDisabled = isAdded || subreddits.length >= 15;
                          return (
                            <div
                              key={rec.name}
                              className="flex-shrink-0 w-64 rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow relative items-center flex flex-row justify-between"
                            >
                              <div className="space-y-2 flex flex-col">
                                <div className="pr-8">
                                  <h4 className="text-sm font-semibold text-foreground">
                                    r/{rec.name}
                                  </h4>
                                  {rec.subscribers !== undefined && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {rec.subscribers.toLocaleString()} members
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleAddSubreddit(rec.name)}
                                disabled={isDisabled}
                                className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-0 ${
                                  isAdded 
                                    ? "bg-black border-black hover:bg-black/90" 
                                    : "bg-white border-border hover:bg-muted"
                                }`}
                              >
                                {isAdded ? (
                                  <CheckCircle2 className="h-3 w-3 text-white" />
                                ) : (
                                  <Plus className="h-3 w-3 text-foreground" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                      {/* Left scroll button */}
                      {canScrollLeft && (
                        <button
                          onClick={() => {
                            if (recommendedSubredditsScrollRef.current) {
                              recommendedSubredditsScrollRef.current.scrollBy({
                                left: -272, // w-64 (256px) + gap-3 (12px) = 268px, rounded to 272 for smooth scroll
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md hover:bg-background flex items-center justify-center transition-colors"
                          aria-label="Scroll left"
                        >
                          <ChevronLeft className="h-5 w-5 text-foreground" />
                        </button>
                      )}
                      {/* Right scroll button */}
                      {canScrollRight && (
                        <button
                          onClick={() => {
                            if (recommendedSubredditsScrollRef.current) {
                              recommendedSubredditsScrollRef.current.scrollBy({
                                left: 272, // w-64 (256px) + gap-3 (12px) = 268px, rounded to 272 for smooth scroll
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md hover:bg-background flex items-center justify-center transition-colors"
                          aria-label="Scroll right"
                        >
                          <ChevronRight className="h-5 w-5 text-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
                disabled={!isRedditConnected}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {currentStep === 2 && (
              <Button
                onClick={handleStep2Next}
                disabled={isLoading || !productName.trim() || !productDescription.trim()}
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
                onClick={handleStep3Next}
                disabled={isLoading || keywords.length === 0}
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
            {currentStep === 4 && (
              <Button
                onClick={handleStep4Next}
                disabled={isLoading || subreddits.length < 3}
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

