"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { ExternalLink, X, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import PlaygroundLayout, { usePlaygroundTab, usePlaygroundSidebar, useRefreshUsage } from "@/components/playground-layout";
import { RedditPost } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

const normalizeUrl = (url: string): string => {
  return url
    .split('?')[0]
    .replace(/\/$/, '')
    .toLowerCase();
};

const extractThingIdFromLink = (link: string): string | null => {
  const match = link.match(/comments\/([^\/?#]+)/i);
  if (match && match[1]) {
    return `t3_${match[1]}`;
  }
  return null;
};

function PlaygroundContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = usePlaygroundTab();
  const sidebarOpen = usePlaygroundSidebar();
  const refreshUsage = useRefreshUsage();
  const [website, setWebsite] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [persona, setPersona] = useState("");
  const [postCount, setPostCount] = useState<number>(10);
  const [autoGenerateComments, setAutoGenerateComments] = useState<boolean>(false);
  const [previousIdeas, setPreviousIdeas] = useState<string[]>([]);
  const [selectedIdea, setSelectedIdea] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [redditLinks, setRedditLinks] = useState<Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState<Record<string, boolean>>({});
  const [isLoadingPostContent, setIsLoadingPostContent] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [postTextareas, setPostTextareas] = useState<Record<string, string>>({});
  const postTextareasRef = useRef<Record<string, string>>({});
  const [currentProductIdea, setCurrentProductIdea] = useState<string>("");
  const [submittedProductIdea, setSubmittedProductIdea] = useState<string>("");
  const [isGeneratingComment, setIsGeneratingComment] = useState<Record<string, boolean>>({});
  const [isPosting, setIsPosting] = useState<Record<string, boolean>>({});
  const [hasRedditToken, setHasRedditToken] = useState<boolean | null>(null); // null = checking, true = has token, false = no token
  const [isCheckingReddit, setIsCheckingReddit] = useState(true);
  const [toast, setToast] = useState<{ visible: boolean; message: string; link?: string | null; variant?: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCheckoutSuccessModal, setShowCheckoutSuccessModal] = useState(false);
  const generatedCommentUrlsRef = useRef<Set<string>>(new Set());
  const generatingCommentUrlsRef = useRef<Set<string>>(new Set());

  // Analytics state: track posted/skipped posts from MongoDB
  interface AnalyticsPost {
    id?: string;
    uniqueKey?: string; // For backwards compatibility with localStorage
    query: string;
    title: string | null;
    link: string | null;
    snippet: string | null;
    selftext: string | null;
    postData: RedditPost | null;
    status: "posted" | "skipped" | "failed";
    postedAt: number; // timestamp (will be converted from createdAt)
    notes?: string; // from textarea/comment
    comment?: string | null;
  }
  const [analyticsPosts, setAnalyticsPosts] = useState<AnalyticsPost[]>([]);
  const [analyticsFilter, setAnalyticsFilter] = useState<"posted" | "skipped" | "failed">("posted");
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [selectedAnalyticsPost, setSelectedAnalyticsPost] = useState<AnalyticsPost | null>(null);
  const [isAnalyticsDrawerVisible, setIsAnalyticsDrawerVisible] = useState(false);
  const [drawerComment, setDrawerComment] = useState<string>("");
  const [isPostingFromAnalytics, setIsPostingFromAnalytics] = useState(false);
  const analyticsDrawerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyticsUrlSet = useMemo(() => {
    const set = new Set<string>();
    analyticsPosts.forEach((post) => {
      if (post.link && post.status !== "failed") {
        set.add(normalizeUrl(post.link));
      }
    });
    return set;
  }, [analyticsPosts]);

  const filteredAnalyticsPosts = useMemo(() => {
    return analyticsPosts.filter((post) => post.status === analyticsFilter);
  }, [analyticsPosts, analyticsFilter]);

  const getCachedPost = (url: string): { selftext?: string | null; postData?: RedditPost | null } | null => {
    try {
      const cacheKey = normalizeUrl(url);
      const cached = localStorage.getItem(`redditPost_${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error("Error reading cached post:", e);
    }
    return null;
  };

  // All useEffect hooks must be called before any early returns
  useEffect(() => {
    postTextareasRef.current = postTextareas;
  }, [postTextareas]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (toastHideTimerRef.current) {
        clearTimeout(toastHideTimerRef.current);
      }
      if (analyticsDrawerTimerRef.current) {
        clearTimeout(analyticsDrawerTimerRef.current);
      }
    };
  }, []);

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    setAnalyticsPage(1);
  }, [analyticsFilter]);

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

        // Load cached comments from localStorage - we'll restore them when distinctLinks are computed

        // Load cached posts from localStorage and populate links
        // Then fetch only posts that aren't cached
        setTimeout(() => {
          Object.entries(links).forEach(([query, linkArray]: [string, any]) => {
            if (Array.isArray(linkArray)) {
              // First, try to load from cache and update state
              let hasUpdates = false;
              const updatedLinks = linkArray.map((link: any) => {
                if (link.link && (!link.selftext && !link.postData)) {
                  // Try to get from cache
                  const cached = getCachedPost(link.link);
                  if (cached && (cached.selftext || cached.postData)) {
                    hasUpdates = true;
                    return {
                      ...link,
                      selftext: cached.selftext || null,
                      postData: cached.postData || null,
                    };
                  }
                }
                return link;
              });

              // Update state if we found cached posts
              if (hasUpdates) {
                setRedditLinks((prev) => {
                  const updated = { ...prev, [query]: updatedLinks };
                  localStorage.setItem("redditLinks", JSON.stringify(updated));
                  return updated;
                });
              }

              // Don't fetch here - batchFetchAllPostContent will handle it after all queries load
            }
          });
        }, 0);
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

    // Analytics posts will be loaded from MongoDB via useEffect
  }, []);

  // Check Reddit connection status on mount
  useEffect(() => {
    if (!session?.user) return;

    const checkRedditConnection = async () => {
      setIsCheckingReddit(true);
      try {
        const response = await fetch("/api/reddit/status");
        if (response.ok) {
          const data = await response.json();
          setHasRedditToken(data.connected);
        } else {
          setHasRedditToken(false);
        }
      } catch (error) {
        console.error("Error checking Reddit connection:", error);
        setHasRedditToken(false);
      } finally {
        setIsCheckingReddit(false);
      }
    };

    checkRedditConnection();
  }, [session?.user]);

  // Re-check Reddit connection when URL params indicate success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reddit_connected") === "success") {
      setHasRedditToken(true);
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Load analytics posts from MongoDB
  useEffect(() => {
    if (!session?.user) return;

    const fetchAnalyticsPosts = async () => {
      setIsLoadingAnalytics(true);
      try {
        const response = await fetch("/api/posts");
        if (response.status === 401) {
          setAnalyticsPosts([]);
          setIsLoadingAnalytics(false);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.posts) {
            // Convert MongoDB posts to AnalyticsPost format
            const convertedPosts: AnalyticsPost[] = data.posts.map((post: any) => {
              const normalizedStatus: "posted" | "skipped" | "failed" = post.status === "posted" ? "posted" : post.status === "failed" ? "failed" : "skipped";
              const rawComment = typeof post.comment === "string" ? post.comment : undefined;
              const rawNotes = typeof post.notes === "string" ? post.notes : undefined;
              const commentValue = rawComment && rawComment.length > 0 ? rawComment : rawNotes && rawNotes.length > 0 ? rawNotes : null;
              const notesValue = rawNotes && rawNotes.length > 0 ? rawNotes : null;
              return {
                id: post.id,
                uniqueKey: post.id || `${post.query}-${post.link || 'no-link'}-${post.createdAt}`,
                query: post.query,
                title: post.title,
                link: post.link,
                snippet: post.snippet,
                selftext: post.selftext,
                postData: post.postData,
                status: normalizedStatus,
                postedAt: new Date(post.createdAt).getTime(),
                notes: notesValue,
                comment: commentValue,
              };
            });
            setAnalyticsPosts(convertedPosts);
          } else {
            setAnalyticsPosts([]);
          }
        } else {
          console.error("Failed to fetch analytics posts from database");
        }
      } catch (error) {
        console.error("Error fetching analytics posts:", error);
      } finally {
        setIsLoadingAnalytics(false);
      }
    };

    fetchAnalyticsPosts();
  }, [session?.user]);

  // All useCallback and useMemo hooks must be before early returns
  const generateCommentForLink = useCallback(
    async (
      linkItem: {
        uniqueKey: string;
        query: string;
        title?: string | null;
        link?: string | null;
        snippet?: string | null;
        selftext?: string | null;
        postData?: RedditPost | null;
      },
      options?: { force?: boolean; showAlerts?: boolean }
    ) => {
      const { force = false, showAlerts = false } = options || {};
      const linkKey = linkItem.uniqueKey;
      const ideaToUse = submittedProductIdea || currentProductIdea;

      if (!ideaToUse || !website) {
        if (showAlerts) {
          alert("Please enter a product idea and website URL first.");
        }
        return;
      }

      const postContent =
        linkItem.selftext || linkItem.snippet || linkItem.title || "";
      if (!postContent) {
        if (showAlerts) {
          alert("No post content available.");
        }
        return;
      }

      const normalizedUrl = linkItem.link
        ? normalizeUrl(linkItem.link)
        : null;

      if (normalizedUrl) {
        if (!force) {
          if (
            generatedCommentUrlsRef.current.has(normalizedUrl) ||
            generatingCommentUrlsRef.current.has(normalizedUrl)
          ) {
            return;
          }
        } else {
          generatedCommentUrlsRef.current.delete(normalizedUrl);
        }
        generatingCommentUrlsRef.current.add(normalizedUrl);
      }

      setIsGeneratingComment((prev) => ({ ...prev, [linkKey]: true }));

      try {
        const response = await fetch("/api/openai/comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productIdea: ideaToUse,
            productLink: website,
            postContent: postContent,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate comment");
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (data.comments && data.comments.length > 0) {
          const generatedComment = data.comments.join("\n\n");
          setPostTextareas((prev) => ({
            ...prev,
            [linkKey]: generatedComment,
          }));
          if (normalizedUrl) {
            generatedCommentUrlsRef.current.add(normalizedUrl);
          }
          if (linkItem.link) {
            cacheComment(linkItem.link, generatedComment);
          }
        } else if (showAlerts) {
          alert("No comments generated. Please try again.");
        }
      } catch (err) {
        console.error("Error generating comment:", err);
        if (showAlerts) {
          alert(
            err instanceof Error ? err.message : "Failed to generate comment"
          );
        }
      } finally {
        setIsGeneratingComment((prev) => ({ ...prev, [linkKey]: false }));
        if (normalizedUrl) {
          generatingCommentUrlsRef.current.delete(normalizedUrl);
        }
      }
    },
    [currentProductIdea, submittedProductIdea, website]
  );

  const distinctLinks = useMemo(() => {
    let globalIndex = 0;
    const allLinksWithQuery = Object.entries(redditLinks)
      .reverse()
      .flatMap(([query, links]) =>
        [...links].reverse().map((link, linkIndex) => {
          const uniqueKey = `${query}-${link.link || "no-link"}-${linkIndex}-${globalIndex}`;
          const item = {
            ...link,
            query,
            linkIndex,
            uniqueKey,
            order: globalIndex,
          } as typeof link & {
            query: string;
            linkIndex: number;
            uniqueKey: string;
            order: number;
          };
          globalIndex += 1;
          return item;
        })
      );

    const sortedLinks = [...allLinksWithQuery].sort((a, b) => {
      const timeA =
        typeof a.postData?.created_utc === "number"
          ? a.postData.created_utc
          : -Infinity;
      const timeB =
        typeof b.postData?.created_utc === "number"
          ? b.postData.created_utc
          : -Infinity;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a.order - b.order;
    });

    const seenUrls = new Set<string>();
    const results: Array<(typeof sortedLinks)[number]> = [];

    for (const linkItem of sortedLinks) {
      if (!linkItem.link) {
        continue;
      }

      const normalizedUrl = normalizeUrl(linkItem.link);
      if (analyticsUrlSet.has(normalizedUrl)) {
        continue;
      }

      if (seenUrls.has(normalizedUrl)) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      results.push(linkItem);
    }

    return results;
  }, [redditLinks, analyticsUrlSet]);

  const openAnalyticsDrawer = useCallback((post: AnalyticsPost) => {
    setSelectedAnalyticsPost(post);
    setDrawerComment(post.comment || post.notes || "");
    setIsAnalyticsDrawerVisible(true);
  }, []);

  const closeAnalyticsDrawer = useCallback(() => {
    setIsAnalyticsDrawerVisible(false);
    if (analyticsDrawerTimerRef.current) {
      clearTimeout(analyticsDrawerTimerRef.current);
    }
    analyticsDrawerTimerRef.current = setTimeout(() => {
      setSelectedAnalyticsPost(null);
      setDrawerComment("");
      analyticsDrawerTimerRef.current = null;
    }, 300);
  }, []);

  // Helper functions for comment caching (must be defined before use)
  const getCommentCacheKey = (url: string) => normalizeUrl(url);

  const getCachedComment = (url: string): string | null => {
    try {
      const cacheKey = getCommentCacheKey(url);
      const cached = localStorage.getItem(`redditComment_${cacheKey}`);
      return cached ?? null;
    } catch (e) {
      console.error("Error reading cached comment:", e);
      return null;
    }
  };

  const cacheComment = (url: string, comment: string) => {
    try {
      const cacheKey = getCommentCacheKey(url);
      localStorage.setItem(`redditComment_${cacheKey}`, comment);
    } catch (e) {
      console.error("Error caching comment:", e);
    }
  };

  // Restore cached comments when links are loaded (e.g., on page refresh)
  useEffect(() => {
    if (distinctLinks.length === 0) {
      return;
    }

    const cachedEntries: Record<string, string> = {};

    for (const link of distinctLinks) {
      if (!link.link) {
        continue;
      }
      const normalizedUrl = normalizeUrl(link.link);
      const cachedComment = getCachedComment(link.link);

      if (cachedComment) {
        cachedEntries[link.uniqueKey] = cachedComment;
        generatedCommentUrlsRef.current.add(normalizedUrl);
      }
    }

    if (Object.keys(cachedEntries).length > 0) {
      setPostTextareas((prev) => {
        const updated = { ...prev };
        for (const [key, value] of Object.entries(cachedEntries)) {
          if (!updated[key]) {
            updated[key] = value;
          }
        }
        return updated;
      });
    }
  }, [distinctLinks]);

  // Generate new comments when product idea is submitted (only if auto-generate is enabled)
  useEffect(() => {
    if (!autoGenerateComments) {
      return;
    }

    if (!submittedProductIdea || !website) {
      return;
    }

    if (distinctLinks.length === 0) {
      return;
    }

    const linksToGenerate: typeof distinctLinks = [];

    for (const link of distinctLinks) {
      if (!link.link) {
        continue;
      }
      const normalizedUrl = normalizeUrl(link.link);

      // Skip if already has cached comment or is generating
      if (generatedCommentUrlsRef.current.has(normalizedUrl)) {
        continue;
      }
      if (generatingCommentUrlsRef.current.has(normalizedUrl)) {
        continue;
      }

      // Skip if already has a comment in textarea
      if (postTextareasRef.current[link.uniqueKey]?.trim().length) {
        continue;
      }

      linksToGenerate.push(link);
    }

    if (linksToGenerate.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      // Generate comments in parallel for better performance
      await Promise.all(
        linksToGenerate.map((link) => {
          if (cancelled) {
            return Promise.resolve();
          }
          return generateCommentForLink(link);
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [distinctLinks, submittedProductIdea, website, generateCommentForLink, autoGenerateComments]);

  useEffect(() => {
    if (selectedAnalyticsPost) {
      setDrawerComment(selectedAnalyticsPost.comment || selectedAnalyticsPost.notes || "");
    }
  }, [selectedAnalyticsPost]);

  useEffect(() => {
    const checkout = searchParams?.get("checkout");
    if (checkout === "success") {
      setShowCheckoutSuccessModal(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("checkout");
      const newQuery = params.toString();
      router.replace(`${pathname}${newQuery ? `?${newQuery}` : ""}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  // Show loading state while checking authentication
  if (status === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  const hideToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast((prev) => (prev ? { ...prev, visible: false } : prev));
    if (toastHideTimerRef.current) {
      clearTimeout(toastHideTimerRef.current);
    }
    toastHideTimerRef.current = setTimeout(() => {
      setToast(null);
      toastHideTimerRef.current = null;
    }, 300);
  };

  const showToast = (message: string, options?: { link?: string | null; variant?: "success" | "error" }) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastHideTimerRef.current) {
      clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }
    setToast({
      visible: true,
      message,
      link: options?.link ?? null,
      variant: options?.variant ?? "success",
    });
    toastTimerRef.current = setTimeout(() => {
      hideToast();
    }, 5000);
  };

  // Refresh analytics when a post is posted or skipped
  const refreshAnalytics = async () => {
    try {
      const response = await fetch("/api/posts");
      if (response.status === 401) {
        setAnalyticsPosts([]);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.posts) {
          const convertedPosts: AnalyticsPost[] = data.posts.map((post: any) => {
            const normalizedStatus: "posted" | "skipped" | "failed" = post.status === "posted" ? "posted" : post.status === "failed" ? "failed" : "skipped";
            const rawComment = typeof post.comment === "string" ? post.comment : undefined;
            const rawNotes = typeof post.notes === "string" ? post.notes : undefined;
            const commentValue = rawComment && rawComment.length > 0 ? rawComment : rawNotes && rawNotes.length > 0 ? rawNotes : null;
            const notesValue = rawNotes && rawNotes.length > 0 ? rawNotes : null;
            return {
              id: post.id,
              uniqueKey: post.id || `${post.query}-${post.link || 'no-link'}-${post.createdAt}`,
              query: post.query,
              title: post.title,
              link: post.link,
              snippet: post.snippet,
              selftext: post.selftext,
              postData: post.postData,
              status: normalizedStatus,
              postedAt: new Date(post.createdAt).getTime(),
              notes: notesValue,
              comment: commentValue,
            };
          });
          setAnalyticsPosts(convertedPosts);
        } else {
          setAnalyticsPosts([]);
        }
      }
    } catch (error) {
      console.error("Error refreshing analytics:", error);
    }
  };

  const handleSubmit = async (message: string) => {
    if (!message.trim()) {
      return;
    }

    // Store the current product idea
    setCurrentProductIdea(message.trim());
    setSubmittedProductIdea(message.trim());

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

        // Fetch Reddit links for each query in parallel
        const linkPromises = data.result.map((query: string) => {
          return fetchRedditLinks(query, postCount);
        });

        // Wait for all links to be fetched, then batch fetch all post content together
        Promise.all(linkPromises).then(() => {
          // Small delay to ensure all links are saved to localStorage and state is updated
          setTimeout(() => {
            batchFetchAllPostContent();
          }, 1000);
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
        const newCount = data.results.length;

        if (newCount > 0) {
          try {
            const usageResponse = await fetch("/api/usage/increment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ count: newCount }),
            });

            if (!usageResponse.ok) {
              const usageError = await usageResponse.json().catch(() => ({}));
              throw new Error(usageError.error || "Weekly usage limit reached. Please try again later.");
            }

            refreshUsage();
          } catch (usageError) {
            console.error("Error updating usage after fetching posts:", usageError);
            setError(usageError instanceof Error ? usageError.message : "Failed to update usage. Please try again later.");
            return;
          }
        }

        setRedditLinks((prev) => {
          const updated = {
            ...prev,
            [query]: data.results,
          };
          // Save to localStorage
          localStorage.setItem("redditLinks", JSON.stringify(updated));
          return updated;
        });
        setError(null);

        // Don't fetch post content here - will be batched together after all queries complete
      }
    } catch (err) {
      console.error(`Error fetching Reddit links for query "${query}":`, err);
    } finally {
      setIsLoadingLinks((prev) => ({ ...prev, [query]: false }));
    }
  };

  // Helper function to cache post
  const cachePost = (url: string, post: { selftext?: string | null; postData?: RedditPost | null }) => {
    try {
      const cacheKey = normalizeUrl(url);
      localStorage.setItem(`redditPost_${cacheKey}`, JSON.stringify(post));
    } catch (e) {
      console.error("Error caching post:", e);
    }
  };

  // Batch fetch post content for ALL queries at once
  const batchFetchAllPostContent = async () => {
    // Read from localStorage to get the latest state (since we save there immediately)
    let currentState: Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>> = {};

    try {
      const saved = localStorage.getItem("redditLinks");
      if (saved) {
        currentState = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading redditLinks from localStorage:", e);
      // Fallback to state if localStorage fails
      setRedditLinks((prev) => {
        currentState = prev;
        return prev;
      });
    }

    const allPostsNeedingFetch: Array<{ url: string; query: string; linkIndex: number; postFullname: string }> = [];
    const postsToUpdate: Array<{ query: string; linkIndex: number; cached: { selftext?: string | null; postData?: RedditPost | null } }> = [];

    // Collect all posts that need fetching across all queries
    Object.entries(currentState).forEach(([query, links]) => {
      links.forEach((link, index) => {
        if (link.link) {
          const urlMatch = link.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
          if (urlMatch) {
            const [, , postId] = urlMatch;
            const postFullname = `t3_${postId}`;

            // Check if post is cached
            const cached = getCachedPost(link.link);
            if (cached && (cached.selftext || cached.postData)) {
              // Post is cached, mark for state update
              postsToUpdate.push({ query, linkIndex: index, cached });
            } else if (!link.selftext && !link.postData) {
              // Post not cached and not already loaded, add to fetch list
              allPostsNeedingFetch.push({ url: link.link, query, linkIndex: index, postFullname });
              // Set loading state for posts that need fetching
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [link.link!]: true }));
            }
          }
        }
      });
    });

    // Update state with cached posts first
    if (postsToUpdate.length > 0) {
      setRedditLinks((prev) => {
        const updated = { ...prev };
        postsToUpdate.forEach(({ query, linkIndex, cached }) => {
          if (updated[query] && updated[query][linkIndex]) {
            updated[query][linkIndex] = {
              ...updated[query][linkIndex],
              selftext: cached.selftext || null,
              postData: cached.postData || null,
            };
          }
        });
        localStorage.setItem("redditLinks", JSON.stringify(updated));
        return updated;
      });
    }

    // Process fetching if needed
    if (allPostsNeedingFetch.length > 0) {
      console.log(`Batch fetching ${allPostsNeedingFetch.length} posts from ${Object.keys(currentState).length} queries in a single batch operation`);
      await processBatchFetch(allPostsNeedingFetch);
    } else {
      console.log("All posts were found in cache, no fetching needed");
    }
  };

  // Helper function to process batch fetching
  const processBatchFetch = async (
    allPostsNeedingFetch: Array<{ url: string; query: string; linkIndex: number; postFullname: string }>
  ) => {
    if (allPostsNeedingFetch.length === 0) {
      console.log("All posts were found in cache, no fetching needed");
      return;
    }

    console.log(`Found ${allPostsNeedingFetch.length} posts to fetch across all queries`);

    // Group post IDs into batches of 100 (Reddit API limit is 100 posts per call)
    const batchSize = 100;
    const postFullnames = allPostsNeedingFetch.map(item => item.postFullname);
    const batches: string[][] = [];

    for (let i = 0; i < postFullnames.length; i += batchSize) {
      batches.push(postFullnames.slice(i, i + batchSize));
    }

    // Create a map for quick lookup: postFullname -> url, linkIndex, and query
    const postDataMap = new Map<string, { url: string; linkIndex: number; query: string }>();
    allPostsNeedingFetch.forEach(({ url, linkIndex, postFullname, query }) => {
      postDataMap.set(postFullname, { url, linkIndex, query });
    });

    console.log(`Fetching ${postFullnames.length} posts in ${batches.length} batch(es) of up to ${batchSize} (Reddit API limit: 100 posts per call)`);

    // Process each batch sequentially with delays and retry logic
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Add delay between batches (except for the first one)
      if (batchIndex > 0) {
        console.log(`Waiting 3 seconds before next batch to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
          console.log(`Fetching batch ${batchIndex + 1}/${batches.length} with ${batch.length} posts (attempt ${retryCount + 1}/${maxRetries})`);

          const response = await fetch("/api/reddit/post", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              postIds: batch,
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              retryCount++;
              if (retryCount < maxRetries) {
                const waitTime = Math.pow(2, retryCount) * 5000;
                console.warn(`Rate limited (429). Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              } else {
                console.error(`Failed to fetch batch ${batchIndex + 1} after ${maxRetries} attempts due to rate limiting`);
                batch.forEach((postFullname) => {
                  const postData = postDataMap.get(postFullname);
                  if (postData) {
                    setIsLoadingPostContent((prev) => {
                      const newState = { ...prev };
                      delete newState[postData.url];
                      return newState;
                    });
                  }
                });
                break;
              }
            } else {
              const errorData = await response.json().catch(() => ({ error: response.statusText }));
              console.error(`Failed to fetch batch ${batchIndex + 1}:`, errorData.error || response.statusText);
              batch.forEach((postFullname) => {
                const postData = postDataMap.get(postFullname);
                if (postData) {
                  setIsLoadingPostContent((prev) => {
                    const newState = { ...prev };
                    delete newState[postData.url];
                    return newState;
                  });
                }
              });
              break;
            }
          }

          success = true;

          const data = await response.json();
          const posts: RedditPost[] = data?.data?.children?.map((child: any) => child.data) || [];

          console.log(`Batch ${batchIndex + 1} returned ${posts.length} posts`);

          const postMap = new Map<string, RedditPost>();
          posts.forEach((post: RedditPost) => {
            const postFullname = post.name;
            if (postFullname) {
              postMap.set(postFullname, post);
            }
          });

          // Update all links in this batch with their post content
          setRedditLinks((prev) => {
            const updated = { ...prev };

            batch.forEach((postFullname) => {
              const postData = postDataMap.get(postFullname);
              if (postData) {
                const { url, linkIndex, query } = postData;
                const post = postMap.get(postFullname);

                if (post && updated[query] && updated[query][linkIndex]) {
                  const postContent = {
                    selftext: post.selftext || null,
                    postData: post,
                  };

                  updated[query][linkIndex] = {
                    ...updated[query][linkIndex],
                    ...postContent,
                  };

                  cachePost(url, postContent);
                }

                setIsLoadingPostContent((prevLoading) => {
                  const newState = { ...prevLoading };
                  delete newState[url];
                  return newState;
                });
              }
            });

            localStorage.setItem("redditLinks", JSON.stringify(updated));
            return updated;
          });
        } catch (err) {
          retryCount++;
          if (retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 5000;
            console.error(`Error fetching batch ${batchIndex + 1} (attempt ${retryCount}/${maxRetries}):`, err);
            console.log(`Waiting ${waitTime / 1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          } else {
            console.error(`Failed to fetch batch ${batchIndex + 1} after ${maxRetries} attempts:`, err);
            batch.forEach((postFullname) => {
              const postData = postDataMap.get(postFullname);
              if (postData) {
                setIsLoadingPostContent((prev) => {
                  const newState = { ...prev };
                  delete newState[postData.url];
                  return newState;
                });
              }
            });
            break;
          }
        }
      }
    }

    console.log(`Finished fetching all ${postFullnames.length} posts`);
  };

  // Legacy function - kept for backwards compatibility but not used
  const batchFetchPostContent = async (query: string, links: Array<{ link?: string | null }>) => {
    // Load cached posts first and update state
    const cachedPostsMap = new Map<string, { selftext?: string | null; postData?: RedditPost | null }>();
    const postsNeedingFetch: Array<{ url: string; linkIndex: number; postFullname: string }> = [];

    // Process links: check cache first, only fetch if not cached
    links.forEach((link, index) => {
      if (link.link) {
        const urlMatch = link.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
        if (urlMatch) {
          const [, , postId] = urlMatch;
          const postFullname = `t3_${postId}`;

          // Check if post is cached
          const cached = getCachedPost(link.link);
          if (cached && (cached.selftext || cached.postData)) {
            // Post is cached, use it
            cachedPostsMap.set(link.link, cached);
            // Update state with cached post immediately
            setRedditLinks((prev) => {
              const updated = { ...prev };
              if (updated[query] && updated[query][index]) {
                updated[query][index] = {
                  ...updated[query][index],
                  selftext: cached.selftext || null,
                  postData: cached.postData || null,
                };
                localStorage.setItem("redditLinks", JSON.stringify(updated));
              }
              return updated;
            });
          } else {
            // Post not cached, add to fetch list
            postsNeedingFetch.push({ url: link.link, linkIndex: index, postFullname });
            // Set loading state for posts that need fetching
            setIsLoadingPostContent((prev) => ({ ...prev, [link.link!]: true }));
          }
        }
      }
    });

    // If all posts are cached, we're done
    if (postsNeedingFetch.length === 0) {
      console.log(`All ${links.length} posts were found in cache, no fetching needed`);
      return;
    }

    console.log(`Found ${cachedPostsMap.size} cached posts, fetching ${postsNeedingFetch.length} new posts`);

    // Group post IDs into batches
    // Reddit API limit is 100 posts per call
    const batchSize = 100;
    const postFullnames = postsNeedingFetch.map(item => item.postFullname);
    const batches: string[][] = [];

    for (let i = 0; i < postFullnames.length; i += batchSize) {
      batches.push(postFullnames.slice(i, i + batchSize));
    }

    // Create a map for quick lookup: postFullname -> url, linkIndex, and query
    const postDataMap = new Map<string, { url: string; linkIndex: number; query: string }>();
    postsNeedingFetch.forEach(({ url, linkIndex, postFullname }) => {
      postDataMap.set(postFullname, { url, linkIndex, query });
    });

    console.log(`Fetching ${postFullnames.length} posts in ${batches.length} batches of up to ${batchSize}`);

    // Process each batch sequentially with delays and retry logic to avoid rate limits
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Add delay between batches (except for the first one)
      // Increased delay to 3 seconds to respect Reddit's rate limits
      if (batchIndex > 0) {
        console.log(`Waiting 3 seconds before next batch to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between batches
      }

      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
          console.log(`Fetching batch ${batchIndex + 1}/${batches.length} with ${batch.length} posts (attempt ${retryCount + 1}/${maxRetries})`);

          // Call /api/reddit/post with POST method for the batch
          const response = await fetch("/api/reddit/post", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              postIds: batch,
            }),
          });

          if (!response.ok) {
            // Handle 429 (Too Many Requests) with exponential backoff
            if (response.status === 429) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Exponential backoff: wait 5s, 10s, 20s
                const waitTime = Math.pow(2, retryCount) * 5000;
                console.warn(`Rate limited (429). Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // Retry the request
              } else {
                console.error(`Failed to fetch batch ${batchIndex + 1} after ${maxRetries} attempts due to rate limiting`);
                // Remove loading state for failed posts
                batch.forEach((postFullname) => {
                  const postData = postDataMap.get(postFullname);
                  if (postData) {
                    setIsLoadingPostContent((prev) => {
                      const newState = { ...prev };
                      delete newState[postData.url];
                      return newState;
                    });
                  }
                });
                break; // Skip this batch and move to next
              }
            } else {
              // Other errors - log and skip
              const errorData = await response.json().catch(() => ({ error: response.statusText }));
              console.error(`Failed to fetch batch ${batchIndex + 1}:`, errorData.error || response.statusText);
              // Remove loading state for failed posts
              batch.forEach((postFullname) => {
                const postData = postDataMap.get(postFullname);
                if (postData) {
                  setIsLoadingPostContent((prev) => {
                    const newState = { ...prev };
                    delete newState[postData.url];
                    return newState;
                  });
                }
              });
              break; // Skip this batch and move to next
            }
          }

          // Success - process the response
          success = true;

          const data = await response.json();

          // The /api/reddit/post endpoint returns Reddit API response
          // Format: { data: { children: [{ data: RedditPost }] } }
          const posts: RedditPost[] = data?.data?.children?.map((child: any) => child.data) || [];

          console.log(`Batch ${batchIndex + 1} returned ${posts.length} posts`);

          // Create a map of post ID to post data for quick lookup
          const postMap = new Map<string, RedditPost>();
          posts.forEach((post: RedditPost) => {
            // Extract post ID from the post's name (format: t3_xxxxx)
            const postFullname = post.name;
            if (postFullname) {
              postMap.set(postFullname, post);
            }
          });

          // Update all links in this batch with their post content and cache them
          setRedditLinks((prev) => {
            const updated = { ...prev };

            // Update each post in the batch
            batch.forEach((postFullname) => {
              const postData = postDataMap.get(postFullname);
              if (postData) {
                const { url, linkIndex } = postData;
                const post = postMap.get(postFullname);

                if (post && updated[query] && updated[query][linkIndex]) {
                  const postContent = {
                    selftext: post.selftext || null,
                    postData: post,
                  };

                  // Update the link with post content
                  updated[query][linkIndex] = {
                    ...updated[query][linkIndex],
                    ...postContent,
                  };

                  // Cache the post in localStorage
                  cachePost(url, postContent);
                }

                // Remove loading state
                setIsLoadingPostContent((prev) => {
                  const newState = { ...prev };
                  delete newState[url];
                  return newState;
                });
              }
            });

            // Save to localStorage
            localStorage.setItem("redditLinks", JSON.stringify(updated));
            return updated;
          });
        } catch (err) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff for network errors
            const waitTime = Math.pow(2, retryCount) * 5000;
            console.error(`Error fetching batch ${batchIndex + 1} (attempt ${retryCount}/${maxRetries}):`, err);
            console.log(`Waiting ${waitTime / 1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue; // Retry
          } else {
            console.error(`Failed to fetch batch ${batchIndex + 1} after ${maxRetries} attempts:`, err);
            // Remove loading state for failed posts
            batch.forEach((postFullname) => {
              const postData = postDataMap.get(postFullname);
              if (postData) {
                setIsLoadingPostContent((prev) => {
                  const newState = { ...prev };
                  delete newState[postData.url];
                  return newState;
                });
              }
            });
            break; // Move to next batch
          }
        }
      }
    }

    console.log(`Finished fetching all ${postFullnames.length} posts`);
  };

  const handleIdeaSelect = (idea: string) => {
    setSelectedIdea(idea);
    // You might want to populate the textarea with this idea
    // This would require passing a callback or modifying ChatTextarea
  };

  // Handler for Post button - post comment to Reddit and move to analytics
  const handlePostClick = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }) => {
    const linkKey = linkItem.uniqueKey;
    const commentText = postTextareas[linkKey];

    // Validate required data
    if (!commentText || !commentText.trim()) {
      alert("Please generate or enter a comment before posting.");
      return;
    }

    if (!linkItem.postData?.name) {
      alert("Invalid post data. Cannot post comment.");
      return;
    }

    // Set posting state
    setIsPosting((prev) => ({ ...prev, [linkKey]: true }));

    try {
      // Post comment to Reddit
      const response = await fetch("/api/reddit/post-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thing_id: extractThingIdFromLink(linkItem.link || ""), // Use extracted thing_id
          text: commentText.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to post comment to Reddit");
      }

      const result = await response.json();

      // Save to MongoDB - create document in postsv2 collection
      try {
        const dbResponse = await fetch("/api/posts/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "posted",
            query: linkItem.query,
            title: linkItem.title || null,
            link: linkItem.link || null,
            snippet: linkItem.snippet || null,
            selftext: linkItem.selftext || null,
            postData: linkItem.postData || null,
            comment: commentText.trim(),
            notes: commentText.trim(),
          }),
        });

        if (!dbResponse.ok) {
          const dbError = await dbResponse.json();
          console.error("Error saving post to MongoDB:", dbError);
          // Log error but don't fail the operation
        } else {
          console.log("Post saved to MongoDB successfully");
        }
      } catch (dbError) {
        console.error("Error saving post to database:", dbError);
        // Don't fail the whole operation if DB save fails
      }

      // Refresh analytics from database after posting
      await refreshAnalytics();

      // Remove from redditLinks (filter it out from the dashboard)
      setRedditLinks((prev) => {
        const updated = { ...prev };
        if (updated[linkItem.query]) {
          // Remove the post by filtering it out
          updated[linkItem.query] = updated[linkItem.query].filter((link, index) => {
            // Check if this is the post we want to remove
            // We'll use the link URL to identify it since uniqueKey might not be stored
            if (link.link === linkItem.link) {
              return false; // Remove this post
            }
            return true;
          });
          // If the query has no more links, we could remove the query key, but let's keep it
          localStorage.setItem("redditLinks", JSON.stringify(updated));
        }
        return updated;
      });

      // Remove textarea value if it exists
      setPostTextareas((prev) => {
        const updated = { ...prev };
        delete updated[linkKey];
        return updated;
      });

      // Show success message
      showToast("Comment posted successfully.", { link: linkItem.link || null, variant: "success" });
    } catch (err) {
      console.error("Error posting comment:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to post comment to Reddit";
      showToast(errorMessage, { variant: "error" });
      try {
        await fetch("/api/posts/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "failed",
            query: linkItem.query,
            title: linkItem.title || null,
            link: linkItem.link || null,
            snippet: linkItem.snippet || null,
            selftext: linkItem.selftext || null,
            postData: linkItem.postData || null,
            comment: (postTextareas[linkKey] || "").trim() || null,
            notes: errorMessage,
          }),
        });
        await refreshAnalytics();
      } catch (recordError) {
        console.error("Error recording failed analytics entry:", recordError);
      }
    } finally {
      setIsPosting((prev) => ({ ...prev, [linkKey]: false }));
    }
  };

  // Handler for Generate Comment button
  const handleGenerateComment = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }) => {
    await generateCommentForLink(linkItem, { force: true, showAlerts: true });
  };

  // Handler for Skip button
  const handleSkipClick = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }) => {
    // Save to MongoDB
    try {
      await fetch("/api/posts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "skipped",
          query: linkItem.query,
          title: linkItem.title || null,
          link: linkItem.link || null,
          snippet: linkItem.snippet || null,
          selftext: linkItem.selftext || null,
          postData: linkItem.postData || null,
          notes: postTextareas[linkItem.uniqueKey] || null,
        }),
      });
    } catch (dbError) {
      console.error("Error saving skipped post to database:", dbError);
      // Don't fail the whole operation if DB save fails
    }

    // Refresh analytics from database after skipping
    await refreshAnalytics();

    // Remove from redditLinks
    setRedditLinks((prev) => {
      const updated = { ...prev };
      if (updated[linkItem.query]) {
        updated[linkItem.query] = updated[linkItem.query].filter((link) => link.link !== linkItem.link);
        localStorage.setItem("redditLinks", JSON.stringify(updated));
      }
      return updated;
    });

    // Remove textarea value
    setPostTextareas((prev) => {
      const updated = { ...prev };
      delete updated[linkItem.uniqueKey];
      return updated;
    });
  };

  // Handler for Close button (X button) - saves as "skipped"
  const handleCloseClick = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }) => {
    const trimmedComment = (postTextareas[linkItem.uniqueKey] || "").trim();
    // Save to MongoDB with "skipped" status
    try {
      await fetch("/api/posts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "skipped",
          query: linkItem.query,
          title: linkItem.title || null,
          link: linkItem.link || null,
          snippet: linkItem.snippet || null,
          selftext: linkItem.selftext || null,
          postData: linkItem.postData || null,
          comment: trimmedComment || null,
          notes: trimmedComment || null,
        }),
      });
    } catch (dbError) {
      console.error("Error saving skipped post to database:", dbError);
      // Don't fail the whole operation if DB save fails
    }

    // Refresh analytics from database after closing
    await refreshAnalytics();

    // Remove from redditLinks
    setRedditLinks((prev) => {
      const updated = { ...prev };
      if (updated[linkItem.query]) {
        // Remove the post by filtering it out
        updated[linkItem.query] = updated[linkItem.query].filter((link) => link.link !== linkItem.link);
        localStorage.setItem("redditLinks", JSON.stringify(updated));
      }
      return updated;
    });

    // Remove textarea value
    setPostTextareas((prev) => {
      const updated = { ...prev };
      delete updated[linkItem.uniqueKey];
      return updated;
    });
  };

  const distinctLinksCount = distinctLinks.length;

  // Helper function to format timestamp as relative time
  const formatTimeAgo = (timestampUtc: number | undefined | null): string => {
    if (!timestampUtc) {
      return "Unknown";
    }

    const now = Date.now() / 1000; // Current time in seconds
    const postTime = timestampUtc; // Reddit timestamp is in seconds
    const diffInSeconds = now - postTime;

    if (diffInSeconds < 60) {
      return "just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 2592000) {
      const weeks = Math.floor(diffInSeconds / 604800);
      return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 31536000) {
      const months = Math.floor(diffInSeconds / 2592000);
      return `${months} month${months !== 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffInSeconds / 31536000);
      return `${years} year${years !== 1 ? 's' : ''} ago`;
    }
  };

  const handleRemoveAllPosts = () => {
    setRedditLinks(() => {
      localStorage.removeItem("redditLinks");
      return {};
    });
    generatedCommentUrlsRef.current.clear();
    generatingCommentUrlsRef.current.clear();
    setResults([]);
    localStorage.removeItem("savedQueries");
    setPostTextareas({});
    setExpandedPosts(new Set());
    setIsLoadingLinks({});
    setIsLoadingPostContent({});
    setIsGeneratingComment({});
    setIsPosting({});
    postTextareasRef.current = {};
    showToast("All posts have been cleared", { variant: "success" });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "analytics":
        return (
          <div className={cn(
            "flex-1 overflow-y-auto px-2 py-4 sm:px-3",
            !sidebarOpen && "pl-14 pt-14"
          )}>
            <div className="flex h-full flex-col gap-2">
              <div className="flex gap-1.5">
                <Button
                  variant={analyticsFilter === "posted" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAnalyticsFilter("posted")}
                >
                  Active
                </Button>
                <Button
                  variant={analyticsFilter === "skipped" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAnalyticsFilter("skipped")}
                >
                  Skipped
                </Button>
                <Button
                  variant={analyticsFilter === "failed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAnalyticsFilter("failed")}
                >
                  Failed
                </Button>
              </div>

              {isLoadingAnalytics ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <p className="text-muted-foreground">Loading analytics...</p>
                  </div>
                </div>
              ) : filteredAnalyticsPosts.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <p className="text-muted-foreground">
                    {analyticsFilter === "posted"
                      ? "No active posts yet. Generate comments and post them to see activity here."
                      : analyticsFilter === "skipped"
                        ? "No skipped posts yet. Skip a post in the Discovery tab to review it here."
                        : "No failed posts yet. If a post fails to publish, it will appear here."}
                  </p>
                </div>
              ) : (
                (() => {
                  const PAGE_SIZE = 30;
                  const isSkippedView = analyticsFilter === "skipped";
                  const totalItems = filteredAnalyticsPosts.length;
                  const totalPages = isSkippedView ? Math.max(1, Math.ceil(totalItems / PAGE_SIZE)) : 1;
                  const currentPage = isSkippedView ? Math.min(analyticsPage, totalPages) : 1;
                  const startIdx = isSkippedView ? (currentPage - 1) * PAGE_SIZE : 0;
                  const endIdx = isSkippedView ? startIdx + PAGE_SIZE : filteredAnalyticsPosts.length;
                  const pageItems = filteredAnalyticsPosts.slice(startIdx, endIdx);

                  return (
                    <div className="flex-1 min-h-0">
                      <div className="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden">
                        <div className="max-h-[65vh] flex-1 overflow-x-auto overflow-y-auto">
                          <table className="min-w-full">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Query</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Updated</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Post</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {pageItems.map((post) => (
                                <tr
                                  key={post.id || post.uniqueKey}
                                  className="cursor-pointer transition hover:bg-muted/40"
                                  onClick={() => openAnalyticsDrawer(post)}
                                >
                                  <td className="px-4 py-3">
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                                        post.status === "posted" && "bg-emerald-500/10 text-emerald-500",
                                        post.status === "skipped" && "bg-amber-500/10 text-amber-600",
                                        post.status === "failed" && "bg-red-500/10 text-red-500"
                                      )}
                                    >
                                      {post.status}
                                    </span>
                                  </td>
                                  <td className="max-w-sm px-4 py-3 text-sm font-medium text-foreground">
                                    <div className="truncate" title={post.title || "Untitled post"}>
                                      {post.title || "Untitled post"}
                                    </div>
                                  </td>
                                  <td className="max-w-xs px-4 py-3 text-sm text-muted-foreground">
                                    <div className="line-clamp-2">{post.query}</div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {new Date(post.postedAt).toLocaleDateString()}
                                  </td>
                                  <td className="px-4 py-3">
                                    {post.link ? (
                                      <a
                                        href={post.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-primary hover:underline"
                                      >
                                        Link
                                      </a>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {isSkippedView && totalItems > PAGE_SIZE && (
                          <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-xs text-muted-foreground">
                              Showing {startIdx + 1}-{Math.min(endIdx, totalItems)} of {totalItems}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAnalyticsPage((prev) => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                              >
                                Previous
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                Page {currentPage} of {totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAnalyticsPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        );
      case "dashboard":
        // Show Reddit connection prompt if no token
        if (isCheckingReddit) {
          return (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <span>Checking Reddit connection...</span>
              </div>
            </div>
          );
        }

        if (hasRedditToken === false) {
          return (
            <div className="flex h-full flex-col items-center justify-center p-6">
              <div className="max-w-md space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <svg
                    className="h-8 w-8 text-muted-foreground"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-5.248a1.25 1.25 0 0 1 2.634.312l1.211 2.44zM9.5 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056L5.655 0.752a1.25 1.25 0 0 1 2.634.312l1.211 2.44zM4.5 12c0-1.5.5-2.5 1.5-3.5s2-1.5 3-1.5 2.5.5 3.5 1.5 1.5 2 1.5 3.5-.5 2.5-1.5 3.5-2 1.5-3.5 1.5-2.5-.5-3.5-1.5-1.5-2-1.5-3.5zm11.5 0c0-1.5.5-2.5 1.5-3.5s2-1.5 3-1.5 2.5.5 3.5 1.5 1.5 2 1.5 3.5-.5 2.5-1.5 3.5-2 1.5-3.5 1.5-2.5-.5-3.5-1.5-1.5-2-1.5-3.5z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Connect Your Reddit Account</h2>
                  <p className="text-muted-foreground">
                    To post comments to Reddit, you need to connect your Reddit account first.
                    This allows us to post comments on your behalf.
                  </p>
                </div>
                <div className="pt-4">
                  <Button
                    onClick={() => {
                      window.location.href = "/api/reddit/auth";
                    }}
                    size="lg"
                    className="gap-2"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-5.248a1.25 1.25 0 0 1 2.634.312l1.211 2.44zM9.5 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056L5.655 0.752a1.25 1.25 0 0 1 2.634.312l1.211 2.44zM4.5 12c0-1.5.5-2.5 1.5-3.5s2-1.5 3-1.5 2.5.5 3.5 1.5 1.5 2 1.5 3.5-.5 2.5-1.5 3.5-2 1.5-3.5 1.5-2.5-.5-3.5-1.5-1.5-2-1.5-3.5zm11.5 0c0-1.5.5-2.5 1.5-3.5s2-1.5 3-1.5 2.5.5 3.5 1.5 1.5 2 1.5 3.5-.5 2.5-1.5 3.5-2 1.5-3.5 1.5-2.5-.5-3.5-1.5-1.5-2-1.5-3.5z" />
                    </svg>
                    Connect Reddit Account
                  </Button>
                </div>
              </div>
            </div>
          );
        }

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
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-full max-w-md space-y-4">
                      <div className="space-y-2 text-center">
                        <h3 className="text-base font-semibold text-foreground">Finding Reddit posts...</h3>
                        <p className="text-sm text-muted-foreground">
                          Generating search queries and discovering relevant posts for your product
                        </p>
                      </div>
                      <div className="w-full">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted relative">
                          <div
                            className="h-full w-3/4 rounded-full bg-primary absolute"
                            style={{
                              background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3) 0%, hsl(var(--primary)) 50%, hsl(var(--primary) / 0.3) 100%)',
                              animation: 'progress 1.5s ease-in-out infinite',
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>This may take a few moments...</span>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-semibold">
                        Reddit Posts
                        {distinctLinksCount > 0 && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({distinctLinksCount} found)
                          </span>
                        )}
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveAllPosts}
                        disabled={distinctLinksCount === 0 && !Object.values(isLoadingLinks).some(Boolean)}
                        className="self-start sm:self-auto"
                      >
                        Remove all posts
                      </Button>
                    </div>

                    {/* Show loading state if any query is still loading */}
                    {Object.values(isLoadingLinks).some(Boolean) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span>Searching Reddit...</span>
                      </div>
                    )}

                    {/* Flatten all Reddit links and display in grid - newest first */}
                    {distinctLinks.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {distinctLinks.map((linkItem) => {
                          const link = linkItem;
                          // Extract subreddit from URL
                          const subredditMatch = linkItem.link?.match(/reddit\.com\/r\/([^/]+)/);
                          const subreddit = subredditMatch ? subredditMatch[1] : null;
                          // Use unique key that includes query to avoid duplicates
                          const linkKey = linkItem.uniqueKey;
                          const isExpanded = expandedPosts.has(linkKey);

                          // Clean snippet
                          let cleanSnippet = link.snippet || '';
                          cleanSnippet = cleanSnippet.replace(/\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
                          cleanSnippet = cleanSnippet.replace(/posted\s+\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
                          cleanSnippet = cleanSnippet.replace(/^[.\s\u2026]+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^\.+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^[\s\u00A0]+/g, '');
                          cleanSnippet = cleanSnippet.replace(/^\.{1,}/g, '');
                          cleanSnippet = cleanSnippet.trim();

                          // Helper function to estimate if content would exceed 3 lines
                          // With text-xs (12px) and typical card width (~300-400px), roughly 60-80 chars per line
                          // For 3 lines, that's approximately 180-240 characters
                          // We'll use a conservative estimate of 200 characters for 3 lines
                          const estimateLines = (text: string): number => {
                            if (!text) return 0;
                            // Count actual line breaks first
                            const lineBreaks = (text.match(/\n/g) || []).length;
                            if (lineBreaks >= 3) return lineBreaks + 1; // Already has 3+ line breaks

                            // Estimate based on character count
                            // Assuming ~65 characters per line for text-xs in card width
                            const charsPerLine = 65;
                            const estimatedLines = Math.ceil(text.length / charsPerLine);
                            return estimatedLines;
                          };

                          // Get the actual content to check
                          const contentToCheck = link.selftext || cleanSnippet || '';
                          const estimatedLines = estimateLines(contentToCheck);
                          const maxLines = 3;
                          const shouldShowSeeMore = estimatedLines > maxLines;

                          return (
                            <div
                              key={linkKey}
                              className="relative flex h-full flex-col rounded-lg border-2 border-gray-400 dark:border-gray-500 bg-card p-4"
                            >
                              {/* Close button - top right */}
                              <button
                                onClick={() => handleCloseClick(linkItem)}
                                className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Close this post"
                                aria-label="Close post"
                              >
                                <X className="h-4 w-4" />
                              </button>

                              {/* Top section - Content area */}
                              <div className="flex-1">
                                {/* Subreddit name */}
                                {subreddit && (
                                  <div className="mb-2 flex items-center gap-1 pr-6">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      r/{subreddit}
                                    </span>
                                  </div>
                                )}

                                {/* Title */}
                                <h3 className="mb-2 pr-6 text-sm font-semibold leading-tight text-foreground line-clamp-2">
                                  {link.title}
                                </h3>

                                {/* Post Content - Show selftext if available, otherwise show snippet */}
                                {isLoadingPostContent[link.link || ''] ? (
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                    <span className="text-xs text-muted-foreground">Loading post content...</span>
                                  </div>
                                ) : (
                                  (link.selftext || cleanSnippet) && (
                                    <div className="mb-3">
                                      <p className={cn(
                                        "text-xs leading-relaxed text-muted-foreground",
                                        !isExpanded ? "line-clamp-3" : ""
                                      )}>
                                        {link.selftext || cleanSnippet}
                                      </p>
                                      {shouldShowSeeMore && (
                                        <button
                                          onClick={() => {
                                            const newExpanded = new Set(expandedPosts);
                                            if (isExpanded) {
                                              newExpanded.delete(linkKey);
                                            } else {
                                              newExpanded.add(linkKey);
                                            }
                                            setExpandedPosts(newExpanded);
                                          }}
                                          className="mt-1 text-xs font-medium text-primary hover:underline"
                                        >
                                          {isExpanded ? "See less" : "See more"}
                                        </button>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Bottom section - Textarea and Footer */}
                              <div className={postTextareas[linkKey]?.trim() ? "mt-auto" : "mt-4"}>
                                {/* Textarea */}
                                {isGeneratingComment[linkKey] ? (
                                  <div className="mb-2 flex min-h-[100px] items-center justify-center rounded-md border border-border bg-background px-3 py-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span>Generating comment...</span>
                                    </div>
                                  </div>
                                ) : (
                                  <textarea
                                    value={postTextareas[linkKey] || ""}
                                    onChange={(e) => {
                                      setPostTextareas((prev) => ({
                                        ...prev,
                                        [linkKey]: e.target.value,
                                      }));
                                    }}
                                    placeholder="Add your notes or comments here..."
                                    className="mb-2 w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none resize-y"
                                    rows={4}
                                  />
                                )}

                                {/* Generate Comment button */}
                                {!postTextareas[linkKey]?.trim() && (
                                  <div className="mb-3 flex justify-start">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="text-xs px-2 py-0.5 h-6"
                                      onClick={() => handleGenerateComment(linkItem)}
                                      disabled={isGeneratingComment[linkKey]}
                                    >
                                      {isGeneratingComment[linkKey] ? "Generating..." : "Generate Comment"}
                                    </Button>
                                  </div>
                                )}

                                {/* Footer with timestamp, link, and post button */}
                                {link.link && (
                                  <div className="flex items-center justify-between border-t border-border pt-2">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-muted-foreground">
                                        {link.postData?.created_utc
                                          ? formatTimeAgo(link.postData.created_utc)
                                          : "Unknown"}
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
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="text-xs"
                                      onClick={() => handlePostClick(linkItem)}
                                      disabled={isPosting[linkKey]}
                                    >
                                      {isPosting[linkKey] ? "Posting..." : "Post"}
                                    </Button>
                                  </div>
                                )}
                              </div>
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
                postCount={postCount}
                onPostCountChange={setPostCount}
                autoGenerateComments={autoGenerateComments}
                onAutoGenerateCommentsChange={setAutoGenerateComments}
                onSend={handleSubmit}
                onChange={(value) => setCurrentProductIdea(value)}
                placeholder="Tell us about your product and what it does..."
                className="h-auto"
                previousIdeas={previousIdeas}
                onIdeaSelect={setSelectedIdea}
                selectedIdea={selectedIdea}
              />
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

  const handleAnalyticsPostSubmit = async () => {
    if (!selectedAnalyticsPost) {
      return;
    }

    const commentText = drawerComment.trim();

    if (!commentText) {
      showToast("Please enter a comment before posting.", { variant: "error" });
      return;
    }

    let thingId = selectedAnalyticsPost.postData?.name || null;
    if (!thingId && selectedAnalyticsPost.link) {
      thingId = extractThingIdFromLink(selectedAnalyticsPost.link);
    }

    if (!thingId) {
      showToast("Unable to determine the Reddit post ID.", { variant: "error" });
      return;
    }

    setIsPostingFromAnalytics(true);

    try {
      const response = await fetch("/api/reddit/post-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thing_id: thingId,
          text: commentText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to post comment to Reddit");
      }

      if (selectedAnalyticsPost.id) {
        try {
          const updateResponse = await fetch("/api/posts/update-status", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: selectedAnalyticsPost.id,
              status: "posted",
              comment: commentText,
            }),
          });

          if (!updateResponse.ok) {
            const updateError = await updateResponse.json().catch(() => ({}));
            console.error("Error updating analytics post status:", updateError);
          }
        } catch (updateError) {
          console.error("Error updating analytics post status:", updateError);
        }
      } else {
        try {
          await fetch("/api/posts/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "posted",
              query: selectedAnalyticsPost.query,
              title: selectedAnalyticsPost.title,
              link: selectedAnalyticsPost.link,
              snippet: selectedAnalyticsPost.snippet,
              selftext: selectedAnalyticsPost.selftext,
              postData: selectedAnalyticsPost.postData,
              comment: commentText,
            }),
          });
        } catch (createError) {
          console.error("Error recording posted analytics entry:", createError);
        }
      }

      showToast("Comment posted successfully.", {
        link: selectedAnalyticsPost.link || null,
        variant: "success",
      });
      closeAnalyticsDrawer();
      await refreshAnalytics();
    } catch (error) {
      console.error("Error posting analytics comment:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to post comment to Reddit";
      showToast(errorMessage, { variant: "error" });
    } finally {
      setIsPostingFromAnalytics(false);
    }
  };

  return (
    <>
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
      {selectedAnalyticsPost && (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-background/40 backdrop-blur-sm transition-opacity duration-300",
              isAnalyticsDrawerVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
            onClick={closeAnalyticsDrawer}
          />
          <div
            className={cn(
              "fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-500 ease-out",
              isAnalyticsDrawerVisible ? "translate-x-0" : "translate-x-4 opacity-0"
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex flex-col gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedAnalyticsPost.title || "No title"}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">{selectedAnalyticsPost.query}</p>
                </div>
                {selectedAnalyticsPost.link && (
                  <button
                    className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedAnalyticsPost.link) {
                        window.open(selectedAnalyticsPost.link, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Reddit Post
                  </button>
                )}
              </div>
              <button
                onClick={closeAnalyticsDrawer}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close analytics drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex h-full flex-col px-4 py-4">
              <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-8">
                {selectedAnalyticsPost.selftext && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Post Content</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedAnalyticsPost.selftext}</p>
                  </div>
                )}
                {(analyticsFilter === "failed" || analyticsFilter === "skipped") && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Generated Comment</h4>
                    <textarea
                      value={drawerComment}
                      onChange={(e) => setDrawerComment(e.target.value)}
                      placeholder="Enter the comment to post"
                      className="mt-2 w-full min-h-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>
                )}
              </div>
              {(analyticsFilter === "skipped" || analyticsFilter === "failed") && (
                <div className="border-t border-border pt-4 mt-4 flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeAnalyticsDrawer();
                    }}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnalyticsPostSubmit();
                    }}
                    disabled={isPostingFromAnalytics}
                    className="flex-1"
                  >
                    {isPostingFromAnalytics ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      "Post Comment"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {toast && (
        <div
          className={cn(
            "fixed bottom-14 left-1/2 z-50 -translate-x-1/2 transform transition-all duration-500 ease-out",
            toast.visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-8 opacity-0 pointer-events-none"
          )}
        >
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg px-4 py-3 shadow-2xl border",
              toast.variant === "error"
                ? "border-destructive bg-destructive/15 text-destructive"
                : "border-border/90 bg-card text-foreground"
            )}
          >
            <div className="text-sm">
              {toast.link ? (
                <>
                  {toast.message}
                  {" "}
                  <a
                    href={toast.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline"
                  >
                    here
                  </a>
                  .
                </>
              ) : (
                toast.message
              )}
            </div>
            <button
              onClick={hideToast}
              className={cn(
                "ml-2 rounded-full p-1 transition-colors",
                toast.variant === "error"
                  ? "text-destructive hover:bg-destructive/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-label="Close toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function PlaygroundPage() {
  return (
    <PlaygroundLayout>
      <Suspense fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      }>
        <PlaygroundContent />
      </Suspense>
    </PlaygroundLayout>
  );
}

