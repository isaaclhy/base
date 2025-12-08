"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense, useTransition } from "react";
import { ExternalLink, X, Loader2, CheckCircle2, Send, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import PlaygroundLayout, { usePlaygroundTab, usePlaygroundSidebar, useRefreshUsage, useSetPlaygroundTab } from "@/components/playground-layout";
import PricingSection from "@/app/landing-sections/pricing";
import { RedditPost } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";

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

// Helper function to safely save to localStorage with quota error handling
const safeSetLocalStorage = (key: string, value: any, onError?: () => void) => {
  try {
    // Only store minimal data in redditLinks - exclude postData and selftext to save space
    let dataToStore = value;
    if (key === "redditLinks" && typeof value === "object") {
      dataToStore = Object.fromEntries(
        Object.entries(value).map(([query, links]: [string, any]) => [
          query,
          Array.isArray(links)
            ? links.map((link: any) => ({
                title: link.title,
                link: link.link,
                snippet: link.snippet,
                // Don't store postData or selftext here - they're stored separately in cache
              }))
            : links,
        ])
      );
    }
    
    localStorage.setItem(key, JSON.stringify(dataToStore));
  } catch (e: any) {
    if (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014) {
      console.warn(`localStorage quota exceeded for key: ${key}`);
      
      // If it's redditLinks, try to clear old queries to make space
      if (key === "redditLinks" && onError) {
        onError();
      } else if (key === "redditLinks") {
        // Clear old queries, keep only the most recent 5 queries, then retry
        try {
          const current = JSON.parse(localStorage.getItem(key) || "{}");
          const queries = Object.keys(current);
          if (queries.length > 5) {
            const queriesToKeep = queries.slice(-5);
            const trimmed = Object.fromEntries(
              queriesToKeep.map((q) => [q, current[q]])
            );
            // Try to save the trimmed version
            try {
              localStorage.setItem(key, JSON.stringify(trimmed));
              console.log(`Cleared old queries, kept only the most recent 5`);
              // Now try to save the new data again (but it might still fail)
              if (value && typeof value === "object") {
                const minimalData = Object.fromEntries(
                  Object.entries(value).map(([q, links]: [string, any]) => [
                    q,
                    Array.isArray(links)
                      ? links.map((link: any) => ({
                          title: link.title,
                          link: link.link,
                          snippet: link.snippet,
                        }))
                      : links,
                  ])
                );
                // Merge with existing trimmed data (keep latest queries)
                const merged = { ...trimmed, ...minimalData };
                const mergedQueries = Object.keys(merged);
                // Keep only the most recent 10 queries after merge
                if (mergedQueries.length > 10) {
                  const recentQueries = mergedQueries.slice(-10);
                  const finalTrimmed = Object.fromEntries(
                    recentQueries.map((q) => [q, merged[q]])
                  );
                  localStorage.setItem(key, JSON.stringify(finalTrimmed));
                } else {
                  localStorage.setItem(key, JSON.stringify(merged));
                }
              }
            } catch (retryError) {
              console.error("Error saving after clearing old data:", retryError);
              // If still failing, clear everything
              localStorage.removeItem(key);
            }
          } else {
            // Not enough old data to clear, just remove the key
            localStorage.removeItem(key);
          }
        } catch (clearError) {
          console.error("Error clearing old data:", clearError);
          // If clearing old data fails, clear everything
          try {
            localStorage.removeItem(key);
          } catch (removeError) {
            console.error("Error removing key:", removeError);
          }
        }
      }
    } else {
      console.error(`Error saving to localStorage (key: ${key}):`, e);
    }
  }
};

function PlaygroundContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = usePlaygroundTab();
  const setActiveTab = useSetPlaygroundTab();
  const sidebarOpen = usePlaygroundSidebar();
  const refreshUsage = useRefreshUsage();
  const [website, setWebsite] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [persona, setPersona] = useState("");
  const [postCount, setPostCount] = useState<number>(100);
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
  const [isPending, startTransition] = useTransition();
  const [currentProductIdea, setCurrentProductIdea] = useState<string>("");
  const [submittedProductIdea, setSubmittedProductIdea] = useState<string>("");
  const [isGeneratingComment, setIsGeneratingComment] = useState<Record<string, boolean>>({});
  const [isPosting, setIsPosting] = useState<Record<string, boolean>>({});
  const [isBulkPostModalOpen, setIsBulkPostModalOpen] = useState(false);
  const [isBulkPosting, setIsBulkPosting] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; link?: string | null; variant?: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCheckoutSuccessModal, setShowCheckoutSuccessModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalContext, setUpgradeModalContext] = useState<{ limitReached?: boolean; remaining?: number } | null>(null);
  const generatedCommentUrlsRef = useRef<Set<string>>(new Set());
  const generatingCommentUrlsRef = useRef<Set<string>>(new Set());
  const restoredCommentsRef = useRef<Set<string>>(new Set());
  const previousLinksKeyRef = useRef<string>("");

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
  const ANALYTICS_ITEMS_PER_PAGE = 20;
  const [selectedAnalyticsPost, setSelectedAnalyticsPost] = useState<AnalyticsPost | null>(null);
  const [isAnalyticsDrawerVisible, setIsAnalyticsDrawerVisible] = useState(false);
  const [drawerComment, setDrawerComment] = useState<string>("");
  const [isPostingFromAnalytics, setIsPostingFromAnalytics] = useState(false);
  const analyticsDrawerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRedditConnected, setIsRedditConnected] = useState<boolean | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const analyticsFetchedRef = useRef<boolean>(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [selectedDiscoveryPost, setSelectedDiscoveryPost] = useState<typeof distinctLinks[0] | null>(null);
  const [isDiscoveryDrawerVisible, setIsDiscoveryDrawerVisible] = useState(false);
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const DISCOVERY_ITEMS_PER_PAGE = 20;
  const [isSavingProductDetails, setIsSavingProductDetails] = useState(false);
  const [isLoadingProductDetails, setIsLoadingProductDetails] = useState(false);
  const [isGeneratingProductDescription, setIsGeneratingProductDescription] = useState(false);
  const [productDetailsFromDb, setProductDetailsFromDb] = useState<{ link?: string; productDescription?: string } | null>(null);

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

  // Check Reddit connection status on page load and refresh
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const checkRedditConnection = async () => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
            console.log("🔗 Reddit Connection Status Check:", {
              connected: data.connected,
              hasAccessToken: data.hasAccessToken,
              hasRefreshToken: data.hasRefreshToken,
              user: session.user.email
            });
          } else {
            setIsRedditConnected(false);
            console.log("🔗 Reddit Connection Status Check: Failed to fetch status", {
              status: response.status,
              user: session.user.email
            });
          }
        } catch (error) {
          console.error("🔗 Error checking Reddit connection status:", error);
          setIsRedditConnected(false);
        }
      };
      
      checkRedditConnection();
    } else {
      setIsRedditConnected(null);
    }
  }, [status, session]);

  // Load product details when authenticated (for use in Discovery page)
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const loadProductDetails = async () => {
        try {
          const response = await fetch("/api/user/product-details");
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.productDetails) {
              setProductDetailsFromDb(data.productDetails);
              // Also set website and productDescription for Product tab
              if (data.productDetails.link) {
                setWebsite(data.productDetails.link);
              }
              if (data.productDetails.productDescription) {
                setProductDescription(data.productDetails.productDescription);
              }
            } else {
              setProductDetailsFromDb(null);
            }
          }
        } catch (error) {
          console.error("Error loading product details:", error);
          setProductDetailsFromDb(null);
        }
      };
      
      loadProductDetails();
    }
  }, [status, session]);

  // Load product details when Product tab is active (to refresh)
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email && activeTab === "product") {
      setIsLoadingProductDetails(true);
      const loadProductDetails = async () => {
        try {
          const response = await fetch("/api/user/product-details");
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.productDetails) {
              setProductDetailsFromDb(data.productDetails);
              if (data.productDetails.link) {
                setWebsite(data.productDetails.link);
              }
              if (data.productDetails.productDescription) {
                setProductDescription(data.productDetails.productDescription);
              }
            }
          }
        } catch (error) {
          console.error("Error loading product details:", error);
        } finally {
          setIsLoadingProductDetails(false);
        }
      };
      
      loadProductDetails();
    }
  }, [status, session, activeTab]);

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
                  safeSetLocalStorage("redditLinks", updated);
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

  // We no longer auto-check Reddit connection on focus/tab changes.
  // Connection is now explicitly (re)established via the sidebar "Reconnect Reddit" button.

  // Load analytics posts from MongoDB (only on initial load)
  useEffect(() => {
    if (!session?.user) return;
    // Only fetch once on initial load (prevent refresh when re-entering page)
    if (analyticsFetchedRef.current) return;

    const fetchAnalyticsPosts = async () => {
      setIsLoadingAnalytics(true);
      try {
        const response = await fetch("/api/posts");
        if (response.status === 401) {
          setAnalyticsPosts([]);
          setIsLoadingAnalytics(false);
          analyticsFetchedRef.current = true;
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
        analyticsFetchedRef.current = true;
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

      // Use database values instead of input values
      const dbLink = productDetailsFromDb?.link || website;
      const dbProductDescription = productDetailsFromDb?.productDescription;
      const productIdeaToUse = dbProductDescription || ideaToUse;
      
      if (!productIdeaToUse || !dbLink) {
        if (showAlerts) {
          setToast({
            visible: true,
            message: "Please enter your product details in the Product tab first.",
            variant: "error",
          });
          // Redirect to Product tab
          setActiveTab("product");
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
            productIdea: productIdeaToUse, // Use database productDescription
            productLink: dbLink, // Use database link
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
    [currentProductIdea, submittedProductIdea, website, productDetailsFromDb]
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

  // Reset to page 1 when distinctLinks changes significantly (new search results)
  useEffect(() => {
    if (distinctLinks.length > 0) {
      // Only reset if we're on a page that no longer exists
      const maxPage = Math.ceil(distinctLinks.length / DISCOVERY_ITEMS_PER_PAGE);
      if (discoveryPage > maxPage && maxPage > 0) {
        setDiscoveryPage(1);
      }
    }
  }, [distinctLinks.length, discoveryPage]);

  // Paginated links for discovery table
  const paginatedLinks = useMemo(() => {
    const startIndex = (discoveryPage - 1) * DISCOVERY_ITEMS_PER_PAGE;
    const endIndex = startIndex + DISCOVERY_ITEMS_PER_PAGE;
    return distinctLinks.slice(startIndex, endIndex);
  }, [distinctLinks, discoveryPage]);

  const totalDiscoveryPages = Math.ceil(distinctLinks.length / DISCOVERY_ITEMS_PER_PAGE);

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

    // Create a stable key from all link URLs to track if we've already processed this set
    const linksKey = distinctLinks
      .map((link) => link.link || "")
      .filter(Boolean)
      .sort()
      .join("|");

    // Skip if this is the same set of links we've already processed
    if (previousLinksKeyRef.current === linksKey) {
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

    // Mark this set of links as processed
    previousLinksKeyRef.current = linksKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinctLinks.length]);

  // Memoize loading states to create stable dependencies
  const hasLoadingLinks = useMemo(() => {
    return Object.values(isLoadingLinks).some(Boolean);
  }, [isLoadingLinks]);

  const hasLoadingPostContent = useMemo(() => {
    return Object.values(isLoadingPostContent).some(Boolean);
  }, [isLoadingPostContent]);

  // Generate new comments when product idea is submitted (only if auto-generate is enabled)
  // Wait until all posts are loaded and their content is fetched before generating comments
  useEffect(() => {
    if (!autoGenerateComments) {
      return;
    }

    // Use database values if available
    const dbLink = productDetailsFromDb?.link || website;
    const dbProductDescription = productDetailsFromDb?.productDescription;
    const productIdeaToCheck = dbProductDescription || submittedProductIdea;
    
    if (!productIdeaToCheck || !dbLink) {
      return;
    }

    if (distinctLinks.length === 0) {
      return;
    }

    // Check if any posts are still loading
    if (hasLoadingLinks) {
      return; // Wait for all posts to be fetched
    }

    // Check if any post content is still loading
    if (hasLoadingPostContent) {
      return; // Wait for all post content to be loaded
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
  }, [distinctLinks.length, submittedProductIdea, website, productDetailsFromDb, generateCommentForLink, autoGenerateComments, hasLoadingLinks, hasLoadingPostContent]);

  useEffect(() => {
    if (selectedAnalyticsPost) {
      setDrawerComment(selectedAnalyticsPost.comment || selectedAnalyticsPost.notes || "");
    }
  }, [selectedAnalyticsPost]);

  // Handle checkout success
  useEffect(() => {
    const checkout = searchParams?.get("checkout");
    if (checkout === "success") {
      setShowCheckoutSuccessModal(true);
      // Refresh usage immediately to get updated plan from database
      refreshUsage();
      // Reload page after a short delay to refresh session with updated plan
      // This ensures the session callback fetches the latest plan from MongoDB
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("checkout");
      const newQuery = params.toString();
      router.replace(`${pathname}${newQuery ? `?${newQuery}` : ""}`, { scroll: false });
    }
  }, [searchParams, router, pathname, refreshUsage]);

  // Handle tab query parameter to set active tab
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam && ["product", "dashboard", "analytics", "feedback", "pricing"].includes(tabParam)) {
      setActiveTab(tabParam as "product" | "dashboard" | "analytics" | "feedback" | "pricing");
      // Clean up the tab parameter from URL after setting it
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      const newQuery = params.toString();
      router.replace(`${pathname}${newQuery ? `?${newQuery}` : ""}`, { scroll: false });
    }
  }, [searchParams, router, pathname, setActiveTab]);

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

    // Check if user has product details saved before proceeding and use database values
    let dbLink: string | undefined;
    let dbProductDescription: string | undefined;
    
    if (status === "authenticated" && session?.user?.email) {
      try {
        // Use cached product details if available, otherwise fetch
        if (productDetailsFromDb) {
          dbLink = productDetailsFromDb.link;
          dbProductDescription = productDetailsFromDb.productDescription;
        } else {
          const productDetailsResponse = await fetch("/api/user/product-details");
          if (productDetailsResponse.ok) {
            const productData = await productDetailsResponse.json();
            if (productData.success && productData.productDetails) {
              dbLink = productData.productDetails.link;
              dbProductDescription = productData.productDetails.productDescription;
              setProductDetailsFromDb(productData.productDetails);
            }
          } else if (productDetailsResponse.status === 401) {
            router.push("/");
            return;
          }
        }
        
        // Check if both link and productDescription are missing or empty
        if ((!dbLink || !dbLink.trim()) || (!dbProductDescription || !dbProductDescription.trim())) {
          setActiveTab("product");
          setToast({
            visible: true,
            message: "Please enter your product website and description before searching for Reddit posts.",
            variant: "error",
          });
          return;
        }
      } catch (error) {
        console.error("Error checking product details:", error);
        // On error, still allow submission (don't block user)
      }
    }

    // Use productDescription from database instead of message input
    const productIdeaToUse = dbProductDescription || message.trim();
    
    // Store the current product idea (use database description if available)
    setCurrentProductIdea(productIdeaToUse);
    setSubmittedProductIdea(productIdeaToUse);

    setIsLoading(true);
    setError(null);
    setResults([]);
    setDiscoveryPage(1); // Reset to first page when new search starts

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
          productIdea: productIdeaToUse, // Use database productDescription
          postCount: postCount, // Use the actual postCount from state
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Check if this is a limit error - show upgrade modal instead of error
        if (errorData.limitReached || (errorData.error && errorData.error.toLowerCase().includes("limit"))) {
          setUpgradeModalContext({
            limitReached: true,
            remaining: errorData.remaining || 0
          });
          setTimeout(() => {
            setShowUpgradeModal(true);
          }, 500);
          setIsLoading(false);
          return; // Don't throw error, just show modal
        }
        throw new Error(errorData.error || "Failed to generate queries");
      }

      const data = await response.json();
      
      if (data.error) {
        // Check if this is a limit error - show upgrade modal instead of error
        if (data.limitReached || data.error.toLowerCase().includes("limit")) {
          setUpgradeModalContext({
            limitReached: true,
            remaining: data.remaining || 0
          });
          setTimeout(() => {
            setShowUpgradeModal(true);
          }, 500);
          setIsLoading(false);
          return; // Don't throw error, just show modal
        }
        throw new Error(data.error);
      }

      if (data.result && Array.isArray(data.result)) {
        console.log("Generated queries:", data.result);
        setResults(data.result);
        
        // Save queries to localStorage
        localStorage.setItem("savedQueries", JSON.stringify(data.result));
        
        // Store usage info for showing upgrade modal later
        if (data.partialFulfillment || (data.remaining !== undefined && data.remaining <= 10)) {
          setUpgradeModalContext({
            limitReached: data.remaining === 0,
            remaining: data.remaining
          });
        }
        
        // Fetch Reddit links for each query in parallel
        // Each query will fetch top 7 results for better coverage (some may be filtered)
        const RESULTS_PER_QUERY = 7;
        const linkPromises = data.result.map((query: string) => {
          return fetchRedditLinks(query, RESULTS_PER_QUERY);
        });
        
        // Wait for all links to be fetched, then batch fetch all post content together
        Promise.all(linkPromises).then(() => {
          // Small delay to ensure all links are saved to localStorage and state is updated
          setTimeout(() => {
            batchFetchAllPostContent();
            // Show upgrade modal after posts are fetched if we hit the limit or are close
            if (upgradeModalContext) {
              setTimeout(() => {
                setShowUpgradeModal(true);
              }, 500);
            }
          }, 1000);
        });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate queries";
      // Check if this is a limit error - show upgrade modal instead of error
      if (errorMessage.toLowerCase().includes("limit") || errorMessage.toLowerCase().includes("weekly")) {
        setUpgradeModalContext({
          limitReached: true,
          remaining: 0
        });
        setTimeout(() => {
          setShowUpgradeModal(true);
        }, 500);
      } else {
      console.error("Error in query generation:", err);
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRedditLinks = async (query: string, resultsPerQuery: number = 7) => {
    setIsLoadingLinks((prev) => ({ ...prev, [query]: true }));
    
    try {
      const response = await fetch("/api/google/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchQuery: query,
          resultsPerQuery: resultsPerQuery, // Pass resultsPerQuery instead of full postCount
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

            const usageData = await usageResponse.json().catch(() => ({}));
            
            // Always refresh usage counter regardless of response
            refreshUsage();

            if (!usageResponse.ok) {
              // If limit reached, show upgrade modal instead of throwing error
              if (usageData.error && usageData.error.includes("limit")) {
                setUpgradeModalContext({ limitReached: true, remaining: 0 });
                setTimeout(() => {
                  setShowUpgradeModal(true);
                }, 500);
              } else {
                throw new Error(usageData.error || "Weekly usage limit reached. Please try again later.");
              }
            } else {
              // Check if we're close to or at the limit after increment
              if (usageData.currentCount !== undefined) {
                const maxPerWeek = usageData.plan === "premium" ? 2500 : 200;
                const remaining = Math.max(0, maxPerWeek - usageData.currentCount);
                
                // Show upgrade modal if limit reached or close to limit
                if (usageData.limitReached || remaining <= 10) {
                  setUpgradeModalContext({ 
                    limitReached: usageData.limitReached || remaining === 0, 
                    remaining 
                  });
                  setTimeout(() => {
                    setShowUpgradeModal(true);
                  }, 500);
                }
                
                // If partial fulfillment occurred, log it
                if (usageData.actualIncrement !== undefined && usageData.actualIncrement < usageData.requestedCount) {
                  console.log(`Partial fulfillment: requested ${usageData.requestedCount}, got ${usageData.actualIncrement} due to limit`);
                }
              }
            }
          } catch (usageError) {
            console.error("Error updating usage after fetching posts:", usageError);
            // Still refresh usage even if there was an error
            refreshUsage();
            // Only show error if it's not a limit error (limit errors are handled with modal)
            if (!(usageError instanceof Error && usageError.message.includes("limit"))) {
              setError(usageError instanceof Error ? usageError.message : "Failed to update usage. Please try again later.");
              return;
            }
          }
        }

        setRedditLinks((prev) => {
          const updated = {
            ...prev,
            [query]: data.results,
          };
          // Save to localStorage (only minimal data)
          safeSetLocalStorage("redditLinks", updated);
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
        safeSetLocalStorage("redditLinks", updated);
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
              "User-Agent"  : "comment-tool/0.1 by isaaclhy13",
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
            
            safeSetLocalStorage("redditLinks", updated);
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
                safeSetLocalStorage("redditLinks", updated);
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
            
            // Save to localStorage (only minimal data)
            safeSetLocalStorage("redditLinks", updated);
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
        safeSetLocalStorage("redditLinks", updated);
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

  const handleBulkPostAll = async () => {
    setIsBulkPosting(true);
    try {
      // Only post comments for posts that currently have a non-empty comment
      const itemsToPost = distinctLinks.filter((item) => {
        const comment = postTextareas[item.uniqueKey];
        return comment && comment.trim().length > 0;
      });

      for (const item of itemsToPost) {
        // Sequentially post each comment using the existing handler
        // eslint-disable-next-line no-await-in-loop
        await handlePostClick(item);
      }

      setIsBulkPostModalOpen(false);
    } finally {
      setIsBulkPosting(false);
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
        safeSetLocalStorage("redditLinks", updated);
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

  const handleRemoveAllPosts = async () => {
    // First, record all currently visible posts as skipped in analytics
    try {
      const itemsToSkip = distinctLinks;

      await Promise.all(
        itemsToSkip.map(async (linkItem) => {
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
            console.error("Error saving skipped post to database (bulk remove):", dbError);
          }
        })
      );

      // Refresh analytics so they appear under the Skipped tab
      await refreshAnalytics();
    } catch (error) {
      console.error("Error bulk-skipping posts during remove-all:", error);
    }

    // Then clear all local state and cached posts/comments
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
      case "product":
        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-2"
            )}>
              {/* Fixed header with title */}
              <div className={cn(
                "sticky top-0 z-10 bg-background pb-2",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">
                    Product
                  </h3>
                </div>
              </div>
              
              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="product-website" className="block text-sm font-medium text-foreground mb-1">
                        Product Website
                      </label>
                      <Input
                        id="product-website"
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full max-w-md"
                      />
                    </div>
                    <div>
                      <label htmlFor="product-description" className="block text-sm font-medium text-foreground mb-1">
                        Product Description
                      </label>
                      <div className="relative w-full max-w-md rounded-md border border-input focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
                        <textarea
                          id="product-description"
                          value={productDescription}
                          onChange={(e) => setProductDescription(e.target.value)}
                          placeholder={isGeneratingProductDescription ? "Generating product description..." : "Describe your product and what it does..."}
                          disabled={isGeneratingProductDescription}
                          className="w-full min-h-[150px] rounded-md border-0 bg-background px-3 py-2 pb-12 text-sm placeholder:text-muted-foreground focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                          rows={6}
                        />
                        {isGeneratingProductDescription && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Generating...</span>
                            </div>
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          className="absolute bottom-2 right-2 bg-black text-white hover:bg-black/90 text-xs h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isGeneratingProductDescription || !website || !website.trim()}
                          onClick={async () => {
                            if (!website || !website.trim()) {
                              showToast("Please enter a website first", { variant: "error" });
                              return;
                            }
                            
                            setIsGeneratingProductDescription(true);
                            try {
                              const response = await fetch("/api/openai/product", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  website: website,
                                }),
                              });

                              if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.error || "Failed to generate product description");
                              }

                              const data = await response.json();
                              if (data.success && data.description) {
                                setProductDescription(data.description);
                                showToast("Product description generated successfully!", { variant: "success" });
                              } else {
                                throw new Error("No description received from API");
                              }
                            } catch (error) {
                              console.error("Error generating product description:", error);
                              showToast(error instanceof Error ? error.message : "Failed to generate product description", { variant: "error" });
                            } finally {
                              setIsGeneratingProductDescription(false);
                            }
                          }}
                        >
                          {isGeneratingProductDescription ? "Generating..." : "AI generate"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Button
                      onClick={async () => {
                        setIsSavingProductDetails(true);
                        try {
                          const response = await fetch("/api/user/product-details", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              link: website || undefined,
                              productDescription: productDescription || undefined,
                            }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || "Failed to save product details");
                          }

                          const data = await response.json();
                          if (data.success) {
                            // Show success toast (auto-dismisses after 5 seconds)
                            showToast("Product details saved successfully!", { variant: "success" });
                          }
                        } catch (error) {
                          console.error("Error saving product details:", error);
                          showToast(error instanceof Error ? error.message : "Failed to save product details", { variant: "error" });
                        } finally {
                          setIsSavingProductDetails(false);
                        }
                      }}
                      disabled={isSavingProductDetails || isLoadingProductDetails}
                      className="bg-black text-white hover:bg-black/90 disabled:opacity-50"
                    >
                      {isSavingProductDetails ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case "analytics":
        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-2"
            )}>
              {/* Fixed header with title and filter buttons */}
              <div className={cn(
                "sticky top-0 z-10 bg-background pb-2",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">
                    Analytics
                  </h3>
                  <div className="flex gap-2 self-start sm:self-auto">
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
                </div>
              </div>
              
              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                {isLoadingAnalytics ? (
                  <div className="flex items-center justify-center flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <p className="text-muted-foreground">Loading analytics...</p>
                    </div>
                  </div>
                ) : filteredAnalyticsPosts.length === 0 ? (
                  <div className="flex items-center justify-center flex-1">
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
                    const totalItems = filteredAnalyticsPosts.length;
                    const totalPages = Math.max(1, Math.ceil(totalItems / ANALYTICS_ITEMS_PER_PAGE));
                    const currentPage = Math.min(analyticsPage, totalPages);
                    const startIdx = (currentPage - 1) * ANALYTICS_ITEMS_PER_PAGE;
                    const endIdx = startIdx + ANALYTICS_ITEMS_PER_PAGE;
                    const pageItems = filteredAnalyticsPosts.slice(startIdx, endIdx);

                    return (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 flex flex-col rounded-lg border border-border overflow-hidden">
                          <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
                            <table className="w-full border-collapse">
                      <thead className="sticky top-0 z-20">
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Status</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Title</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Query</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Last Updated</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Post</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                              {pageItems.map((post) => (
                                <tr
                                  key={post.id || post.uniqueKey}
                                  className="cursor-pointer transition hover:bg-muted/40"
                                  onClick={() => openAnalyticsDrawer(post)}
                                >
                                  <td className="py-3 px-2">
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
                                  <td className="max-w-sm py-3 px-2 text-sm font-medium text-foreground">
                                    <div className="truncate" title={post.title || "Untitled post"}>
                                      {post.title || "Untitled post"}
                              </div>
                            </td>
                                  <td className="max-w-xs py-3 px-2 text-sm text-muted-foreground">
                                    <div className="line-clamp-2">{post.query}</div>
                            </td>
                                  <td className="py-3 px-2 text-sm text-muted-foreground">
                                    {new Date(post.postedAt).toLocaleDateString()}
                                  </td>
                                  <td className="py-3 px-2">
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
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-card">
                            <div className="text-xs text-muted-foreground">
                              Showing {startIdx + 1} to {Math.min(endIdx, totalItems)} of {totalItems} posts
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAnalyticsPage((prev) => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="text-xs h-7 px-2"
                              >
                                <ChevronLeft className="h-3 w-3" />
                                <span className="hidden sm:inline">Previous</span>
                              </Button>
                              <div className="text-xs text-foreground px-1">
                                Page {currentPage} of {totalPages}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAnalyticsPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="text-xs h-7 px-2"
                              >
                                <span className="hidden sm:inline">Next</span>
                                <ChevronRight className="h-3 w-3" />
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
          </div>
        );
      case "dashboard":
        // Show Reddit connection prompt if not connected
        if (isRedditConnected === false) {
          return (
            <div className="flex h-full flex-col items-center justify-center p-6">
              <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 text-center">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground">Connect Your Reddit Account</h2>
                  <p className="text-sm text-muted-foreground">
                    To get started, you need to connect your Reddit account. This allows us to fetch Reddit posts and post comments on your behalf.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    window.location.href = "/api/reddit/auth";
                  }}
                  className="w-full"
                >
                  Connect Reddit Account
                </Button>
                <p className="text-xs text-muted-foreground">
                  You'll be redirected to Reddit to authorize the connection
                </p>
              </div>
            </div>
          );
        }
        
        // Show loading state while checking connection
        if (isRedditConnected === null && status === "authenticated") {
          return (
            <div className="flex h-full flex-col items-center justify-center p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking Reddit connection...</span>
              </div>
            </div>
          );
        }

        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-14"
            )}>
              {/* Fixed header with title and buttons */}
              {!isLoading && (
                <div className={cn(
                  "sticky top-0 z-10 bg-background px-6 pt-6 pb-2",
                  !sidebarOpen && "pl-14"
                )}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold">
                      Reddit Posts
                    </h3>
                    <div className="flex gap-2 self-start sm:self-auto">
                      {results.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsBulkPostModalOpen(true)}
                          disabled={
                            distinctLinksCount === 0 ||
                            distinctLinks.every(
                              (item) =>
                                !postTextareas[item.uniqueKey] ||
                                !postTextareas[item.uniqueKey].trim()
                            )
                          }
                        >
                          Post all comments
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          // Use database productDescription as the message
                          if (productDetailsFromDb?.productDescription) {
                            handleSubmit(productDetailsFromDb.productDescription);
                          }
                        }}
                        disabled={!productDetailsFromDb?.productDescription || isLoading}
                        size="sm"
                        variant={results.length > 0 ? "outline" : "default"}
                      >
                        {isLoading ? "Searching..." : "Search for Reddit Posts"}
                      </Button>
                      {results.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveAllPosts}
                          disabled={
                            distinctLinksCount === 0 &&
                            !Object.values(isLoadingLinks).some(Boolean)
                          }
                        >
                          Remove all posts
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Scrollable content area */}
              <div className={cn(
                "flex-1 overflow-hidden px-6 pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex-1 flex flex-col min-h-0 space-y-6">
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
                  <div className="flex-1 flex flex-col min-h-0 space-y-4">
                    
                    {/* Show loading state if any query is still loading */}
                    {Object.values(isLoadingLinks).some(Boolean) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span>Searching Reddit...</span>
                      </div>
                    )}
                    
                    {/* Display Reddit links in table view */}
                    {distinctLinks.length > 0 ? (
                      <div className="rounded-lg border border-border overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="overflow-x-auto flex-1 overflow-y-auto min-h-0">
                          <table className="w-full border-collapse table-fixed">
                            <thead className="sticky top-0 z-20">
                              <tr className="border-b border-border bg-muted/50">
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[250px]">Title</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[280px]">Content</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[290px]">Comment</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[80px]">Actions</th>
                              </tr>
                            </thead>
                          <tbody>
                            {paginatedLinks.map((linkItem) => {
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
                          
                          return (
                                <tr 
                              key={linkKey}
                                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                  onClick={() => {
                                    setSelectedDiscoveryPost(linkItem);
                                    setIsDiscoveryDrawerVisible(true);
                                  }}
                                >
                                  {/* Title column */}
                                  <td className="py-3 px-2 align-top w-[250px]">
                                    <div className="space-y-1">
                                      <div className="text-sm font-semibold text-foreground">
                                        {link.title}
                                      </div>
                                      {link.postData?.created_utc && (
                                        <div className="text-xs text-muted-foreground">
                                          {formatTimeAgo(link.postData.created_utc)}
                                  </div>
                                )}
                                    </div>
                                  </td>
                                  
                                  {/* Content column */}
                                  <td className="py-3 px-2 align-top w-[280px]">
                                {isLoadingPostContent[link.link || ''] ? (
                                      <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                        <span className="text-xs text-muted-foreground">Loading...</span>
                                  </div>
                                ) : (
                                  (link.selftext || cleanSnippet) && (
                                        <div>
                                      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                                        {link.selftext || cleanSnippet}
                                      </p>
                                    </div>
                                  )
                                )}
                                  </td>
                                  
                                  {/* Comment column */}
                                  <td className="py-3 px-2 align-top w-[290px]">
                                    {isGeneratingComment[linkKey] ? (
                                      <div className="flex min-h-[60px] items-center justify-center rounded-md border border-border bg-background px-2 py-1">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          <span>Generating...</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  value={postTextareas[linkKey] || ""}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const newValue = e.target.value;
                                    // Update ref immediately for instant feedback
                                    postTextareasRef.current = {
                                      ...postTextareasRef.current,
                                      [linkKey]: newValue,
                                    };
                                    // Use startTransition to mark state update as non-urgent
                                    // This prevents blocking the UI during typing
                                    startTransition(() => {
                                    setPostTextareas((prev) => ({
                                      ...prev,
                                        [linkKey]: newValue,
                                      }));
                                    });
                                  }}
                                          placeholder="Add comment..."
                                          className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1 pr-20 text-sm placeholder:text-muted-foreground focus:outline-none resize-y"
                                          rows={2}
                                        />
                                        {!postTextareas[linkKey]?.trim() && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                            className="absolute top-2 right-2 text-xs h-7"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleGenerateComment(linkItem);
                                            }}
                                    disabled={isGeneratingComment[linkKey]}
                                  >
                                            {isGeneratingComment[linkKey] ? "Generating..." : "Generate"}
                                  </Button>
                                        )}
                                </div>
                                    )}
                                  </td>
                                  
                                  {/* Actions column */}
                                  <td className="py-3 px-2 align-top w-[80px]">
                                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      size="sm"
                                      variant="default"
                                        className="text-xs p-2"
                                      onClick={() => handlePostClick(linkItem)}
                                        disabled={isPosting[linkKey]}
                                        title={isPosting[linkKey] ? "Posting..." : "Post comment"}
                                      >
                                        {isPosting[linkKey] ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Send className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs p-2"
                                        onClick={() => handleCloseClick(linkItem)}
                                        title="Close"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  </td>
                                </tr>
                          );
                        })}
                          </tbody>
                        </table>
                        </div>
                        {/* Pagination controls */}
                        {totalDiscoveryPages > 1 && (
                          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-card">
                            <div className="text-xs text-muted-foreground">
                              Showing {(discoveryPage - 1) * DISCOVERY_ITEMS_PER_PAGE + 1} to{" "}
                              {Math.min(discoveryPage * DISCOVERY_ITEMS_PER_PAGE, distinctLinks.length)} of{" "}
                              {distinctLinks.length} posts
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDiscoveryPage((prev) => Math.max(1, prev - 1))}
                                disabled={discoveryPage === 1}
                                className="text-xs h-7 px-2"
                              >
                                <ChevronLeft className="h-3 w-3" />
                                <span className="hidden sm:inline">Previous</span>
                              </Button>
                              <div className="text-xs text-foreground px-1">
                                Page {discoveryPage} of {totalDiscoveryPages}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDiscoveryPage((prev) => Math.min(totalDiscoveryPages, prev + 1))}
                                disabled={discoveryPage === totalDiscoveryPages}
                                className="text-xs h-7 px-2"
                              >
                                <span className="hidden sm:inline">Next</span>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        </div>
                      ) : (
                        !Object.values(isLoadingLinks).some(Boolean) && (
                          <div className="flex items-center justify-center min-h-[400px]">
                            <p className="text-sm text-muted-foreground">
                              No Reddit posts found. Click "Search for Reddit Posts" to get started.
                            </p>
                          </div>
                        )
                    )}
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        );
      case "feedback":
        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-2"
            )}>
              {/* Fixed header with title */}
              <div className={cn(
                "sticky top-0 z-10 bg-background pb-2",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">
                    Feedback
                  </h3>
                </div>
              </div>
              
              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                <div className="space-y-6">
                  {feedbackSubmitted ? (
                    <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-6">
                      <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
                      <h3 className="text-lg font-semibold text-emerald-500 mb-2">Thank you for your feedback!</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        We appreciate you taking the time to share your thoughts with us.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setFeedbackSubmitted(false);
                          setFeedbackMessage("");
                        }}
                      >
                        Submit Another Feedback
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!feedbackMessage.trim() || isSubmittingFeedback) {
                            return;
                          }

                          setIsSubmittingFeedback(true);
                          try {
                            const response = await fetch("/api/feedback", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                message: feedbackMessage.trim(),
                              }),
                            });

                            if (!response.ok) {
                              const errorData = await response.json();
                              throw new Error(errorData.error || "Failed to submit feedback");
                            }

                            setFeedbackSubmitted(true);
                            setFeedbackMessage("");
                          } catch (error) {
                            console.error("Error submitting feedback:", error);
                            alert(error instanceof Error ? error.message : "Failed to submit feedback. Please try again.");
                          } finally {
                            setIsSubmittingFeedback(false);
                          }
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <label htmlFor="feedback-message" className="block text-sm font-medium text-foreground mb-2">
                            Your Message
                          </label>
                          <textarea
                            id="feedback-message"
                            value={feedbackMessage}
                            onChange={(e) => setFeedbackMessage(e.target.value)}
                            placeholder="Tell us what's on your mind..."
                            className="w-full min-h-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 resize-y"
                            rows={10}
                            disabled={isSubmittingFeedback}
                            required
                          />
                        </div>
                        <div className="flex items-center justify-start gap-3">
                          <Button
                            type="submit"
                            disabled={!feedbackMessage.trim() || isSubmittingFeedback}
                          >
                            {isSubmittingFeedback ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Submitting...
                              </>
                            ) : (
                              "Submit Feedback"
                            )}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case "pricing":
        return (
          <div className={cn(
            "flex-1 overflow-y-auto flex items-center justify-center",
            !sidebarOpen && "pl-14 pt-14"
          )}>
            <div className="w-full max-w-5xl px-4 py-6">
              <PricingSection showCTAButtons={true} />
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
      {selectedDiscoveryPost && (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-background/40 backdrop-blur-sm transition-opacity duration-300",
              isDiscoveryDrawerVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setIsDiscoveryDrawerVisible(false)}
          />
          <div
            className={cn(
              "fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-500 ease-out",
              isDiscoveryDrawerVisible ? "translate-x-0" : "translate-x-full opacity-0"
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex flex-col gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedDiscoveryPost.title || "No title"}
                  </h3>
                  {selectedDiscoveryPost.postData?.created_utc && (
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(selectedDiscoveryPost.postData.created_utc)}
                    </p>
                  )}
                </div>
                {selectedDiscoveryPost.link && (
                  <button
                    className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedDiscoveryPost.link) {
                        window.open(selectedDiscoveryPost.link, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Reddit Post
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsDiscoveryDrawerVisible(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex h-full flex-col px-4 py-4">
              <div className="flex-1 space-y-4 overflow-y-auto pr-4 pb-12">
                {(selectedDiscoveryPost.selftext || selectedDiscoveryPost.snippet) && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Post Content</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDiscoveryPost.selftext || selectedDiscoveryPost.snippet}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Generated Comment</h4>
                  <textarea
                    value={postTextareas[selectedDiscoveryPost.uniqueKey] || ""}
                    onChange={(e) => {
                      setPostTextareas((prev) => ({
                        ...prev,
                        [selectedDiscoveryPost.uniqueKey]: e.target.value,
                      }));
                    }}
                    placeholder="Add comment..."
                    className="w-full min-h-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-y"
                  />
                  {!postTextareas[selectedDiscoveryPost.uniqueKey]?.trim() && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => handleGenerateComment(selectedDiscoveryPost)}
                      disabled={isGeneratingComment[selectedDiscoveryPost.uniqueKey]}
                    >
                      {isGeneratingComment[selectedDiscoveryPost.uniqueKey] ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        "Generate Comment"
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="border-t border-border pt-4 mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDiscoveryDrawerVisible(false);
                    handleCloseClick(selectedDiscoveryPost);
                  }}
                  className="flex-1"
                >
                  Skip
                </Button>
                <Button
                  onClick={() => {
                    handlePostClick(selectedDiscoveryPost);
                    setIsDiscoveryDrawerVisible(false);
                  }}
                  disabled={isPosting[selectedDiscoveryPost.uniqueKey] || !postTextareas[selectedDiscoveryPost.uniqueKey]?.trim()}
                  className="flex-1"
                >
                  {isPosting[selectedDiscoveryPost.uniqueKey] ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Posting...
                    </>
                  ) : (
                    "Post Comment"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {isBulkPostModalOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            onClick={() => {
              if (!isBulkPosting) {
                setIsBulkPostModalOpen(false);
              }
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Post all comments
                </h3>
              </div>
              <div className="px-6 py-4 space-y-3 text-sm text-muted-foreground">
                <p>
                  This will post all generated comments for the Reddit posts currently
                  shown on this page. Only posts that already have a comment will be posted.
                </p>
                <p>
                  Comments will be posted one by one to Reddit and saved in your analytics.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => !isBulkPosting && setIsBulkPostModalOpen(false)}
                  disabled={isBulkPosting}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleBulkPostAll}
                  disabled={isBulkPosting}
                >
                  {isBulkPosting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Posting...
                    </>
                  ) : (
                    <>Post all comments</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {showUpgradeModal && upgradeModalContext && (
        <>
          <div
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
            onClick={() => setShowUpgradeModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-foreground">
                    {upgradeModalContext.limitReached 
                      ? "Weekly Limit Reached" 
                      : "Running Low on Posts"}
                  </h3>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-6">
                <div className="space-y-4 mb-6">
                  {upgradeModalContext.limitReached ? (
                    <p className="text-sm text-muted-foreground">
                      You've reached your weekly limit of 200 posts. Upgrade to Premium to get 10,000 posts per month and never worry about limits again.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You have {upgradeModalContext.remaining} posts remaining this week. Upgrade to Premium for 10,000 posts per month and unlock more features.
                    </p>
                  )}
                </div>
                
                <div className="grid gap-6 md:grid-cols-2 mb-6">
                  <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-muted/30 p-6 text-left">
                    <div>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Free
                      </span>
                      <h4 className="mt-3 text-2xl font-semibold text-foreground">$0</h4>
                      <p className="text-sm text-muted-foreground">No credit card required</p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Unlimited reddit post search</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>200 generated comments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Usage analytics</span>
                      </li>
                    </ul>
                    <Button variant="outline" size="sm" disabled className="mt-auto cursor-default">
                      Current Plan
                    </Button>
                  </div>

                  <div className="flex h-full flex-col gap-4 rounded-xl border border-[#ff4500]/60 bg-white p-6 text-left shadow-[0_0_35px_-12px_rgba(255,69,0,0.65)]">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="rounded-full bg-[#ff4500] px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                          Premium
                        </span>
                        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff4500] shadow-[0_0_0_1px_rgba(255,69,0,0.2)]">
                          Popular
                        </span>
                      </div>
                      <h4 className="text-2xl font-semibold text-[#2d1510]">$13.99</h4>
                      <p className="text-sm text-[#72341e]">per month, cancel anytime</p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Unlimited reddit post search</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>10,000 generated comments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Usage analytics</span>
                      </li>
                    </ul>
                    <Button
                      size="sm"
                      onClick={async () => {
                        // Close modal and switch to pricing tab
                        setShowUpgradeModal(false);
                        setActiveTab("pricing");
                      }}
                      className="mt-auto"
                    >
                      Upgrade to Premium
                    </Button>
                  </div>
                </div>
              </div>
              <div className="border-t border-border px-6 py-4 flex items-center justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowUpgradeModal(false)}
                >
                  Maybe Later
                </Button>
              </div>
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

