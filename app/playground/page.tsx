"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import PlaygroundLayout, { usePlaygroundTab, usePlaygroundSidebar } from "@/components/playground-layout";

function PlaygroundContent() {
  const activeTab = usePlaygroundTab();
  const sidebarOpen = usePlaygroundSidebar();
  const [website, setWebsite] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [persona, setPersona] = useState("");
  const [previousIdeas, setPreviousIdeas] = useState<string[]>([]);
  const [selectedIdea, setSelectedIdea] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [redditLinks, setRedditLinks] = useState<Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null }>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  // Load previous ideas from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("productIdeas");
    if (saved) {
      try {
        const ideas = JSON.parse(saved);
        setPreviousIdeas(ideas);
      } catch (e) {
        console.error("Failed to parse saved ideas:", e);
      }
    }

    // Load saved Reddit links
    const savedLinks = localStorage.getItem("redditLinks");
    if (savedLinks) {
      try {
        const links = JSON.parse(savedLinks);
        setRedditLinks(links);
      } catch (e) {
        console.error("Failed to parse saved Reddit links:", e);
      }
    }

    // Load saved queries
    const savedQueries = localStorage.getItem("savedQueries");
    if (savedQueries) {
      try {
        const queries = JSON.parse(savedQueries);
        setResults(queries);
      } catch (e) {
        console.error("Failed to parse saved queries:", e);
      }
    }
  }, []);

  const handleSubmit = async (message: string) => {
    if (!message.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    // Save product idea to localStorage
    const saved = localStorage.getItem("productIdeas");
    let ideas: string[] = [];
    
    if (saved) {
      try {
        ideas = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved ideas:", e);
      }
    }
    
    // Add new idea if it doesn't already exist
    if (!ideas.includes(message.trim())) {
      ideas.unshift(message.trim()); // Add to beginning
      // Keep only last 10 ideas
      if (ideas.length > 10) {
        ideas = ideas.slice(0, 10);
      }
      localStorage.setItem("productIdeas", JSON.stringify(ideas));
      setPreviousIdeas(ideas);
    }

    try {
      // Call the API endpoint
      const response = await fetch("/api/openai/queries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productIdea: message.trim(),
          postCount: 10, // You can make this configurable if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate queries");
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.result && Array.isArray(data.result)) {
        console.log("Generated queries:", data.result);
        setResults(data.result);
        
        // Save queries to localStorage
        localStorage.setItem("savedQueries", JSON.stringify(data.result));
        
        // Fetch Reddit links for each query
        data.result.forEach((query: string) => {
          fetchRedditLinks(query, 10);
        });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error("Error in query generation:", err);
      setError(err instanceof Error ? err.message : "Failed to generate queries");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRedditLinks = async (query: string, postCount: number) => {
    setIsLoadingLinks((prev) => ({ ...prev, [query]: true }));
    
    try {
      const response = await fetch("/api/google/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchQuery: query,
          postCount: postCount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch Reddit links");
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.results && Array.isArray(data.results)) {
        setRedditLinks((prev) => {
          const updated = {
            ...prev,
            [query]: data.results,
          };
          // Save to localStorage
          localStorage.setItem("redditLinks", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error(`Error fetching Reddit links for query "${query}":`, err);
    } finally {
      setIsLoadingLinks((prev) => ({ ...prev, [query]: false }));
    }
  };

  const handleIdeaSelect = (idea: string) => {
    setSelectedIdea(idea);
    // You might want to populate the textarea with this idea
    // This would require passing a callback or modifying ChatTextarea
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex-1 overflow-y-auto p-6",
              !sidebarOpen && "pl-14 pt-14"
            )}>
              <div className="space-y-6">
                {/* Results */}
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="mb-4 flex space-x-2">
                      <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                      <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                      <div className="h-3 w-3 animate-bounce rounded-full bg-primary"></div>
                    </div>
                    <p className="text-sm text-muted-foreground">Generating queries...</p>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Reddit Posts
                      {Object.values(redditLinks).flat().length > 0 && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          ({Object.values(redditLinks).flat().length} found)
                        </span>
                      )}
                    </h3>
                    
                    {/* Show loading state if any query is still loading */}
                    {Object.values(isLoadingLinks).some(Boolean) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span>Searching Reddit...</span>
                      </div>
                    )}
                    
                    {/* Flatten all Reddit links and display in grid */}
                    {Object.values(redditLinks).flat().length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {Object.values(redditLinks).flat().map((link, index) => {
                          // Extract subreddit from URL
                          const subredditMatch = link.link?.match(/reddit\.com\/r\/([^/]+)/);
                          const subreddit = subredditMatch ? subredditMatch[1] : null;
                          const isExpanded = expandedPosts.has(index);
                          
                          // Clean snippet
                          let cleanSnippet = link.snippet || '';
                          cleanSnippet = cleanSnippet.replace(/\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
                          cleanSnippet = cleanSnippet.replace(/posted\s+\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
                          cleanSnippet = cleanSnippet.replace(/^[.\s\u2026]+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^\.+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^[\s\u00A0]+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^\.{1,}/g, '');
                          cleanSnippet = cleanSnippet.trim();
                          
                          // Check if content is long enough to be truncated
                          const shouldShowSeeMore = cleanSnippet && cleanSnippet.length > 150;
                          
                          return (
                            <div
                              key={index}
                              className="flex h-full flex-col rounded-lg border border-border bg-card p-4"
                            >
                              <div className="flex-1">
                                {/* Subreddit name */}
                                {subreddit && (
                                  <div className="mb-2 flex items-center gap-1">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      r/{subreddit}
                                    </span>
                                  </div>
                                )}
                                
                                {/* Title */}
                                <h3 className="mb-2 text-sm font-semibold leading-tight text-foreground line-clamp-2">
                                  {link.title}
                                </h3>
                                
                                {/* Snippet */}
                                {cleanSnippet && (
                                  <div className="mb-3">
                                    <p className={cn(
                                      "text-xs leading-relaxed text-muted-foreground",
                                      !isExpanded ? "line-clamp-3" : ""
                                    )}>
                                      {cleanSnippet}
                                    </p>
                                    {shouldShowSeeMore && (
                                      <button
                                        onClick={() => {
                                          const newExpanded = new Set(expandedPosts);
                                          if (isExpanded) {
                                            newExpanded.delete(index);
                                          } else {
                                            newExpanded.add(index);
                                          }
                                          setExpandedPosts(newExpanded);
                                        }}
                                        className="mt-1 text-xs font-medium text-primary hover:underline"
                                      >
                                        {isExpanded ? "See less" : "See more"}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              {/* Footer with link and timestamp */}
                              {link.link && (
                                <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                                  <span className="text-xs text-muted-foreground">
                                    8 hours ago
                                  </span>
                                  <a
                                    href={link.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                  >
                                    <span>Post link</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      !Object.values(isLoadingLinks).some(Boolean) && (
                        <p className="text-sm text-muted-foreground">
                          No Reddit posts found yet. Searching...
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Fixed input at bottom */}
            <div className="bg-background">
              <ChatTextarea
                website={website}
                onWebsiteChange={setWebsite}
                callToAction={callToAction}
                onCallToActionChange={setCallToAction}
                persona={persona}
                onPersonaChange={setPersona}
                onSend={handleSubmit}
                placeholder="Tell us about your product and what it does..."
                className="h-auto"
                previousIdeas={previousIdeas}
                onIdeaSelect={setSelectedIdea}
                selectedIdea={selectedIdea}
              />
            </div>
          </div>
        );
      case "analytics":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-xl font-semibold">Analytics</h2>
              <p className="text-muted-foreground">
                Track your performance and engagement metrics.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-muted-foreground">Analytics data will be displayed here.</p>
            </div>
          </div>
        );
      case "content":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-xl font-semibold">Content</h2>
              <p className="text-muted-foreground">
                Manage your generated content and posts.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-muted-foreground">Content management interface will be displayed here.</p>
            </div>
          </div>
        );
      case "users":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-xl font-semibold">Users</h2>
              <p className="text-muted-foreground">
                Manage user accounts and permissions.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-muted-foreground">User management interface will be displayed here.</p>
            </div>
          </div>
        );
      case "settings":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-xl font-semibold">Settings</h2>
              <p className="text-muted-foreground">
                Configure your preferences and account settings.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-muted-foreground">Settings options will be displayed here.</p>
            </div>
          </div>
        );
      default:
        return (
          <div>
            <h2 className="mb-2 text-xl font-semibold">Welcome</h2>
            <p className="text-muted-foreground">Select a tab from the sidebar to get started.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {activeTab === "dashboard" ? (
        renderContent()
      ) : (
        <div className={cn(
          "flex-1 overflow-y-auto",
          sidebarOpen ? "p-6" : "p-6 pl-14 pt-14"
        )}>{renderContent()}</div>
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <PlaygroundLayout>
      <PlaygroundContent />
    </PlaygroundLayout>
  );
}

