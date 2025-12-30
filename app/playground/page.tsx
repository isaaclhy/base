"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense, useTransition } from "react";
import { ExternalLink, X, Loader2, CheckCircle2, Send, Trash2, ChevronLeft, ChevronRight, Settings, ChevronDown, Plus, ArrowUp, MessageSquare, CheckSquare, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import PlaygroundLayout, { usePlaygroundTab, usePlaygroundSidebar, useRefreshUsage, useSetPlaygroundTab } from "@/components/playground-layout";
import PricingSection from "@/app/landing-sections/pricing";
import { RedditPost } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { OnboardingModal } from "@/components/onboarding-modal";

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
    // Store full data in redditLinks including postData and selftext
    // This ensures filtered results preserve all content for display after refresh
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
                selftext: link.selftext || null,
                postData: link.postData || null,
                // Store full data to ensure content matches after refresh
              }))
            : links,
        ])
      );
    }
    
    localStorage.setItem(key, JSON.stringify(dataToStore));
  } catch (e: any) {
    if (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014) {
      console.warn(`localStorage quota exceeded for key: ${key}`);
      
      // If it's redditLinks or leadsLinks, try to clear old queries to make space
      if ((key === "redditLinks" || key === "leadsLinks") && onError) {
        onError();
      } else if (key === "redditLinks" || key === "leadsLinks") {
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
  const [productName, setProductName] = useState("");
  const [website, setWebsite] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [originalProductDetails, setOriginalProductDetails] = useState<{
    productName: string;
    website: string;
    productDescription: string;
    keywords: string[];
  } | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [subredditInput, setSubredditInput] = useState("");
  const [subredditSuggestions, setSubredditSuggestions] = useState<Array<{ name: string; displayName: string; subscribers: number }>>([]);
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [showSubredditDropdown, setShowSubredditDropdown] = useState(false);
  const [subredditDropdownPosition, setSubredditDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const subredditInputRef = useRef<HTMLInputElement>(null);
  const subredditDropdownRef = useRef<HTMLDivElement>(null);
  const [callToAction, setCallToAction] = useState("");
  const [persona, setPersona] = useState("");
  const [postCount, setPostCount] = useState<number>(50);
  const [autoGenerateComments, setAutoGenerateComments] = useState<boolean>(false);
  const [previousIdeas, setPreviousIdeas] = useState<string[]>([]);
  const [selectedIdea, setSelectedIdea] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [redditLinks, setRedditLinks] = useState<Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // Flag to prevent showing posts during search
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
  const [isDiscoverySettingsModalOpen, setIsDiscoverySettingsModalOpen] = useState(false);
  const [discoveryPersona, setDiscoveryPersona] = useState<string>("");
  const [isPersonaDropdownOpen, setIsPersonaDropdownOpen] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close persona dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(event.target as Node)) {
        setIsPersonaDropdownOpen(false);
      }
      if (subredditDropdownRef.current && !subredditDropdownRef.current.contains(event.target as Node)) {
        setShowSubredditDropdown(false);
      }
    };

    if (isPersonaDropdownOpen || showSubredditDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPersonaDropdownOpen, showSubredditDropdown]);

  // Update dropdown position based on input position
  const updateSubredditDropdownPosition = useCallback(() => {
    if (subredditInputRef.current) {
      const rect = subredditInputRef.current.getBoundingClientRect();
      setSubredditDropdownPosition({
        top: rect.bottom + window.scrollY + 4, // 4px gap (mt-1)
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  // Fuzzy matching function for subreddits
  const fuzzyMatch = (query: string, text: string): number => {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match gets highest score
    if (textLower === queryLower) return 100;
    if (textLower.startsWith(queryLower)) return 90;
    if (textLower.includes(queryLower)) return 70;
    
    // Character-based fuzzy matching
    let queryIndex = 0;
    let score = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        score += 10;
        queryIndex++;
      }
    }
    
    // Return score based on how many characters matched
    return queryIndex === queryLower.length ? score : 0;
  };

  // Search subreddits with debounce
  useEffect(() => {
    if (!subredditInput.trim() || subredditInput.length < 2) {
      setSubredditSuggestions([]);
      setShowSubredditDropdown(false);
      return;
    }

    const searchSubreddits = async () => {
      setIsLoadingSubreddits(true);
      try {
        const response = await fetch(`/api/reddit/search-subreddits?q=${encodeURIComponent(subredditInput)}`);
        if (!response.ok) {
          if (response.status === 401) {
            const errorData = await response.json();
            showToast(errorData.error || "Please connect your Reddit account", { variant: "error" });
          }
          setSubredditSuggestions([]);
          return;
        }
        const data = await response.json();
        const results = data.subreddits || [];
        
        // Apply fuzzy matching and sort by relevance
        const scored = results.map((sub: { name: string; displayName: string; subscribers: number }) => ({
          ...sub,
          score: fuzzyMatch(subredditInput, sub.name),
        })).filter((item: { score: number }) => item.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .slice(0, 10);
        
        setSubredditSuggestions(scored);
        const shouldShow = scored.length > 0;
        if (shouldShow) {
          // Use setTimeout to ensure DOM is updated
          setTimeout(() => {
            if (subredditInputRef.current) {
              const rect = subredditInputRef.current.getBoundingClientRect();
              setSubredditDropdownPosition({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width,
              });
            }
          }, 0);
        }
        setShowSubredditDropdown(shouldShow);
      } catch (error) {
        console.error("Error searching subreddits:", error);
        setSubredditSuggestions([]);
      } finally {
        setIsLoadingSubreddits(false);
      }
    };

    const debounceTimer = setTimeout(searchSubreddits, 300);
    return () => clearTimeout(debounceTimer);
  }, [subredditInput]);
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
  const [createFilter, setCreateFilter] = useState<"comment" | "post">("comment");
  const [createRedditLink, setCreateRedditLink] = useState("");
  const [createPersona, setCreatePersona] = useState("");
  const [createIntent, setCreateIntent] = useState("");
  const [createGeneratedComment, setCreateGeneratedComment] = useState("");
  const [isGeneratingCreateComment, setIsGeneratingCreateComment] = useState(false);
  const [isPostingCreateComment, setIsPostingCreateComment] = useState(false);
  const [createPostData, setCreatePostData] = useState<RedditPost | null>(null);
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
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [selectedDiscoveryPost, setSelectedDiscoveryPost] = useState<typeof distinctLinks[0] | null>(null);
  const [isDiscoveryDrawerVisible, setIsDiscoveryDrawerVisible] = useState(false);
  const [drawerPersona, setDrawerPersona] = useState<"Founder" | "User">("Founder");
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const DISCOVERY_ITEMS_PER_PAGE = 20;
  const [isSavingProductDetails, setIsSavingProductDetails] = useState(false);
  const [isLoadingProductDetails, setIsLoadingProductDetails] = useState(false);
  const [isGeneratingProductDescription, setIsGeneratingProductDescription] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [productDetailsFromDb, setProductDetailsFromDb] = useState<{ link?: string; productName?: string; productDescription?: string; keywords?: string } | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "premium" | null>(null);
  const [leadsLinks, setLeadsLinks] = useState<Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>>>({});
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [isLoadingLeadsLinks, setIsLoadingLeadsLinks] = useState<Record<string, boolean>>({});
  const distinctLeadsLinksRef = useRef<Array<any>>([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsSortBy, setLeadsSortBy] = useState<"date-desc" | "date-asc" | "upvotes-desc" | "upvotes-asc" | "comments-desc" | "comments-asc" | "title-asc" | "title-desc">("date-desc");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isBulkOperationsModalOpen, setIsBulkOperationsModalOpen] = useState(false);
  const [showNoKeywordsModal, setShowNoKeywordsModal] = useState(false);
  const [bulkPersona, setBulkPersona] = useState<"Founder" | "User">("Founder");
  const [bulkOperationStatus, setBulkOperationStatus] = useState<Record<string, "haven't started" | "generating" | "posting" | "completed" | "error">>({});
  const [bulkGeneratedComments, setBulkGeneratedComments] = useState<Record<string, string>>({});
  const [bulkModalLeads, setBulkModalLeads] = useState<Array<typeof distinctLeadsLinks[number]>>([]);
  const [bulkModalInitialCount, setBulkModalInitialCount] = useState(0);
  const LEADS_ITEMS_PER_PAGE = 20;

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
              // Also set productName, website and productDescription for Product tab
              if (data.productDetails.productName) {
                setProductName(data.productDetails.productName);
              }
              if (data.productDetails.link) {
                setWebsite(data.productDetails.link);
              }
              if (data.productDetails.productDescription) {
                setProductDescription(data.productDetails.productDescription);
              }
              // Load keywords from the keywords field (array) or fallback to productDetails.keywords (legacy)
              let loadedKeywords: string[] = [];
              if (data.keywords && Array.isArray(data.keywords)) {
                loadedKeywords = data.keywords;
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setKeywords((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(loadedKeywords)) {
                    return loadedKeywords;
                  }
                  return prev;
                });
              } else if (data.productDetails?.keywords) {
                // Legacy: If keywords is a string, split by comma; if array, use as is
                loadedKeywords = typeof data.productDetails.keywords === 'string'
                  ? data.productDetails.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k)
                  : Array.isArray(data.productDetails.keywords)
                    ? data.productDetails.keywords
                    : [];
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setKeywords((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(loadedKeywords)) {
                    return loadedKeywords;
                  }
                  return prev;
                });
              }
              
              // Load subreddits from database
              if (data.subreddits && Array.isArray(data.subreddits)) {
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setSubreddits((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(data.subreddits)) {
                    return data.subreddits;
                  }
                  return prev;
                });
              }
              
              // Store original values for dirty checking
              setOriginalProductDetails({
                productName: data.productDetails.productName || "",
                website: data.productDetails.link || "",
                productDescription: data.productDetails.productDescription || "",
                keywords: loadedKeywords,
              });
            } else {
              setProductDetailsFromDb(null);
              setOriginalProductDetails({
                productName: "",
                website: "",
                productDescription: "",
                keywords: [],
              });
            }
          }
        } catch (error) {
          console.error("Error loading product details:", error);
          setProductDetailsFromDb(null);
          setOriginalProductDetails({
            productName: "",
            website: "",
            productDescription: "",
            keywords: [],
          });
        }
      };
      
      loadProductDetails();
    }
  }, [status, session]);

  // Load user plan for premium feature checks
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const loadUserPlan = async () => {
        try {
          const response = await fetch("/api/usage");
          if (response.ok) {
            const data = await response.json();
            const plan = data.plan || session?.user?.plan || "free";
            setUserPlan(plan as "free" | "premium");
          } else {
            // Fallback to session plan
            setUserPlan((session?.user?.plan as "free" | "premium") || "free");
          }
        } catch (error) {
          console.error("Error loading user plan:", error);
          // Fallback to session plan
          setUserPlan((session?.user?.plan as "free" | "premium") || "free");
        }
      };

      loadUserPlan();
    } else {
      setUserPlan(null);
    }
  }, [status, session]);

  // Check onboarding status
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const checkOnboardingStatus = async () => {
        try {
          const response = await fetch("/api/user/onboarding");
          if (response.ok) {
            const data = await response.json();
            const completed = data.onboardingCompleted ?? false;
            setOnboardingCompleted(completed);
            if (!completed) {
              setIsOnboardingModalOpen(true);
            }
          } else {
            // If we can't fetch status, assume not completed (show modal)
            setOnboardingCompleted(false);
            setIsOnboardingModalOpen(true);
          }
        } catch (error) {
          console.error("Error checking onboarding status:", error);
          // On error, assume not completed (show modal)
          setOnboardingCompleted(false);
          setIsOnboardingModalOpen(true);
        }
      };

      checkOnboardingStatus();
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
              if (data.productDetails.productName) {
                setProductName(data.productDetails.productName);
              }
              if (data.productDetails.link) {
                setWebsite(data.productDetails.link);
              }
              if (data.productDetails.productDescription) {
                setProductDescription(data.productDetails.productDescription);
              }
              // Load keywords from the keywords field (array) or fallback to productDetails.keywords (legacy)
              let loadedKeywords: string[] = [];
              if (data.keywords && Array.isArray(data.keywords)) {
                loadedKeywords = data.keywords;
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setKeywords((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(loadedKeywords)) {
                    return loadedKeywords;
                  }
                  return prev;
                });
              } else if (data.productDetails?.keywords) {
                // Legacy: If keywords is a string, split by comma; if array, use as is
                loadedKeywords = typeof data.productDetails.keywords === 'string'
                  ? data.productDetails.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k)
                  : Array.isArray(data.productDetails.keywords)
                    ? data.productDetails.keywords
                    : [];
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setKeywords((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(loadedKeywords)) {
                    return loadedKeywords;
                  }
                  return prev;
                });
              }
              
              // Load subreddits from database
              if (data.subreddits && Array.isArray(data.subreddits)) {
                // Only update if different to prevent unnecessary re-renders and layout shifts
                setSubreddits((prev) => {
                  if (JSON.stringify(prev) !== JSON.stringify(data.subreddits)) {
                    return data.subreddits;
                  }
                  return prev;
                });
              }
              
              // Store original values for dirty checking
              setOriginalProductDetails({
                productName: data.productDetails.productName || "",
                website: data.productDetails.link || "",
                productDescription: data.productDetails.productDescription || "",
                keywords: loadedKeywords,
              });
            } else {
              setOriginalProductDetails({
                productName: "",
                website: "",
                productDescription: "",
                keywords: [],
              });
            }
          }
        } catch (error) {
          console.error("Error loading product details:", error);
          setOriginalProductDetails({
            productName: "",
            website: "",
            productDescription: "",
            keywords: [],
          });
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

  // Close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };

    if (isSortDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSortDropdownOpen]);

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
        // IMPORTANT: Since we now save full data (selftext/postData) to localStorage for filtered posts,
        // we should NOT load from cache if selftext/postData already exists (it would overwrite filtered content)
        // Only load from cache for legacy posts that are missing this data
        setTimeout(() => {
          Object.entries(links).forEach(([query, linkArray]: [string, any]) => {
            if (Array.isArray(linkArray)) {
              // Only try to load from cache if BOTH selftext AND postData are missing (legacy posts)
              // This preserves filtered content that already has selftext/postData saved
              let hasUpdates = false;
              const updatedLinks = linkArray.map((link: any) => {
                // Check if both selftext and postData are missing (null, undefined, or empty string)
                const hasNoSelftext = !link.selftext || link.selftext === null || link.selftext === "";
                const hasNoPostData = !link.postData || link.postData === null;
                
                if (link.link && hasNoSelftext && hasNoPostData) {
                  // Try to get from cache for legacy posts only
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
                // Return link as-is if it already has selftext/postData (filtered posts)
                return link;
              });
              
              // Update state if we found cached posts (only for legacy posts)
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

    // Load saved leads links - only if they belong to the current user
    const savedLeadsLinks = localStorage.getItem("leadsLinks");
    const savedLeadsUserEmail = localStorage.getItem("leadsLinksUserEmail");
    const currentUserEmail = session?.user?.email?.toLowerCase();
    
    if (savedLeadsLinks) {
      // If there's a stored email and it doesn't match the current user, clear the leads data
      if (savedLeadsUserEmail && currentUserEmail && savedLeadsUserEmail !== currentUserEmail) {
        console.log("Clearing leads data from previous user:", savedLeadsUserEmail, "Current user:", currentUserEmail);
        localStorage.removeItem("leadsLinks");
        localStorage.removeItem("leadsLinksUserEmail");
        setLeadsLinks({});
      } else if (!savedLeadsUserEmail && currentUserEmail) {
        // If there's no stored email but we have a current user, clear old data (from before we tracked emails)
        console.log("Clearing leads data from before email tracking was implemented");
        localStorage.removeItem("leadsLinks");
        setLeadsLinks({});
      } else if (savedLeadsUserEmail === currentUserEmail || (!savedLeadsUserEmail && !currentUserEmail)) {
        // Load the data if emails match, or if both are null (not authenticated yet)
        try {
          const leads = JSON.parse(savedLeadsLinks);
          setLeadsLinks(leads);
        } catch (e) {
          console.error("Failed to parse saved leads links:", e);
        }
      }
    }
    
    // Analytics posts will be loaded from MongoDB via useEffect
  }, [session?.user?.email]);

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
      options?: { force?: boolean; showAlerts?: boolean; persona?: string }
    ) => {
      const { force = false, showAlerts = false, persona } = options || {};
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
            persona: persona ? persona.toLowerCase() : "founder", // Convert to lowercase for API
            selftext: linkItem.selftext || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          // Check if this is a usage limit error
          if (errorData.limitReached || (response.status === 403 && errorData.error?.includes("limit"))) {
            // Refresh usage to get latest count
            refreshUsage();
            // Show upgrade modal if limit reached
            setUpgradeModalContext({
              limitReached: true,
              remaining: 0
            });
            setTimeout(() => {
              setShowUpgradeModal(true);
            }, 300);
          }
          throw new Error(errorData.error || "Failed to generate comment");
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Refresh usage after successful comment generation
        refreshUsage();

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
    // If currently searching, return empty array to prevent showing pre-filtered posts
    if (isSearching) {
      return [];
    }
    
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
  }, [redditLinks, analyticsUrlSet, isSearching]);

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

  // Fetch leads based on keywords
  const fetchLeadsForKeyword = async (keyword: string, resultsPerQuery: number = 20) => {
    setIsLoadingLeadsLinks((prev) => ({ ...prev, [keyword]: true }));

    // Create search query: site:reddit.com [keyword]
    const searchQuery = `${keyword}`;

    try {
      const response = await fetch("/api/google/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchQuery: searchQuery,
          resultsPerQuery: resultsPerQuery,
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
        // Log keyword and all results found
        console.log(`[KEYWORD SEARCH] Keyword: "${keyword}" | Results found: ${data.results.length}`);
        console.log(`[KEYWORD RESULTS] Keyword: "${keyword}" | Results:`, data.results);

        // Read current leads state
        let currentLeadsState: Record<string, Array<any>> = {};
        try {
          const saved = localStorage.getItem("leadsLinks");
          if (saved) {
            currentLeadsState = JSON.parse(saved);
          }
        } catch (e) {
          console.error("Error reading from localStorage in fetchLeadsForKeyword:", e);
        }

        // Use functional state update to avoid race conditions when multiple fetches run in parallel
        setLeadsLinks((prev) => {
          // Always use prev (most up-to-date React state) for merging
          // Only fallback to localStorage state if prev is completely empty (shouldn't happen normally)
          const currentState = Object.keys(prev).length > 0 ? prev : currentLeadsState;
          
          // Merge new results with existing results for this keyword, avoiding duplicates
          const existingLinksForKeyword = currentState[keyword] || [];
          const existingLinkUrls = new Set(existingLinksForKeyword.map((link: any) => link.link).filter(Boolean));

          // Only add new links that don't already exist (by URL)
          const newLinks = data.results.filter((link: any) => link.link && !existingLinkUrls.has(link.link));

          // Log each lead with its keyword
          newLinks.forEach((link: any) => {
            console.log(`[LEAD] Keyword: "${keyword}" | Title: "${link.title || 'N/A'}" | URL: ${link.link}`);
          });

          const mergedLinksForKeyword = [...existingLinksForKeyword, ...newLinks];

          const updated = {
            ...currentState,
            [keyword]: mergedLinksForKeyword,
          };

          // Save to localStorage using safe function
          safeSetLocalStorage("leadsLinks", updated);
          // Also save the current user's email to associate leads data with the user
          if (session?.user?.email) {
            try {
              localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
            } catch (e) {
              console.error("Error saving leadsLinksUserEmail:", e);
            }
          }
          // Log summary for this keyword
          console.log(`[LEAD SUMMARY] Keyword: "${keyword}" | Total leads found: ${mergedLinksForKeyword.length} | New leads: ${newLinks.length}`);
          return updated;
        });
      }
    } catch (err) {
      console.error(`Error fetching leads for keyword "${keyword}":`, err);
    } finally {
      setIsLoadingLeadsLinks((prev) => ({ ...prev, [keyword]: false }));
    }
  };

  // Batch fetch post content for leads
  const batchFetchLeadsPostContent = async () => {
    let currentState: Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>> = {};

    try {
      const saved = localStorage.getItem("leadsLinks");
      if (saved) {
        currentState = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading leadsLinks from localStorage:", e);
      currentState = leadsLinks;
    }

    const allPostsNeedingFetch: Array<{ url: string; keyword: string; linkIndex: number; postFullname: string }> = [];

    // Collect all posts that need fetching (excluding cached ones)
    Object.entries(currentState).forEach(([keyword, links]) => {
      links.forEach((link, index) => {
        if (link.link && !link.selftext && !link.postData) {
          // Check cache first
          const cached = getCachedPost(link.link);
          if (cached && (cached.selftext || cached.postData)) {
            // Update from cache
            setLeadsLinks((prev) => {
              const updated = { ...prev };
              if (updated[keyword] && updated[keyword][index]) {
                updated[keyword][index] = {
                  ...updated[keyword][index],
                  selftext: cached.selftext,
                  postData: cached.postData,
                };
              }
              try {
                localStorage.setItem("leadsLinks", JSON.stringify(updated));
                // Also save the current user's email to associate leads data with the user
                if (session?.user?.email) {
                  try {
                    localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
                  } catch (e) {
                    console.error("Error saving leadsLinksUserEmail:", e);
                  }
                }
              } catch (e) {
                console.error("Error saving leadsLinks to localStorage:", e);
              }
              return updated;
            });
            return; // Skip this post, already cached
          }

          const urlMatch = link.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
          if (urlMatch) {
            const [, , postId] = urlMatch;
            const postFullname = `t3_${postId}`;
            allPostsNeedingFetch.push({ url: link.link, keyword, linkIndex: index, postFullname });
            setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [link.link!]: true }));
          }
        }
      });
    });

    if (allPostsNeedingFetch.length === 0) {
      return;
    }

    // Create a map from postFullname to post info for quick lookup
    const postMap = new Map<string, { url: string; keyword: string; linkIndex: number }>();
    allPostsNeedingFetch.forEach(({ url, keyword, linkIndex, postFullname }) => {
      postMap.set(postFullname, { url, keyword, linkIndex });
    });

    // Fetch posts in batches using /api/reddit/post
    const BATCH_SIZE = 25; // Reddit API can handle up to 100, but 25 is safer
    for (let i = 0; i < allPostsNeedingFetch.length; i += BATCH_SIZE) {
      const batch = allPostsNeedingFetch.slice(i, i + BATCH_SIZE);
      const postIds = batch.map(({ postFullname }) => postFullname);

      try {
        // Use batch API endpoint
        const redditResponse = await fetch("/api/reddit/post", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ postIds }),
        });

        if (redditResponse.ok) {
          const redditData = await redditResponse.json();
          
          // Reddit API returns: { data: { children: [{ data: RedditPost }] } }
          const posts = redditData?.data?.children || [];
          
          // Process each post and update state
          posts.forEach((child: { data: RedditPost }) => {
            const post: RedditPost = child.data;
            const postFullname = post.name; // e.g., "t3_abc123"
            const postInfo = postMap.get(postFullname);

            if (postInfo) {
              const { url, keyword, linkIndex } = postInfo;

              // Cache the post
              cachePost(url, { selftext: post.selftext || null, postData: post });

              // Update state
              setLeadsLinks((prev) => {
                const updated = { ...prev };
                if (updated[keyword] && updated[keyword][linkIndex]) {
                  updated[keyword][linkIndex] = {
                    ...updated[keyword][linkIndex],
                    selftext: post.selftext || null,
                    postData: post,
                  };
                }
                safeSetLocalStorage("leadsLinks", updated);
                // Also save the current user's email to associate leads data with the user
                if (session?.user?.email) {
                  try {
                    localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
                  } catch (e) {
                    console.error("Error saving leadsLinksUserEmail:", e);
                  }
                }
                return updated;
              });

              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
            }
          });

          // Mark any posts that weren't returned as failed
          batch.forEach(({ url, postFullname }) => {
            if (!posts.some((child: { data: RedditPost }) => child.data.name === postFullname)) {
              console.warn(`Post ${postFullname} not found in batch response`);
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
            }
          });
        } else {
          // If batch API fails, fall back to individual calls
          console.warn("Batch API failed, falling back to individual calls");
          await Promise.all(
            batch.map(async ({ url, keyword, linkIndex }) => {
              try {
                const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(url)}`);
                if (redditResponse.ok) {
                  const redditData = await redditResponse.json();
                  const post: RedditPost = redditData.post;

                  // Cache the post
                  cachePost(url, { selftext: post.selftext || null, postData: post });

                  // Update state
                  setLeadsLinks((prev) => {
                    const updated = { ...prev };
                    if (updated[keyword] && updated[keyword][linkIndex]) {
                      updated[keyword][linkIndex] = {
                        ...updated[keyword][linkIndex],
                        selftext: post.selftext || null,
                        postData: post,
                      };
                    }
                    safeSetLocalStorage("leadsLinks", updated);
                    // Also save the current user's email to associate leads data with the user
                    if (session?.user?.email) {
                      try {
                        localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
                      } catch (e) {
                        console.error("Error saving leadsLinksUserEmail:", e);
                      }
                    }
                    return updated;
                  });
                }
              } catch (error) {
                console.error(`Error fetching post content for ${url}:`, error);
              } finally {
                setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
              }
            })
          );
        }
      } catch (error) {
        console.error("Error in batch fetch:", error);
        // Fall back to individual calls on error
        await Promise.all(
          batch.map(async ({ url, keyword, linkIndex }) => {
            try {
              const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(url)}`);
              if (redditResponse.ok) {
                const redditData = await redditResponse.json();
                const post: RedditPost = redditData.post;

                cachePost(url, { selftext: post.selftext || null, postData: post });

                setLeadsLinks((prev) => {
                  const updated = { ...prev };
                  if (updated[keyword] && updated[keyword][linkIndex]) {
                    updated[keyword][linkIndex] = {
                      ...updated[keyword][linkIndex],
                      selftext: post.selftext || null,
                      postData: post,
                    };
                  }
                  safeSetLocalStorage("leadsLinks", updated);
                  // Also save the current user's email to associate leads data with the user
                  if (session?.user?.email) {
                    try {
                      localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
                    } catch (e) {
                      console.error("Error saving leadsLinksUserEmail:", e);
                    }
                  }
                  return updated;
                });
              }
            } catch (error) {
              console.error(`Error fetching post content for ${url}:`, error);
            } finally {
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
            }
          })
        );
      }
    }
  };

  // Fetch leads from subreddits for a keyword
  const fetchLeadsFromSubreddits = async (keyword: string, subredditsList: string[]) => {
    if (!subredditsList || subredditsList.length === 0) {
      return;
    }

    const subredditPromises = subredditsList.map(async (subreddit) => {
      try {
        const response = await fetch("/api/reddit/search-posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keyword: keyword,
            subreddit: subreddit,
            limit: 15,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`Error fetching posts from r/${subreddit} for keyword "${keyword}":`, errorData.error);
          return [];
        }

        const data = await response.json();
        if (data.results && Array.isArray(data.results)) {
          console.log(`[SUBREDDIT SEARCH] Keyword: "${keyword}" | Subreddit: r/${subreddit} | Results: ${data.results.length}`);
          
          // Read current leads state
          let currentLeadsState: Record<string, Array<any>> = {};
          try {
            const saved = localStorage.getItem("leadsLinks");
            if (saved) {
              currentLeadsState = JSON.parse(saved);
            }
          } catch (e) {
            console.error("Error reading from localStorage in fetchLeadsFromSubreddits:", e);
          }

          // Create a unique key for subreddit-based leads: "keyword:subreddit"
          const keywordSubredditKey = `${keyword}:${subreddit}`;
          
          // Compute newLinks for return value (using localStorage state - may be slightly stale but acceptable for return value)
          const existingLinksForKey = currentLeadsState[keywordSubredditKey] || [];
          const existingLinkUrls = new Set(existingLinksForKey.map((link: any) => link.link).filter(Boolean));
          const newLinks = data.results.filter((link: any) => link.link && !existingLinkUrls.has(link.link));
          
          // Use functional state update to avoid race conditions when multiple fetches run in parallel
          setLeadsLinks((prev) => {
            // Always use prev (most up-to-date React state) for merging
            // Only fallback to localStorage state if prev is completely empty (shouldn't happen normally)
            const currentState = Object.keys(prev).length > 0 ? prev : currentLeadsState;
            
            const currentExistingLinks = currentState[keywordSubredditKey] || [];
            const currentExistingLinkUrls = new Set(currentExistingLinks.map((link: any) => link.link).filter(Boolean));

            // Only add new links that don't already exist (recompute with latest state)
            const latestNewLinks = data.results.filter((link: any) => link.link && !currentExistingLinkUrls.has(link.link));

            const mergedLinks = [...currentExistingLinks, ...latestNewLinks];

            const updated = {
              ...currentState,
              [keywordSubredditKey]: mergedLinks,
            };

            // Save to localStorage
            safeSetLocalStorage("leadsLinks", updated);
            if (session?.user?.email) {
              try {
                localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
              } catch (e) {
                console.error("Error saving leadsLinksUserEmail:", e);
              }
            }
            // Log summary for this subreddit
            console.log(`[SUBREDDIT SUMMARY] Keyword: "${keyword}" | Subreddit: r/${subreddit} | Total: ${mergedLinks.length} | New: ${latestNewLinks.length}`);
            return updated;
          });
          return newLinks;
        }
        return [];
      } catch (error) {
        console.error(`Error fetching leads from r/${subreddit} for keyword "${keyword}":`, error);
        return [];
      }
    });

    await Promise.all(subredditPromises);
  };

  // Handle leads search
  const handleLeadsSearch = async () => {
    if (!keywords || keywords.length === 0) {
      setShowNoKeywordsModal(true);
      return;
    }

    setIsLoadingLeads(true);
    setLeadsPage(1);

    // Store the current leadsLinks state to prevent count jumping during refresh
    const leadsLinksSnapshot = { ...leadsLinks };

    try {
      // Fetch Reddit links for each keyword via Google Search (existing functionality)
      const googleSearchPromises = keywords.map((keyword) => {
        return fetchLeadsForKeyword(keyword, 20); // Top 20 results per keyword
      });

      // Fetch Reddit links from subreddits for each keyword (new functionality)
      const subredditSearchPromises: Promise<void>[] = [];
      if (subreddits && subreddits.length > 0) {
        keywords.forEach((keyword) => {
          subredditSearchPromises.push(fetchLeadsFromSubreddits(keyword, subreddits));
        });
      }

      // Run both Google search and subreddit search in parallel
      await Promise.all([...googleSearchPromises, ...subredditSearchPromises]);

      // Small delay to ensure all links are saved
      setTimeout(async () => {
        await batchFetchLeadsPostContent();
        setIsLoadingLeads(false);
      }, 500);
    } catch (error) {
      console.error("Error fetching leads:", error);
      setIsLoadingLeads(false);
      showToast("Error fetching leads. Please try again.", { variant: "error" });
    }
  };

  // Compute distinct leads links (similar to distinctLinks)
  // Freeze the count during loading to prevent count jumping
  const distinctLeadsLinks = useMemo(() => {
    // If loading, return previous result to prevent count jumping
    if (isLoadingLeads) {
      return distinctLeadsLinksRef.current;
    }
    
    let globalIndex = 0;
    const allLinksWithKeyword = Object.entries(leadsLinks)
      .reverse()
      .flatMap(([key, links]) => {
        // Extract keyword from key (handles both "keyword" and "keyword:subreddit" formats)
        const keyword = key.includes(':') ? key.split(':')[0] : key;
        const subreddit = key.includes(':') ? key.split(':')[1] : null;
        
        return [...links].reverse().map((link, linkIndex) => {
          const uniqueKey = `leads-${key}-${link.link || "no-link"}-${linkIndex}-${globalIndex}`;
          const item = {
            ...link,
            query: subreddit ? `${keyword} (r/${subreddit})` : keyword,
            keyword: keyword, // Store original keyword for reference
            subreddit: subreddit, // Store subreddit if applicable
            linkIndex,
            uniqueKey,
            order: globalIndex,
          } as typeof link & {
            query: string;
            keyword: string;
            subreddit: string | null;
            linkIndex: number;
            uniqueKey: string;
            order: number;
          };
          globalIndex += 1;
          return item;
        });
      });

    const sortedLinks = [...allLinksWithKeyword].sort((a, b) => {
      if (leadsSortBy === "date-desc" || leadsSortBy === "date-asc") {
        const timeA =
          typeof a.postData?.created_utc === "number"
            ? a.postData.created_utc
            : -Infinity;
        const timeB =
          typeof b.postData?.created_utc === "number"
            ? b.postData.created_utc
            : -Infinity;
        if (timeA !== timeB) {
          return leadsSortBy === "date-desc" ? timeB - timeA : timeA - timeB;
        }
        return a.order - b.order;
      } else if (leadsSortBy === "upvotes-desc" || leadsSortBy === "upvotes-asc") {
        const upvotesA = a.postData?.ups || 0;
        const upvotesB = b.postData?.ups || 0;
        if (upvotesA !== upvotesB) {
          return leadsSortBy === "upvotes-desc" ? upvotesB - upvotesA : upvotesA - upvotesB;
        }
        return a.order - b.order;
      } else if (leadsSortBy === "comments-desc" || leadsSortBy === "comments-asc") {
        const commentsA = a.postData?.num_comments || 0;
        const commentsB = b.postData?.num_comments || 0;
        if (commentsA !== commentsB) {
          return leadsSortBy === "comments-desc" ? commentsB - commentsA : commentsA - commentsB;
        }
        return a.order - b.order;
      } else if (leadsSortBy === "title-asc" || leadsSortBy === "title-desc") {
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        if (titleA !== titleB) {
          return leadsSortBy === "title-asc" 
            ? titleA.localeCompare(titleB)
            : titleB.localeCompare(titleA);
        }
        return a.order - b.order;
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

      // Log which keyword this lead came from when adding to results
      console.log(`[LEAD DISPLAY] Keyword: "${linkItem.query}" | Title: "${linkItem.title || 'N/A'}" | URL: ${linkItem.link}`);

      results.push(linkItem);
    }

    // Store the result in ref for use during loading
    distinctLeadsLinksRef.current = results;
    return results;
  }, [leadsLinks, analyticsUrlSet, leadsSortBy, isLoadingLeads]);

  // Paginated leads links
  const paginatedLeadsLinks = useMemo(() => {
    const startIndex = (leadsPage - 1) * LEADS_ITEMS_PER_PAGE;
    const endIndex = startIndex + LEADS_ITEMS_PER_PAGE;
    return distinctLeadsLinks.slice(startIndex, endIndex);
  }, [distinctLeadsLinks, leadsPage]);

  const totalLeadsPages = Math.ceil(distinctLeadsLinks.length / LEADS_ITEMS_PER_PAGE);

  // Reset to page 1 when distinctLeadsLinks changes
  useEffect(() => {
    if (distinctLeadsLinks.length > 0) {
      const maxPage = Math.ceil(distinctLeadsLinks.length / LEADS_ITEMS_PER_PAGE);
      if (leadsPage > maxPage && maxPage > 0) {
        setLeadsPage(1);
      }
    }
  }, [distinctLeadsLinks.length, leadsPage]);

  // Log selfText of first 50 posts
  useEffect(() => {
    const first50SelfTexts = distinctLinks.slice(0, 50).map(link => link.selftext || null);
    console.log("First 50 posts selfText array:", first50SelfTexts);
  }, [distinctLinks]);

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

  // Filter posts using the filter API
  // Returns { success: boolean, finalPostCount: number } - finalPostCount is the number of posts that will be displayed after filtering
  const filterPosts = async (productIdea: string): Promise<{ success: boolean; finalPostCount: number }> => {
    console.log("INSIDEFILTER POST")
    console.log("productIdea:", productIdea);
    if (!productIdea || !productIdea.trim()) {
      console.log("No product idea provided, skipping filter");
      return { success: false, finalPostCount: 0 };
    }

    try {
      // Read from localStorage to get the latest data (even when deferring, we save to localStorage temporarily)
      // This ensures we have the most up-to-date data after batchFetchAllPostContent
      let currentLinks: Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>> = {};
      
      try {
        const saved = localStorage.getItem("redditLinks");
        if (saved) {
          currentLinks = JSON.parse(saved);
        } else {
          // Fallback to state if localStorage is empty
          currentLinks = redditLinks;
        }
      } catch (e) {
        console.error("Error reading redditLinks from localStorage for filtering:", e);
        // Fallback to state
        currentLinks = redditLinks;
      }
      
      const postCount = Object.values(currentLinks).reduce((total, links) => total + links.length, 0);
      console.log("filterPosts: Found", postCount, "posts in", Object.keys(currentLinks).length, "queries");
      
      const allPosts: Array<{ query: string; linkIndex: number; selftext: string | null; title: string | null }> = [];
      
      // Collect all posts with their selftext and title
      Object.entries(currentLinks).forEach(([query, links]) => {
        links.forEach((link, index) => {
          allPosts.push({
            query,
            linkIndex: index,
            selftext: link.selftext || null,
            title: link.title || link.postData?.title || null,
          });
        });
      });

      console.log("filterPosts: Collected", allPosts.length, "total posts from", Object.keys(currentLinks).length, "queries");

      // Filter ALL posts in batches of 50
      const postsToFilter = allPosts;
      const BATCH_SIZE = 50;
      const batches: Array<Array<typeof allPosts[0]>> = [];
      
      // Split posts into batches of 50
      for (let i = 0; i < postsToFilter.length; i += BATCH_SIZE) {
        batches.push(postsToFilter.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`filterPosts: Split ${postsToFilter.length} posts into ${batches.length} batches of up to ${BATCH_SIZE} posts`);

      if (postsToFilter.length === 0) {
        console.log("No posts to filter");
        return { success: false, finalPostCount: 0 };
      }

      // Process each batch and collect all filter results
      const allFilterResults: boolean[] = [];
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        // Extract content for this batch
        const selftexts = batch.map(post => {
          const selftext = post.selftext || "";
          // If selftext is empty or "[deleted]", use title instead
          if (!selftext.trim() || selftext.trim().toLowerCase() === "[deleted]") {
            return post.title || "";
          }
          return selftext;
        });

        if (selftexts.length === 0) {
          console.log(`Batch ${batchIndex + 1} has no content to filter, skipping`);
          continue;
        }

        console.log(`Filter API - Calling filter API for batch ${batchIndex + 1}/${batches.length} with ${selftexts.length} posts`);
        
        // Call filter API for this batch
        const filterResponse = await fetch("/api/reddit/filter", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productidea: productIdea,
            content: selftexts, // Array of selftext strings only
          }),
        });

        if (!filterResponse.ok) {
          const errorData = await filterResponse.json();
          console.error(`Filter API error for batch ${batchIndex + 1}:`, errorData.error || "Failed to filter posts");
          // If a batch fails, treat all posts in that batch as filtered out (false)
          allFilterResults.push(...new Array(batch.length).fill(false));
          continue;
        }

        const filterData = await filterResponse.json();
        
        // Extract the boolean array from the response
        let batchFilterResults: boolean[] = [];
        
        if (filterData.success && filterData.output_text) {
          const outputText = filterData.output_text;
          if (typeof outputText === 'string') {
            // Parse the string response - might be JSON or newline-separated
            try {
              const parsed = JSON.parse(outputText);
              if (Array.isArray(parsed)) {
                batchFilterResults = parsed.map((val: any) => val === true || val === "true" || val === 1);
              } else {
                console.error(`Filter response for batch ${batchIndex + 1} is not an array:`, parsed);
                batchFilterResults = new Array(batch.length).fill(false);
              }
            } catch {
              // If not JSON, try splitting by newlines
              const lines = outputText.split('\n').filter(line => line.trim());
              batchFilterResults = lines.map(line => {
                const trimmed = line.trim().toLowerCase();
                return trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
              });
            }
          } else if (Array.isArray(outputText)) {
            batchFilterResults = outputText.map((val: any) => val === true || val === "true" || val === 1);
          } else {
            console.error(`Unexpected filter response format for batch ${batchIndex + 1}:`, filterData);
            batchFilterResults = new Array(batch.length).fill(false);
          }
        } else {
          console.error(`Invalid filter response for batch ${batchIndex + 1}:`, filterData);
          batchFilterResults = new Array(batch.length).fill(false);
        }

        if (batchFilterResults.length !== batch.length) {
          console.error(`Filter results length (${batchFilterResults.length}) doesn't match batch length (${batch.length}) for batch ${batchIndex + 1}`);
          console.error(`Batch filter results:`, batchFilterResults);
          console.error(`Batch selftexts sent:`, selftexts);
          
          // If we got fewer results than expected, pad with false values
          // If we got more results than expected, truncate to match batch length
          if (batchFilterResults.length < batch.length) {
            console.warn(`Padding ${batch.length - batchFilterResults.length} missing results with false`);
            batchFilterResults = [...batchFilterResults, ...new Array(batch.length - batchFilterResults.length).fill(false)];
          } else if (batchFilterResults.length > batch.length) {
            console.warn(`Truncating ${batchFilterResults.length - batch.length} extra results`);
            batchFilterResults = batchFilterResults.slice(0, batch.length);
          }
        }

        // Add this batch's results to the combined results
        allFilterResults.push(...batchFilterResults);
        
        console.log(`Batch ${batchIndex + 1}/${batches.length} completed: ${batchFilterResults.filter(r => r === true).length}/${batch.length} posts passed filter`);
      }

      // Now we have all filter results combined
      const filterResults = allFilterResults;

      if (filterResults.length !== postsToFilter.length) {
        console.error(`Combined filter results length (${filterResults.length}) doesn't match total posts length (${postsToFilter.length})`);
        return { success: false, finalPostCount: 0 };
      }

      console.log("Filter API - Combined filterResults summary:", {
        total: filterResults.length,
        true: filterResults.filter(r => r === true).length,
        false: filterResults.filter(r => r === false).length,
        batches: batches.length
      });

      // Filter posts - keep only those where filterResults[index] is true
      // Count posts that passed the filter
      const keptPosts = filterResults.filter(result => result === true).length;
      
      // Final count = posts that passed the filter (all posts are now filtered)
      const finalPostCount = keptPosts;

      // Start with the current links we read (not from prev state which might be stale)
      // Deep copy to ensure we preserve all nested data (selftext, postData, etc.)
      const updated: typeof currentLinks = {};
      Object.keys(currentLinks).forEach(query => {
        updated[query] = currentLinks[query].map(link => {
          // Explicitly preserve all properties including selftext and postData
          // This ensures filtered posts retain the full content (selftext) instead of just snippet
          const preservedLink = {
            ...link,
            // Explicitly preserve selftext (even if null/undefined) - this is the full post content
            selftext: link.selftext !== undefined ? link.selftext : null,
            // Preserve postData which contains the full Reddit post data
            postData: link.postData !== undefined ? link.postData : null,
            // Preserve other fields
            title: link.title,
            link: link.link,
            snippet: link.snippet,
          };
          
          // Log if selftext is missing (for debugging)
          if (!preservedLink.selftext && preservedLink.link) {
            console.warn(`[filterPosts] Post ${preservedLink.link} is missing selftext, will fall back to snippet`);
          }
          
          return preservedLink;
        });
      });
      
      let removedCount = 0;

      // Process in reverse order to maintain correct indices
      for (let i = postsToFilter.length - 1; i >= 0; i--) {
        const post = postsToFilter[i];
        if (!filterResults[i]) {
          // Remove this post
          if (updated[post.query] && updated[post.query][post.linkIndex]) {
            updated[post.query].splice(post.linkIndex, 1);
            removedCount++;
          }
        }
      }

      // Remove empty query arrays
      Object.keys(updated).forEach(query => {
        if (updated[query].length === 0) {
          delete updated[query];
        }
      });

        // Count the actual final number of posts that will be displayed
        const actualFinalCount = Object.values(updated).reduce((total, links) => total + links.length, 0);
        console.log(`Filtered ${removedCount} posts, kept ${keptPosts} out of ${allPosts.length} total posts, calculated final count: ${finalPostCount}, actual final count: ${actualFinalCount}`);
      
      // Update localStorage with filtered results (but NOT state yet - will update after usage)
      // This ensures posts only appear after all batches complete and usage is updated
      // safeSetLocalStorage will preserve selftext and postData
      safeSetLocalStorage("redditLinks", updated);
      
      // Verify that selftext is preserved in the saved data
      const savedAfterFilter = localStorage.getItem("redditLinks");
      if (savedAfterFilter) {
        try {
          const verifyLinks = JSON.parse(savedAfterFilter);
          let postsWithSelftext = 0;
          let postsWithoutSelftext = 0;
          Object.values(verifyLinks).forEach((links: any) => {
            if (Array.isArray(links)) {
              links.forEach((link: any) => {
                if (link.selftext) {
                  postsWithSelftext++;
                } else {
                  postsWithoutSelftext++;
                }
              });
            }
          });
          console.log(`[filterPosts] After saving: ${postsWithSelftext} posts with selftext, ${postsWithoutSelftext} posts without selftext`);
        } catch (e) {
          console.error("Error verifying saved data:", e);
        }
      }
      
      // DO NOT update state here - will be updated after usage update completes
      
      return { success: true, finalPostCount }; // Filtering completed successfully
    } catch (error) {
      console.error("Error filtering posts:", error);
      return { success: false, finalPostCount: 0 };
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
        throw new Error(data.error);
      }

      if (data.result && Array.isArray(data.result)) {
        console.log("Generated queries:", data.result);
        setResults(data.result);
        
        // Save queries to localStorage
        localStorage.setItem("savedQueries", JSON.stringify(data.result));
        
        // Usage is now tracked only when comments are generated, not when queries/posts are fetched
        // No need to check usage limits here
        
        // Get existing posts URLs BEFORE adding new ones (to track which posts are new for usage calculation)
        let existingPostUrls = new Set<string>();
        let existingPostsCount = 0;
        try {
          const existingSaved = localStorage.getItem("redditLinks");
          if (existingSaved) {
            const existingLinks: Record<string, Array<any>> = JSON.parse(existingSaved);
            existingPostsCount = Object.values(existingLinks).reduce((total: number, links: Array<any>) => total + links.length, 0);
            // Collect all existing post URLs
            Object.values(existingLinks).forEach((links: Array<any>) => {
              links.forEach((link: any) => {
                if (link.link) {
                  existingPostUrls.add(link.link);
                }
              });
            });
          }
        } catch (e) {
          console.error("Error reading existing posts from localStorage:", e);
        }
        
        // Don't clear existing posts - we'll append new results to them
        setIsSearching(true); // Set flag to prevent showing posts in table during search
        
        // Fetch Reddit links for each query in parallel
        // Each query will fetch top 7 results for better coverage (some may be filtered)
        const RESULTS_PER_QUERY = 7;
        const linkPromises = data.result.map((query: string) => {
          return fetchRedditLinks(query, RESULTS_PER_QUERY, true); // Pass true to defer state updates
        });
        
        // Wait for all links to be fetched, then batch fetch all post content together
        Promise.all(linkPromises).then(async () => {
          // Small delay to ensure all links are saved to localStorage and state is updated
          setTimeout(async () => {
            // Fetch post content without updating state (only update localStorage)
            // This prevents posts from appearing in UI before filtering
            await batchFetchAllPostContent(true); // Pass true to defer state updates
            
            // Get total post count from localStorage (existing + new, before filtering)
            let postsBeforeFilter = 0;
            try {
              const saved = localStorage.getItem("redditLinks");
              if (saved) {
                const savedLinks: Record<string, Array<any>> = JSON.parse(saved);
                postsBeforeFilter = Object.values(savedLinks).reduce((total: number, links: Array<any>) => total + links.length, 0);
              }
            } catch (e) {
              console.error("Error reading post count from localStorage:", e);
            }
            
            // Filter posts after content is loaded (will update state with filtered results)
            // COMMENTED OUT: Filtering disabled temporarily
            // const filterResult = await filterPosts(dbProductDescription || productIdeaToUse);
            
            // Get final post count (no filtering, so use postsBeforeFilter)
            let finalPostCount = postsBeforeFilter;
            let finalLinks: Record<string, Array<any>> = {};
            
            // Read posts from localStorage (unfiltered)
            try {
              const saved = localStorage.getItem("redditLinks");
              if (saved) {
                finalLinks = JSON.parse(saved);
              }
            } catch (e) {
              console.error("Error reading posts from localStorage:", e);
            }
            
            // Count how many NEW posts (not in existingPostUrls) - no filtering applied
            let newPostsAfterFilter = 0;
            Object.values(finalLinks).forEach((links: Array<any>) => {
              links.forEach((link: any) => {
                if (link.link && !existingPostUrls.has(link.link)) {
                  newPostsAfterFilter++;
                }
              });
            });
            
            // Only increment usage for new posts (no filtering, so all new posts are included)
            const postsToIncrement = Math.max(0, newPostsAfterFilter);
            
            console.log(`Existing posts: ${existingPostsCount}, Total posts: ${postsBeforeFilter}, New posts: ${newPostsAfterFilter} (filtering disabled)`);
            
            // Usage is now incremented when comments are generated, not when posts are fetched
            // No usage increment here
            
            // NOW update state with posts (filtering disabled, so all posts are included)
            // Re-read from localStorage to ensure we have the latest data with selftext preserved
            try {
              const saved = localStorage.getItem("redditLinks");
              if (saved) {
                const latestLinks = JSON.parse(saved);
                // Verify selftext is present in the data
                let postsWithSelftext = 0;
                let postsWithoutSelftext = 0;
                Object.values(latestLinks).forEach((links: any) => {
                  if (Array.isArray(links)) {
                    links.forEach((link: any) => {
                      if (link.selftext) {
                        postsWithSelftext++;
                      } else if (link.link) {
                        postsWithoutSelftext++;
                        console.warn(`[handleSubmit] Post ${link.link} missing selftext`);
                      }
                    });
                  }
                });
                console.log(`[handleSubmit] Loading posts: ${postsWithSelftext} with selftext, ${postsWithoutSelftext} without selftext`);
                
                setRedditLinks(latestLinks);
                console.log("Updated state with posts after usage update");
              } else if (Object.keys(finalLinks).length > 0) {
                // Fallback to finalLinks if localStorage read fails
                setRedditLinks(finalLinks);
                console.log("Updated state with posts (fallback)");
              }
            } catch (e) {
              console.error("Error reading final filtered posts from localStorage:", e);
              // Fallback to finalLinks
              if (Object.keys(finalLinks).length > 0) {
                setRedditLinks(finalLinks);
              }
            }
            
            // Clear the searching flag - posts can now be displayed in the table
            setIsSearching(false);
            
            // Usage is tracked when comments are generated, not when posts are fetched
            // No need to show upgrade modal here
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

  const fetchRedditLinks = async (query: string, resultsPerQuery: number = 7, deferStateUpdates: boolean = false) => {
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
        // Log which posts were found by this query
        console.log(`[Google Search] Query: "${query}" found ${data.results.length} Reddit posts:`);
        data.results.forEach((result: any, index: number) => {
          console.log(`  ${index + 1}. ${result.title || 'No title'} - ${result.link || 'No link'}`);
        });
        
        // Don't increment usage here - will be incremented after filtering
        // This ensures usage count matches the number of posts displayed in the table

        // Read current state from localStorage if deferring, otherwise from state
        let currentLinksState: Record<string, Array<any>> = {};
        if (deferStateUpdates) {
          try {
            const saved = localStorage.getItem("redditLinks");
            if (saved) {
              currentLinksState = JSON.parse(saved);
            }
          } catch (e) {
            console.error("Error reading from localStorage in fetchRedditLinks:", e);
          }
        } else {
          // Read from localStorage first, then state as fallback
          try {
            const saved = localStorage.getItem("redditLinks");
            if (saved) {
              currentLinksState = JSON.parse(saved);
            } else {
              currentLinksState = {};
            }
          } catch (e) {
            currentLinksState = {};
          }
        }
        
        // Merge new results with existing results for this query, avoiding duplicates
        const existingLinksForQuery = currentLinksState[query] || [];
        const existingLinkUrls = new Set(existingLinksForQuery.map((link: any) => link.link).filter(Boolean));
        
        // Only add new links that don't already exist (by URL)
        const newLinks = data.results.filter((link: any) => link.link && !existingLinkUrls.has(link.link));
        const mergedLinksForQuery = [...existingLinksForQuery, ...newLinks];
        
          const updated = {
          ...currentLinksState,
          [query]: mergedLinksForQuery,
        };
        
        // Always save to localStorage
        safeSetLocalStorage("redditLinks", updated);
        
        // Only update state if not deferring
        if (!deferStateUpdates) {
          setRedditLinks(updated);
        }
        
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
  // If deferStateUpdates is true, only update localStorage and don't trigger React re-renders
  const batchFetchAllPostContent = async (deferStateUpdates: boolean = false) => {
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
              // Set loading state for posts that need fetching (only if not deferring)
              if (!deferStateUpdates) {
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [link.link!]: true }));
              }
            }
          }
        }
      });
    });
    
    // Update state with cached posts first (only if not deferring)
    if (postsToUpdate.length > 0) {
      const updatedCached = { ...currentState };
        postsToUpdate.forEach(({ query, linkIndex, cached }) => {
        if (updatedCached[query] && updatedCached[query][linkIndex]) {
          updatedCached[query][linkIndex] = {
            ...updatedCached[query][linkIndex],
              selftext: cached.selftext || null,
              postData: cached.postData || null,
            };
          }
        });
      // Update localStorage temporarily even when deferring (so filterPosts can read it)
      // It will be overwritten with filtered results later
      safeSetLocalStorage("redditLinks", updatedCached);
      
      if (!deferStateUpdates) {
        setRedditLinks(updatedCached);
      } else {
        // When deferring, update state but localStorage will be overwritten after filtering
        setRedditLinks(updatedCached);
      }
    }
    
    // Process fetching if needed
    if (allPostsNeedingFetch.length > 0) {
      console.log(`Batch fetching ${allPostsNeedingFetch.length} posts from ${Object.keys(currentState).length} queries in a single batch operation`);
      await processBatchFetch(allPostsNeedingFetch, deferStateUpdates);
    } else {
      console.log("All posts were found in cache, no fetching needed");
    }
  };
  
  // Helper function to process batch fetching
  // If deferStateUpdates is true, only update localStorage and don't trigger React re-renders
  const processBatchFetch = async (
    allPostsNeedingFetch: Array<{ url: string; query: string; linkIndex: number; postFullname: string }>,
    deferStateUpdates: boolean = false
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
              "User-Agent": "comment-tool/0.1 by isaaclhy13",
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
          // Read current state from localStorage if deferring, otherwise from state
          let currentBatchState: Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>> = {};
          if (deferStateUpdates) {
            try {
              const saved = localStorage.getItem("redditLinks");
              if (saved) {
                currentBatchState = JSON.parse(saved);
              }
            } catch (e) {
              console.error("Error reading state from localStorage in batch:", e);
            }
          } else {
            // When not deferring, we need to read from localStorage first, then state will be updated
            // We'll read from localStorage as the source of truth
            try {
              const saved = localStorage.getItem("redditLinks");
              if (saved) {
                currentBatchState = JSON.parse(saved);
              }
            } catch (e) {
              console.error("Error reading state from localStorage in batch (non-deferred):", e);
              // Fallback: use empty object, state update will handle it
              currentBatchState = {};
            }
          }
          
          const updated = { ...currentBatchState };
            
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
                
              if (!deferStateUpdates) {
                setIsLoadingPostContent((prevLoading) => {
                  const newState = { ...prevLoading };
                  delete newState[url];
                  return newState;
                });
              }
            }
          });
          
          // Update localStorage temporarily even when deferring (so filterPosts can read it)
          // It will be overwritten with filtered results later
          safeSetLocalStorage("redditLinks", updated);
          
          if (!deferStateUpdates) {
            setRedditLinks(updated);
          } else {
            // When deferring, update state but localStorage will be overwritten after filtering
            setRedditLinks(updated);
          }
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
  const handlePostClick = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }): Promise<boolean> => {
    const linkKey = linkItem.uniqueKey;
    const commentText = postTextareas[linkKey];

    // Validate required data
    if (!commentText || !commentText.trim()) {
      alert("Please generate or enter a comment before posting.");
      return false;
    }

    if (!linkItem.postData?.name) {
      alert("Invalid post data. Cannot post comment.");
      return false;
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
      return true;
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
    return false;
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
  const handleGenerateComment = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }, persona?: string) => {
    await generateCommentForLink(linkItem, { force: true, showAlerts: true, persona: persona || "Founder" });
  };

  // Handler for bulk commenting
  const handleBulkComment = async () => {
    if (selectedLeads.size === 0) {
      showToast("No leads selected", { variant: "error" });
      return;
    }

    // Set posting state to true
    setIsBulkPosting(true);

    // Use the stored modal leads (they persist even if filtered out from distinctLeadsLinks)
    const selectedLeadItems = bulkModalLeads;
    
    // Initialize status for all selected leads
    const initialStatus: Record<string, "haven't started" | "generating" | "posting" | "completed" | "error"> = {};
    selectedLeadItems.forEach(item => {
      initialStatus[item.uniqueKey] = "haven't started";
    });
    setBulkOperationStatus(initialStatus);

    // Process all leads asynchronously in parallel
    const ideaToUse = submittedProductIdea || currentProductIdea;
    const dbLink = productDetailsFromDb?.link || website;
    const dbProductDescription = productDetailsFromDb?.productDescription;
    const productIdeaToUse = dbProductDescription || ideaToUse;
    
    if (!productIdeaToUse || !dbLink) {
      showToast("Please enter your product details in the Product tab first.", { variant: "error" });
      return;
    }

    const processLead = async (leadItem: typeof selectedLeadItems[number]) => {
      const linkKey = leadItem.uniqueKey;
      
      try {
        // Step 1: Generate comment
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "generating" }));
        
        const postContent = leadItem.selftext || leadItem.snippet || leadItem.title || "";
        if (!postContent) {
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const response = await fetch("/api/openai/comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productIdea: productIdeaToUse,
            productLink: dbLink,
            postContent: postContent,
            persona: bulkPersona.toLowerCase(),
            selftext: leadItem.selftext || undefined,
          }),
        });

        if (!response.ok) {
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const data = await response.json();
        if (data.error || !data.comments || data.comments.length === 0) {
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const generatedComment = data.comments.join("\n\n");
        setBulkGeneratedComments(prev => ({ ...prev, [linkKey]: generatedComment }));

        // Step 2: Post comment
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "posting" }));

        if (!leadItem.postData?.name) {
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const postResponse = await fetch("/api/reddit/post-comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thing_id: extractThingIdFromLink(leadItem.link || ""),
            text: generatedComment.trim(),
          }),
        });

        if (!postResponse.ok) {
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        // Save to MongoDB
        try {
          await fetch("/api/posts/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "posted",
              query: leadItem.query,
              title: leadItem.title || null,
              link: leadItem.link || null,
              snippet: leadItem.snippet || null,
              selftext: leadItem.selftext || null,
              postData: leadItem.postData || null,
              comment: generatedComment.trim(),
              notes: generatedComment.trim(),
            }),
          });
        } catch (dbError) {
          console.error("Error saving post to database:", dbError);
        }

        // Mark as completed
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "completed" }));
        
      } catch (error) {
        console.error("Error processing lead:", error);
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
      }
    };

    // Process all leads in parallel
    await Promise.all(selectedLeadItems.map(leadItem => processLead(leadItem)));
    
    // Refresh analytics and usage once after all operations complete
    await refreshAnalytics();
    refreshUsage();
    
    // Clear selected leads after bulk operation completes
    setSelectedLeads(new Set());
    
    // Set posting state to false when all operations complete
    setIsBulkPosting(false);
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
    // Check if this is a leads link (uniqueKey starts with "leads-")
    const isLeadsLink = linkItem.uniqueKey.startsWith("leads-");

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

    // Refresh analytics from database after closing to update the filter set
    await refreshAnalytics();

    if (isLeadsLink) {
      // Remove from leadsLinks state and localStorage
      setLeadsLinks((prev) => {
        const updated = { ...prev };
        if (updated[linkItem.query]) {
          updated[linkItem.query] = updated[linkItem.query].filter((link) => link.link !== linkItem.link);
          if (updated[linkItem.query].length === 0) {
            delete updated[linkItem.query];
          }
        }
        safeSetLocalStorage("leadsLinks", updated);
        // Also save the current user's email to associate leads data with the user
        if (session?.user?.email) {
          try {
            localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
          } catch (e) {
            console.error("Error saving leadsLinksUserEmail:", e);
          }
        }
        return updated;
      });
    } else {
      // Remove from redditLinks state and localStorage
    setRedditLinks((prev) => {
      const updated = { ...prev };
      if (updated[linkItem.query]) {
        // Remove the post by filtering it out
        updated[linkItem.query] = updated[linkItem.query].filter((link) => link.link !== linkItem.link);
          safeSetLocalStorage("redditLinks", updated);
      }
      return updated;
    });
    }

    // Remove textarea value
    setPostTextareas((prev) => {
      const updated = { ...prev };
      delete updated[linkItem.uniqueKey];
      return updated;
    });

    // Show success message
    showToast("Lead removed and will not appear again", { variant: "success" });
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

  // Auto-save keywords when added
  const generateKeywords = async () => {
    if (!productDescription || !productDescription.trim()) {
      showToast("Please fill in the product description first", { variant: "error" });
      return;
    }

    setIsGeneratingKeywords(true);
    try {
      const response = await fetch("/api/openai/keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productDescription: productDescription,
          numKeywords: 15,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate keywords");
      }

      const data = await response.json();
      if (data.success && data.keywords && Array.isArray(data.keywords)) {
        // Merge with existing keywords, avoiding duplicates
        const existingKeywordsSet = new Set(keywords.map((k: string) => k.toLowerCase()));
        const newKeywords = data.keywords.filter((k: string) => {
          const lower = k.toLowerCase().trim();
          return lower && !existingKeywordsSet.has(lower);
        });
        
        // Limit to 20 total keywords
        const combined = [...keywords, ...newKeywords].slice(0, 20);
        setKeywords(combined);
        // Auto-save the generated keywords
        await saveKeywords(combined);
        showToast(`Generated ${newKeywords.length} keywords!`, { variant: "success" });
      } else {
        throw new Error("No keywords received from API");
      }
    } catch (error) {
      console.error("Error generating keywords:", error);
      showToast(error instanceof Error ? error.message : "Failed to generate keywords", { variant: "error" });
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const saveKeywords = async (newKeywords: string[]) => {
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords: newKeywords.length > 0 ? newKeywords : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Update original values after successful save
          setOriginalProductDetails((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              keywords: newKeywords,
            };
          });
        }
      }
    } catch (error) {
      console.error("Error auto-saving keywords:", error);
      // Don't show error toast for auto-save, just log it
    }
  };

  // Auto-save subreddits when added/removed
  const saveSubreddits = async (newSubreddits: string[]) => {
    try {
      const response = await fetch("/api/user/product-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subreddits: newSubreddits.length > 0 ? newSubreddits : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Subreddits saved successfully
        }
      }
    } catch (error) {
      console.error("Error auto-saving subreddits:", error);
      // Don't show error toast for auto-save, just log it
    }
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
                            productName: productName || undefined,
                            link: website || undefined,
                            productDescription: productDescription || undefined,
                            keywords: keywords.length > 0 ? keywords : undefined,
                          }),
                        });

                        if (!response.ok) {
                          const errorData = await response.json();
                          throw new Error(errorData.error || "Failed to save product details");
                        }

                        const data = await response.json();
                        if (data.success) {
                          // Update original values after successful save
                          setOriginalProductDetails({
                            productName: productName || "",
                            website: website || "",
                            productDescription: productDescription || "",
                            keywords: keywords,
                          });
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
                    disabled={
                      isSavingProductDetails || 
                      isLoadingProductDetails || 
                      !originalProductDetails ||
                      (originalProductDetails.productName === (productName || "") &&
                       originalProductDetails.website === (website || "") &&
                       originalProductDetails.productDescription === (productDescription || "") &&
                       JSON.stringify(originalProductDetails.keywords.sort()) === JSON.stringify([...keywords].sort()))
                    }
                    className="bg-black text-white hover:bg-black/90 disabled:opacity-50 self-start sm:self-auto"
                    size="sm"
                  >
                    {isSavingProductDetails ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
              
              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
          )}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-1">
                  {/* Left Column */}
                  <div className="space-y-4">
              <div>
                      <label htmlFor="product-name" className="block text-sm font-medium text-foreground mb-1">
                        Product Name
                      </label>
                      <Input
                        id="product-name"
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="Enter your product name"
                        className="w-full"
                      />
              </div>
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
                        className="w-full"
                      />
              </div>
                    <div>
                      <label htmlFor="product-description" className="block text-sm font-medium text-foreground mb-1">
                        Product Description
                      </label>
                      <div className="relative w-full rounded-md border border-input focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
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
                  
                  {/* Right Column */}
                  <div className="space-y-6">
                  <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="product-keywords" className="block text-sm font-medium text-foreground">
                          Keywords
                        </label>
                    <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={generateKeywords}
                          disabled={isGeneratingKeywords || !productDescription || !productDescription.trim()}
                          className="text-xs h-7"
                        >
                          {isGeneratingKeywords ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3 mr-1.5" />
                              AI Generate
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Add keywords related to your product niche {keywords.length > 0 && `(${keywords.length}/20)`}
                      </p>
                      <div className="w-full space-y-1">
                        <div className="relative">
                          <div className="min-h-[40px] max-h-[180px] overflow-y-auto flex flex-wrap gap-2 items-start py-1 pb-10" style={{ minHeight: keywords.length > 0 ? 'auto' : '40px' }}>
                            {keywords.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">No keywords added. Enter keywords related to your product niche.</p>
                            ) : (
                              keywords.map((keyword, index) => (
                                <div
                                  key={index}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground"
                                >
                                  <span>{keyword}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newKeywords = keywords.filter((_, i) => i !== index);
                                      setKeywords(newKeywords);
                                      // Auto-save keywords when removed
                                      saveKeywords(newKeywords);
                                    }}
                                    className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                                    aria-label={`Remove ${keyword}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                          {keywords.length > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-background to-transparent" />
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Input
                            id="product-keywords"
                            type="text"
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = keywordInput.trim();
                                if (trimmed && !keywords.includes(trimmed)) {
                                  if (keywords.length >= 20) {
                                    showToast("Maximum of 20 keywords allowed", { variant: "error" });
                                    return;
                                  }
                                  const newKeywords = [...keywords, trimmed];
                                  setKeywords(newKeywords);
                                  setKeywordInput("");
                                  // Auto-save keywords
                                  saveKeywords(newKeywords);
                                }
                              }
                            }}
                            placeholder="Enter a keyword"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              const trimmed = keywordInput.trim();
                              if (trimmed && !keywords.includes(trimmed)) {
                                if (keywords.length >= 20) {
                                  showToast("Maximum of 20 keywords allowed", { variant: "error" });
                                  return;
                                }
                                const newKeywords = [...keywords, trimmed];
                                setKeywords(newKeywords);
                                setKeywordInput("");
                                // Auto-save keywords
                                saveKeywords(newKeywords);
                              }
                            }}
                            disabled={!keywordInput.trim() || keywords.includes(keywordInput.trim()) || keywords.length >= 20}
                            className="shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
                  <div>
                      <label htmlFor="product-subreddits" className="block text-sm font-medium text-foreground mb-1">
                        Target Subreddits
                      </label>
                      <div className="w-full space-y-1">
                        <div className="relative">
                          <div className="min-h-[40px] max-h-[180px] overflow-y-auto flex flex-wrap gap-2 items-start py-1 pb-10" style={{ minHeight: subreddits.length > 0 ? 'auto' : '40px' }}>
                            {subreddits.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">No subreddits selected. Search and add subreddits to get started.</p>
                            ) : (
                              subreddits.map((subreddit, index) => (
                                <div
                                  key={index}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground"
                                >
                                  <span>r/{subreddit}</span>
                                  <button
                                    type="button"
                                  onClick={() => {
                                    const newSubreddits = subreddits.filter((_, i) => i !== index);
                                    setSubreddits(newSubreddits);
                                    // Auto-save subreddits when removed
                                    saveSubreddits(newSubreddits);
                                  }}
                                    className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                                    aria-label={`Remove ${subreddit}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                          {subreddits.length > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-background to-transparent" />
                          )}
                        </div>
                        <div className="relative flex gap-2 pt-1">
                          <div className="relative flex-1" style={{ zIndex: 100 }}>
                            <Input
                              ref={subredditInputRef}
                              id="product-subreddits"
                              type="text"
                              value={subredditInput}
                              onChange={(e) => {
                                setSubredditInput(e.target.value);
                                setTimeout(() => {
                                  if (subredditInputRef.current) {
                                    const rect = subredditInputRef.current.getBoundingClientRect();
                                    setSubredditDropdownPosition({
                                      top: rect.bottom + window.scrollY + 4,
                                      left: rect.left + window.scrollX,
                                      width: rect.width,
                                    });
                                  }
                                }, 0);
                                setShowSubredditDropdown(true);
                              }}
                              onFocus={() => {
                                setTimeout(() => {
                                  if (subredditInputRef.current) {
                                    const rect = subredditInputRef.current.getBoundingClientRect();
                                    setSubredditDropdownPosition({
                                      top: rect.bottom + window.scrollY + 4,
                                      left: rect.left + window.scrollX,
                                      width: rect.width,
                                    });
                                  }
                                }, 0);
                                if (subredditSuggestions.length > 0) {
                                  setShowSubredditDropdown(true);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && subredditSuggestions.length > 0) {
                                  e.preventDefault();
                                  const firstSuggestion = subredditSuggestions[0];
                                  if (firstSuggestion && !subreddits.includes(firstSuggestion.name)) {
                                    if (subreddits.length >= 15) {
                                      showToast("Maximum of 15 subreddits allowed", { variant: "error" });
                                      return;
                                    }
                                    const newSubreddits = [...subreddits, firstSuggestion.name];
                                    setSubreddits(newSubreddits);
                                    setSubredditInput("");
                                    setShowSubredditDropdown(false);
                                    // Auto-save subreddits
                                    saveSubreddits(newSubreddits);
                                  }
                                } else if (e.key === 'Escape') {
                                  setShowSubredditDropdown(false);
                                }
                              }}
                              placeholder="Search for subreddits..."
                              className="flex-1"
                            />
                            {isLoadingSubreddits && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            {showSubredditDropdown && subredditSuggestions.length > 0 && subredditDropdownPosition && (
                              <div
                                ref={subredditDropdownRef}
                                className="fixed z-[100] bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
                                style={{
                                  top: `${subredditDropdownPosition.top}px`,
                                  left: `${subredditDropdownPosition.left}px`,
                                  width: `${subredditDropdownPosition.width}px`,
                                }}
                              >
                                {subredditSuggestions.map((sub, index) => (
                                  <button
                                    key={index}
                                    type="button"
                                    onClick={() => {
                                      if (!subreddits.includes(sub.name)) {
                                        if (subreddits.length >= 15) {
                                          showToast("Maximum of 15 subreddits allowed", { variant: "error" });
                                          return;
                                        }
                                        const newSubreddits = [...subreddits, sub.name];
                                        setSubreddits(newSubreddits);
                                        setSubredditInput("");
                                        setShowSubredditDropdown(false);
                                        // Auto-save subreddits
                                        saveSubreddits(newSubreddits);
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center justify-between"
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{sub.displayName}</span>
                                      {sub.subscribers > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          {sub.subscribers >= 1000 
                                            ? `${(sub.subscribers / 1000).toFixed(1)}k members`
                                            : `${sub.subscribers} members`}
                                        </span>
                                      )}
                                    </div>
                                    {subreddits.includes(sub.name) && (
                                      <Check className="h-4 w-4 text-primary" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Search and add subreddits where you want to engage
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case "create":
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
                <div className="flex flex-col gap-3">
                  <h3 className="text-lg font-semibold">
                    Create
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant={createFilter === "comment" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCreateFilter("comment")}
                    >
                      Comment
                    </Button>
                    <Button
                      variant={createFilter === "post" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCreateFilter("post")}
                    >
                      Post
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                <div className="space-y-6 px-1">
                  {createFilter === "comment" ? (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="create-reddit-link" className="block text-sm font-medium text-foreground mb-1">
                          Reddit Link
                        </label>
                        <Input
                          id="create-reddit-link"
                          type="url"
                          value={createRedditLink}
                          onChange={(e) => setCreateRedditLink(e.target.value)}
                          placeholder="https://reddit.com/r/..."
                          className="w-full max-w-md"
                        />
                      </div>
                      <div>
                        <label htmlFor="create-persona" className="block text-sm font-medium text-foreground mb-1">
                          Persona
                        </label>
                        <Select
                          id="create-persona"
                          value={createPersona}
                          onChange={(e) => setCreatePersona(e.target.value)}
                          className="w-full max-w-md"
                        >
                          <option value="">Select persona...</option>
                          <option value="founder">Founder</option>
                          <option value="user">User</option>
                        </Select>
                      </div>
                      {/* <div>
                        <label htmlFor="create-intent" className="block text-sm font-medium text-foreground mb-1">
                          Intent
                        </label>
                        <Select
                          id="create-intent"
                          value={createIntent}
                          onChange={(e) => setCreateIntent(e.target.value)}
                          className="w-full max-w-md"
                        >
                          <option value="">Select intent...</option>
                          <option value="drive-traffic">Drive traffic</option>
                          <option value="get-feedback">Get feedback</option>
                          <option value="join-waitlist">Join waitlist</option>
                        </Select>
                      </div> */}
                      <div className="mt-6">
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!createRedditLink.trim() || isGeneratingCreateComment) {
                              return;
                            }

                            // Check if product details are available
                            const dbLink = productDetailsFromDb?.link || website;
                            const dbProductDescription = productDetailsFromDb?.productDescription;
                            
                            if (!dbProductDescription || !dbLink) {
                              setToast({
                                visible: true,
                                message: "Please enter your product details in the Product tab first.",
                                variant: "error",
                              });
                              setActiveTab("product");
                              return;
                            }

                            setIsGeneratingCreateComment(true);
                            setCreateGeneratedComment("");

                            try {
                              // Step 1: Fetch Reddit post content
                              const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(createRedditLink)}`);
                              
                              if (!redditResponse.ok) {
                                const errorData = await redditResponse.json();
                                throw new Error(errorData.error || "Failed to fetch Reddit post");
                              }

                              const redditData = await redditResponse.json();
                              const post: RedditPost = redditData.post;

                              // Store post data for later use when posting
                              setCreatePostData(post);
                              
                              // Extract post content (title + selftext) for Founder persona
                              // For User persona, use only selftext
                              const postContent = `${post.title}\n\n${post.selftext || ""}`;
                              const selftext = post.selftext || "";

                              // Step 2: Generate comment using OpenAI
                              const generateResponse = await fetch("/api/openai/comment", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  productIdea: dbProductDescription,
                                  productLink: dbLink,
                                  postContent: postContent,
                                  persona: createPersona,
                                  selftext: selftext,
                                }),
                              });

                              if (!generateResponse.ok) {
                                const errorData = await generateResponse.json();
                                // Check if this is a usage limit error
                                if (errorData.limitReached || (generateResponse.status === 403 && errorData.error?.includes("limit"))) {
                                  refreshUsage();
                                  setUpgradeModalContext({
                                    limitReached: true,
                                    remaining: 0
                                  });
                                  setTimeout(() => {
                                    setShowUpgradeModal(true);
                                  }, 300);
                                }
                                throw new Error(errorData.error || "Failed to generate comment");
                              }

                              const generateData = await generateResponse.json();
                              const comments = generateData.comments || [];
                              
                              // Display the first generated comment (or join all if multiple)
                              if (comments.length > 0) {
                                setCreateGeneratedComment(comments[0] || comments.join("\n\n"));
                                // Refresh usage after successful generation
                                refreshUsage();
                              } else {
                                setCreateGeneratedComment("No comments generated");
                              }
                            } catch (error) {
                              console.error("Error generating comment:", error);
                              setCreateGeneratedComment(`Error: ${error instanceof Error ? error.message : "Failed to generate comment"}`);
                            } finally {
                              setIsGeneratingCreateComment(false);
                            }
                          }}
                          disabled={!createRedditLink.trim() || !createPersona || isGeneratingCreateComment}
                          className="bg-black text-white hover:bg-black/90 disabled:opacity-50"
                        >
                          {isGeneratingCreateComment ? "Generating..." : "Generate Comment"}
                        </Button>
                      </div>
                      {(createGeneratedComment || isGeneratingCreateComment) && (
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1">
                            Generated Comment
                          </label>
                          {isGeneratingCreateComment ? (
                            <div className="flex items-center gap-2 p-4 border border-border rounded-md bg-background max-w-md">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                              <span className="text-sm text-muted-foreground">Generating comment...</span>
                            </div>
                          ) : (
                            <div className="relative max-w-md rounded-md border border-input focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-0">
                              <textarea
                                readOnly
                                value={createGeneratedComment}
                                className="w-full h-[150px] rounded-md border-0 bg-background px-3 py-2 pb-12 text-sm text-foreground focus:outline-none resize-none"
                                placeholder="Generated comment will appear here..."
                              />
                              <Button
                                type="button"
                                onClick={async () => {
                                  if (!createGeneratedComment.trim() || isPostingCreateComment) {
                                    return;
                                  }

                                  if (!createRedditLink.trim()) {
                                    setToast({
                                      visible: true,
                                      message: "Reddit link is required.",
                                      variant: "error",
                                    });
                                    return;
                                  }

                                  const thingId = extractThingIdFromLink(createRedditLink);
                                  if (!thingId) {
                                    setToast({
                                      visible: true,
                                      message: "Invalid Reddit URL. Please check the link format.",
                                      variant: "error",
                                    });
                                    return;
                                  }

                                  setIsPostingCreateComment(true);

                                  try {
                                    // Post comment to Reddit
                                    const response = await fetch("/api/reddit/post-comment", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        thing_id: thingId,
                                        text: createGeneratedComment.trim(),
                                      }),
                                    });

                                    if (!response.ok) {
                                      const errorData = await response.json();
                                      throw new Error(errorData.error || "Failed to post comment to Reddit");
                                    }

                                    const result = await response.json();

                                    // Fetch post data if we don't have it
                                    let postData = createPostData;
                                    if (!postData) {
                                      try {
                                        const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(createRedditLink)}`);
                                        if (redditResponse.ok) {
                                          const redditData = await redditResponse.json();
                                          postData = redditData.post;
                                        }
                                      } catch (fetchError) {
                                        console.error("Error fetching post data:", fetchError);
                                        // Continue without post data
                                      }
                                    }

                                    // Save to MongoDB
                                    try {
                                      const dbResponse = await fetch("/api/posts/create", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          status: "posted",
                                          query: productDetailsFromDb?.productDescription || "Manual create",
                                          title: postData?.title || null,
                                          link: createRedditLink,
                                          snippet: postData?.selftext?.substring(0, 200) || null,
                                          selftext: postData?.selftext || null,
                                          postData: postData || null,
                                          comment: createGeneratedComment.trim(),
                                          notes: createGeneratedComment.trim(),
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

                                    // Refresh analytics
                                    await refreshAnalytics();

                                    // Show success message
                                    showToast("Comment posted successfully.", { link: createRedditLink, variant: "success" });

                                    // Clear the generated comment and form
                                    setCreateGeneratedComment("");
                                    setCreatePostData(null);
                                  } catch (err) {
                                    console.error("Error posting comment:", err);
                                    const errorMessage = err instanceof Error ? err.message : "Failed to post comment to Reddit";
                                    showToast(errorMessage, { variant: "error" });

                                    // Try to save failed attempt to database
                                    try {
                                      let postData = createPostData;
                                      if (!postData) {
                                        try {
                                          const redditResponse = await fetch(`/api/reddit?url=${encodeURIComponent(createRedditLink)}`);
                                          if (redditResponse.ok) {
                                            const redditData = await redditResponse.json();
                                            postData = redditData.post;
                                          }
                                        } catch (fetchError) {
                                          console.error("Error fetching post data:", fetchError);
                                        }
                                      }

                                      await fetch("/api/posts/create", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          status: "failed",
                                          query: productDetailsFromDb?.productDescription || "Manual create",
                                          title: postData?.title || null,
                                          link: createRedditLink,
                                          snippet: postData?.selftext?.substring(0, 200) || null,
                                          selftext: postData?.selftext || null,
                                          postData: postData || null,
                                          comment: createGeneratedComment.trim() || null,
                                          notes: errorMessage,
                                        }),
                                      });
                                      await refreshAnalytics();
                                    } catch (recordError) {
                                      console.error("Error recording failed analytics entry:", recordError);
                                    }
                                  } finally {
                                    setIsPostingCreateComment(false);
                                  }
                                }}
                                disabled={isPostingCreateComment || !createGeneratedComment.trim()}
                                className="absolute bottom-2 right-2 bg-black text-white hover:bg-black/90 text-xs h-7 disabled:opacity-50"
                              >
                                {isPostingCreateComment ? "Posting..." : "Post Comment"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* Post inputs will be added here */}
                    </div>
                  )}
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
                    History
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
      // case "dashboard":
      //   // Show Reddit connection prompt if not connected
      //   if (isRedditConnected === false) {
      //     return (
      //       <div className="flex h-full flex-col items-center justify-center p-6">
      //         <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 text-center">
      //           <div className="space-y-2">
      //             <h2 className="text-2xl font-semibold text-foreground">Connect Your Reddit Account</h2>
      //             <p className="text-sm text-muted-foreground">
      //               To get started, you need to connect your Reddit account. This allows us to fetch Reddit posts and post comments on your behalf.
      //             </p>
      //           </div>
      //           <Button
      //             size="lg"
      //             onClick={() => {
      //               window.location.href = "/api/reddit/auth";
      //             }}
      //             className="w-full"
      //           >
      //             Connect Reddit Account
      //           </Button>
      //           <p className="text-xs text-muted-foreground">
      //             You'll be redirected to Reddit to authorize the connection
      //           </p>
      //         </div>
      //       </div>
      //     );
      //   }
      //   
      //   // Show loading state while checking connection
      //   if (isRedditConnected === null && status === "authenticated") {
      //     return (
      //       <div className="flex h-full flex-col items-center justify-center p-6">
      //         <div className="flex items-center gap-2 text-sm text-muted-foreground">
      //           <Loader2 className="h-4 w-4 animate-spin" />
      //           <span>Checking Reddit connection...</span>
      //         </div>
      //       </div>
      //     );
      //   }

      //   return (
      //     <div className="flex h-full flex-col">
      //       {/* Main content area - scrollable */}
      //       <div className={cn(
      //         "flex h-full flex-col",
      //         !sidebarOpen && "pl-14"
      //       )}>
      //         {/* Fixed header with title and buttons */}
      //         {!isLoading && (
      //           <div className={cn(
      //             "sticky top-0 z-10 bg-background px-6 pt-6 pb-2",
      //             !sidebarOpen && "pl-14"
      //           )}>
      //                 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      //                   <h3 className="text-lg font-semibold">
      //                     Reddit Posts
      //                   </h3>
      //                   <div className="flex gap-2 self-start sm:self-auto">
      //                     <Button
      //                       onClick={() => {
      //                         // Use database productDescription as the message
      //                         if (productDetailsFromDb?.productDescription) {
      //                           handleSubmit(productDetailsFromDb.productDescription);
      //                         }
      //                       }}
      //                       disabled={!productDetailsFromDb?.productDescription || isLoading}
      //                       size="sm"
      //                       variant={results.length > 0 ? "outline" : "default"}
      //                     >
      //                       {isLoading ? "Searching..." : "Search for Reddit Posts"}
      //                     </Button>
      //                     {results.length > 0 && (
      //                       <>
      //                         <Button
      //                           variant="outline"
      //                           size="sm"
      //                           onClick={handleRemoveAllPosts}
      //                           disabled={
      //                             distinctLinksCount === 0 &&
      //                             !Object.values(isLoadingLinks).some(Boolean)
      //                           }
      //                         >
      //                           Remove all posts
      //                         </Button>
      //                         <Button
      //                           variant="outline"
      //                           size="sm"
      //                           onClick={() => setIsDiscoverySettingsModalOpen(true)}
      //                         >
      //                           <Settings className="h-4 w-4" />
      //                         </Button>
      //                       </>
      //                     )}
      //                   </div>
      //                 </div>
      //               </div>
      //             )}
      //             {/* Scrollable content area */}
      //             <div className={cn(
      //               "flex-1 overflow-hidden px-6 pt-2 pb-6 flex flex-col min-h-0",
      //               !sidebarOpen && "pl-14"
      //             )}>
      //               <div className="flex-1 flex flex-col min-h-0 space-y-6">
      //               {/* Results */}
      //               {isLoading && (
      //                 <div className="flex flex-col items-center justify-center py-12">
      //                   <div className="w-full max-w-md space-y-4">
      //                     <div className="space-y-2 text-center">
      //                       <h3 className="text-base font-semibold text-foreground">Finding Reddit posts...</h3>
      //                       <p className="text-sm text-muted-foreground">
      //                         Generating search queries and discovering relevant posts for your product
      //                       </p>
      //                   </div>
      //                     <div className="w-full">
      //                       <div className="h-2 w-full overflow-hidden rounded-full bg-muted relative">
      //                         <div
      //                           className="h-full w-3/4 rounded-full bg-primary absolute"
      //                           style={{
      //                             background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3) 0%, hsl(var(--primary)) 50%, hsl(var(--primary) / 0.3) 100%)',
      //                             animation: 'progress 1.5s ease-in-out infinite',
      //                           }}
      //                         />
      //                       </div>
      //                     </div>
      //                     <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      //                       <Loader2 className="h-3 w-3 animate-spin" />
      //                       <span>This may take a few moments...</span>
      //                     </div>
      //                   </div>
      //                 </div>
      //               )}

      //               {error && (
      //                 <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
      //                   <p className="text-sm text-destructive">{error}</p>
      //                 </div>
      //               )}

      //               {results.length > 0 && (
      //                 <div className="flex-1 flex flex-col min-h-0 space-y-4">
      //                   
      //                   {/* Show loading state if any query is still loading */}
      //                   {Object.values(isLoadingLinks).some(Boolean) && (
      //                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
      //                       <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      //                       <span>Searching Reddit...</span>
      //                     </div>
      //                   )}
      //                   
      //                   {/* Display Reddit links in table view */}
      //                   {distinctLinks.length > 0 ? (
      //                     <div className="rounded-lg border border-border overflow-hidden flex-1 flex flex-col min-h-0">
      //                       <div className="overflow-x-auto flex-1 overflow-y-auto min-h-0">
      //                         <table className="w-full border-collapse table-fixed">
      //                           <thead className="sticky top-0 z-20">
      //                             <tr className="border-b border-border bg-muted/50">
      //                               <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[250px]">Title</th>
      //                               <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[280px]">Content</th>
      //                               <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[290px]">Comment</th>
      //                               <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[80px]">Actions</th>
      //                             </tr>
      //                           </thead>
      //                         <tbody>
      //                           {paginatedLinks.map((linkItem) => {
      //                             const link = linkItem;
      //                           // Extract subreddit from URL
      //                           const subredditMatch = linkItem.link?.match(/reddit\.com\/r\/([^/]+)/);
      //                           const subreddit = subredditMatch ? subredditMatch[1] : null;
      //                           // Use unique key that includes query to avoid duplicates
      //                           const linkKey = linkItem.uniqueKey;
      //                           const isExpanded = expandedPosts.has(linkKey);
      //                         
      //                         // Clean snippet
      //                         let cleanSnippet = link.snippet || '';
      //                         cleanSnippet = cleanSnippet.replace(/\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
      //                         cleanSnippet = cleanSnippet.replace(/posted\s+\d+\s*(hours?|days?|minutes?|weeks?|months?|years?)\s+ago/gi, '');
      //                         cleanSnippet = cleanSnippet.replace(/^[.\s\u2026]+/g, '');
      //                         cleanSnippet = cleanSnippet.replace(/^\.+/g, '');
      //                         cleanSnippet = cleanSnippet.replace(/^[\s\u00A0]+/g, '');
      //                         cleanSnippet = cleanSnippet.replace(/^\.{1,}/g, '');
      //                         cleanSnippet = cleanSnippet.trim();
      //                         
      //                         return (
      //                               <tr 
      //                             key={linkKey}
      //                                 className="border-b border-border hover:bg-muted/50 cursor-pointer"
      //                                 onClick={() => {
      //                                   setSelectedDiscoveryPost(linkItem);
      //                                   setIsDiscoveryDrawerVisible(true);
      //                                 }}
      //                               >
      //                                 {/* Title column */}
      //                                 <td className="py-3 px-2 align-top w-[250px]">
      //                                   <div className="text-sm font-semibold text-foreground">
      //                                     {link.title}
      //                                 </div>
      //                                 </td>
      //                                 
      //                                 {/* Content column */}
      //                                 <td className="py-3 px-2 align-top w-[280px]">
      //                               {isLoadingPostContent[link.link || ''] ? (
      //                                     <div className="flex items-center gap-2">
      //                                   <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      //                                       <span className="text-xs text-muted-foreground">Loading...</span>
      //                                 </div>
      //                               ) : (
      //                                 // Always prefer selftext if available (it's what was used for filtering)
      //                                 // Only use cleanSnippet if selftext is not available
      //                                 (link.selftext || cleanSnippet) && (
      //                                       <div>
      //                                     <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
      //                                       {link.selftext || cleanSnippet}
      //                                     </p>
      //                                   </div>
      //                                 )
      //                               )}
      //                                 </td>
      //                                 
      //                                 {/* Comment column */}
      //                                 <td className="py-3 px-2 align-top w-[290px]">
      //                                   {isGeneratingComment[linkKey] ? (
      //                                     <div className="flex min-h-[60px] items-center justify-center rounded-md border border-border bg-background px-2 py-1">
      //                                       <div className="flex items-center gap-2 text-xs text-muted-foreground">
      //                                         <Loader2 className="h-3 w-3 animate-spin" />
      //                                         <span>Generating...</span>
      //                                       </div>
      //                                     </div>
      //                                   ) : (
      //                                     <div className="relative" onClick={(e) => e.stopPropagation()}>
      //                               <textarea
      //                                 value={postTextareas[linkKey] || ""}
      //                                 onChange={(e) => {
      //                                   e.stopPropagation();
      //                                   const newValue = e.target.value;
      //                                   // Update ref immediately for instant feedback
      //                                   postTextareasRef.current = {
      //                                     ...postTextareasRef.current,
      //                                     [linkKey]: newValue,
      //                                   };
      //                                   // Use startTransition to mark state update as non-urgent
      //                                   // This prevents blocking the UI during typing
      //                                   startTransition(() => {
      //                                   setPostTextareas((prev) => ({
      //                                     ...prev,
      //                                       [linkKey]: newValue,
      //                                     }));
      //                                   });
      //                                 }}
      //                                         placeholder="Add comment..."
      //                                         className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1 pr-20 text-sm placeholder:text-muted-foreground focus:outline-none resize-y"
      //                                         rows={2}
      //                                       />
      //                                       {!postTextareas[linkKey]?.trim() && (
      //                                 <Button
      //                                   size="sm"
      //                                   variant="secondary"
      //                                           className="absolute top-2 right-2 text-xs h-7"
      //                                           onClick={(e) => {
      //                                             e.stopPropagation();
      //                                             handleGenerateComment(linkItem);
      //                                           }}
      //                                   disabled={isGeneratingComment[linkKey]}
      //                                 >
      //                                           {isGeneratingComment[linkKey] ? "Generating..." : "Generate"}
      //                                 </Button>
      //                                       )}
      //                               </div>
      //                                   )}
      //                                 </td>
      //                                 
      //                                 {/* Actions column */}
      //                                 <td className="py-3 px-2 align-top w-[80px]">
      //                                   <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      //                                   <Button
      //                                     size="sm"
      //                                     variant="default"
      //                                       className="text-xs p-2"
      //                                     onClick={() => handlePostClick(linkItem)}
      //                                       disabled={isPosting[linkKey]}
      //                                       title={isPosting[linkKey] ? "Posting..." : "Post comment"}
      //                                     >
      //                                       {isPosting[linkKey] ? (
      //                                         <Loader2 className="h-4 w-4 animate-spin" />
      //                                       ) : (
      //                                         <Send className="h-4 w-4" />
      //                                       )}
      //                                     </Button>
      //                                     <Button
      //                                       size="sm"
      //                                       variant="outline"
      //                                       className="text-xs p-2"
      //                                       onClick={() => handleCloseClick(linkItem)}
      //                                       title="Close"
      //                                     >
      //                                       <Trash2 className="h-4 w-4" />
      //                                   </Button>
      //                                 </div>
      //                                 </td>
      //                               </tr>
      //                         );
      //                       })}
      //                         </tbody>
      //                       </table>
      //                       </div>
      //                       {/* Pagination controls - always show */}
      //                       {distinctLinks.length > 0 && (
      //                         <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-card">
      //                           <div className="text-xs text-muted-foreground">
      //                             Showing {(discoveryPage - 1) * DISCOVERY_ITEMS_PER_PAGE + 1} to{" "}
      //                             {Math.min(discoveryPage * DISCOVERY_ITEMS_PER_PAGE, distinctLinks.length)} of{" "}
      //                             {distinctLinks.length} posts
      //                           </div>
      //                           <div className="flex items-center gap-1.5">
      //                             <Button
      //                               variant="outline"
      //                               size="sm"
      //                               onClick={() => setDiscoveryPage((prev) => Math.max(1, prev - 1))}
      //                               disabled={discoveryPage === 1}
      //                               className="text-xs h-7 px-2"
      //                             >
      //                               <ChevronLeft className="h-3 w-3" />
      //                               <span className="hidden sm:inline">Previous</span>
      //                             </Button>
      //                             <div className="text-xs text-foreground px-1">
      //                               Page {discoveryPage} of {totalDiscoveryPages}
      //                             </div>
      //                             <Button
      //                               variant="outline"
      //                               size="sm"
      //                               onClick={() => setDiscoveryPage((prev) => Math.min(totalDiscoveryPages, prev + 1))}
      //                               disabled={discoveryPage === totalDiscoveryPages}
      //                               className="text-xs h-7 px-2"
      //                             >
      //                               <span className="hidden sm:inline">Next</span>
      //                               <ChevronRight className="h-3 w-3" />
      //                             </Button>
      //                           </div>
      //                         </div>
      //                       )}
      //                       </div>
      //                     ) : (
      //                       !Object.values(isLoadingLinks).some(Boolean) && (
      //                         <div className="flex items-center justify-center min-h-[400px]">
      //                         <p className="text-sm text-muted-foreground">
      //                             No Reddit posts found. Click "Search for Reddit Posts" to get started.
      //                         </p>
      //                         </div>
      //                       )
      //                   )}
      //                 </div>
      //               )}
      //             </div>
      //           </div>
      //           </div>
      //         </div>
      //       );
      case "leads":
        return (
          <div className="flex h-full flex-col">
            {/* Main content area - scrollable */}
            <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-14"
            )}>
              {/* Fixed header with title and buttons */}
                <div className={cn(
                "sticky top-0 z-30 bg-background",
                  !sidebarOpen && "pl-14"
                )}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold">
                    Leads
                    </h3>
                    <div className="flex gap-2 self-start sm:self-auto">
                      {selectedLeads.size > 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-black text-white hover:bg-black/90"
                        onClick={() => {
                            // Store the selected lead items before opening modal
                            const selectedLeadItems = distinctLeadsLinks.filter(link => selectedLeads.has(link.uniqueKey));
                            setBulkModalLeads(selectedLeadItems);
                            setBulkModalInitialCount(selectedLeads.size);
                            setIsBulkOperationsModalOpen(true);
                            // Reset status when opening modal
                            setBulkOperationStatus({});
                            setBulkGeneratedComments({});
                            setIsBulkPosting(false);
                          }}
                        >
                          Bulk Operations
                      </Button>
                      )}
                          <Button
                      onClick={handleLeadsSearch}
                      disabled={isLoadingLeads}
                            size="sm"
                      variant={distinctLeadsLinks.length > 0 ? "outline" : "default"}
                      className="w-[140px]"
                    >
                      {isLoadingLeads ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        "Refresh Leads"
                      )}
                          </Button>
                      {distinctLeadsLinks.length > 0 && (
                        <div className="relative" ref={sortDropdownRef}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                          >
                            {leadsSortBy === "date-desc" ? "Sort by" : 
                             leadsSortBy === "date-asc" ? "Date (Oldest)" :
                             leadsSortBy === "upvotes-desc" ? "Upvotes (High)" :
                             leadsSortBy === "upvotes-asc" ? "Upvotes (Low)" :
                             leadsSortBy === "comments-desc" ? "Comments (Most)" :
                             leadsSortBy === "comments-asc" ? "Comments (Least)" :
                             leadsSortBy === "title-asc" ? "Title (A-Z)" :
                             leadsSortBy === "title-desc" ? "Title (Z-A)" : "Sort by"}
                            <ChevronDown className="h-3 w-3 ml-1.5" />
                          </Button>
                          {isSortDropdownOpen && (
                            <div className="absolute top-full right-0 mt-1 z-[100] bg-card border border-border rounded-md shadow-lg min-w-[160px]">
                              <div className="py-1">
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("date-desc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "date-desc" && "bg-muted"
                                  )}
                                >
                                  Date (Newest)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("date-asc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "date-asc" && "bg-muted"
                                  )}
                                >
                                  Date (Oldest)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("upvotes-desc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "upvotes-desc" && "bg-muted"
                                  )}
                                >
                                  Upvotes (High)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("upvotes-asc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "upvotes-asc" && "bg-muted"
                                  )}
                                >
                                  Upvotes (Low)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("comments-desc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "comments-desc" && "bg-muted"
                                  )}
                                >
                                  Comments (Most)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("comments-asc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "comments-asc" && "bg-muted"
                                  )}
                                >
                                  Comments (Least)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("title-asc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "title-asc" && "bg-muted"
                                  )}
                                >
                                  Title (A-Z)
                                </button>
                                <button
                                  onClick={() => {
                                    setLeadsSortBy("title-desc");
                                    setIsSortDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                    leadsSortBy === "title-desc" && "bg-muted"
                                  )}
                                >
                                  Title (Z-A)
                                </button>
                        </div>
                      </div>
                          )}
                      </div>
                      )}
                    </div>
                  </div>
                  </div>
              {/* Scrollable content area */}
              <div className={cn(
                "flex-1 overflow-hidden pt-4 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                  <div className="flex-1 flex flex-col min-h-0 space-y-4">
                    
                  {distinctLeadsLinks.length > 0 ? (
                  <div className="flex-1 flex flex-col min-h-0 space-y-4">
                    {/* Display Reddit links in table view */}
                      <div className="rounded-lg border border-border overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="overflow-x-auto flex-1 overflow-y-auto min-h-0">
                          <table className="w-full border-collapse table-fixed">
                            <thead className="sticky top-0 z-20">
                              <tr className="border-b border-border bg-muted">
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[40px]">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const isChecked = paginatedLeadsLinks.length > 0 && selectedLeads.size > 0 && selectedLeads.size === paginatedLeadsLinks.length;
                                      if (isChecked) {
                                        setSelectedLeads(new Set());
                                      } else {
                                        setSelectedLeads(new Set(paginatedLeadsLinks.map(item => item.uniqueKey)));
                                      }
                                    }}
                                    className={cn(
                                      "cursor-pointer h-4 w-4 rounded border border-border bg-white flex items-center justify-center transition-colors",
                                      "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-0",
                                      paginatedLeadsLinks.length > 0 && selectedLeads.size > 0 && selectedLeads.size === paginatedLeadsLinks.length && "bg-white border-primary"
                                    )}
                                  >
                                    {paginatedLeadsLinks.length > 0 && selectedLeads.size > 0 && selectedLeads.size === paginatedLeadsLinks.length && (
                                      <Check className="h-3 w-3 text-primary" />
                                    )}
                                  </div>
                                </th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[70px]">Stats</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[250px]">Title</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[120px]">Subreddit</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[120px]">Date</th>
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50 w-[80px]">Actions</th>
                              </tr>
                            </thead>
                          <tbody>
                              {paginatedLeadsLinks.map((linkItem) => {
                              const link = linkItem;
                            // Extract subreddit from URL
                            const subredditMatch = linkItem.link?.match(/reddit\.com\/r\/([^/]+)/);
                            const subreddit = subredditMatch ? subredditMatch[1] : null;
                                // Use unique key that includes keyword to avoid duplicates
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
                                    {/* Checkbox column */}
                                    <td className="py-3 px-2 align-middle w-[40px]" onClick={(e) => e.stopPropagation()}>
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedLeads(prev => {
                                            const newSet = new Set(prev);
                                            if (selectedLeads.has(linkKey)) {
                                              newSet.delete(linkKey);
                                            } else {
                                              newSet.add(linkKey);
                                            }
                                            return newSet;
                                          });
                                        }}
                                        className={cn(
                                          "cursor-pointer h-4 w-4 rounded border border-border bg-white flex items-center justify-center transition-colors",
                                          "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-0",
                                          selectedLeads.has(linkKey) && "bg-white border-primary"
                                        )}
                                      >
                                        {selectedLeads.has(linkKey) && (
                                          <Check className="h-3 w-3 text-primary" />
                                        )}
                                  </div>
                                  </td>
                                    {/* Stats column */}
                                    <td className="py-3 px-2 align-middle w-[70px]">
                                      {link.postData ? (
                                        <div className="flex items-center gap-3 text-xs">
                                          <div className="flex items-center gap-1.5">
                                            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="font-medium text-foreground">
                                              {link.postData.ups && link.postData.ups >= 1000
                                                ? `${(link.postData.ups / 1000).toFixed(1)}k`
                                                : (link.postData.ups || 0)}
                                            </span>
                                  </div>
                                          <div className="flex items-center gap-1.5">
                                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="font-medium text-foreground">
                                              {link.postData.num_comments && link.postData.num_comments >= 1000
                                                ? `${(link.postData.num_comments / 1000).toFixed(1)}k`
                                                : (link.postData.num_comments || 0)}
                                            </span>
                                    </div>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground">-</div>
                                )}
                                  </td>
                                  
                                  {/* Title column */}
                                    <td className="py-3 px-2 align-middle w-[250px]">
                                      <div className="text-sm font-medium text-foreground truncate" title={link.title || undefined}>
                                        {link.title?.replace(/\s*\[r\/[^\]]+\]\s*$/i, '').replace(/\s*\(r\/[^)]+\)\s*$/i, '').replace(/\s*r\/[^\s]+\s*$/i, '').replace(/:\s*$/, '').trim() || link.title}
                                        </div>
                                  </td>
                                  
                                    {/* Subreddit column */}
                                    <td className="py-3 px-2 align-middle w-[120px]">
                                      {subreddit ? (
                                        <div className="text-xs text-muted-foreground">
                                          r/{subreddit}
                                      </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">-</div>
                                )}
                                  </td>
                                  
                                    {/* Date column */}
                                    <td className="py-3 px-2 align-middle w-[120px]">
                                      {link.postData?.created_utc ? (
                                        <div className="text-xs text-muted-foreground">
                                          {formatTimeAgo(link.postData.created_utc)}
                                </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">-</div>
                                    )}
                                  </td>
                                  
                                  {/* Actions column */}
                                    <td className="py-3 px-2 align-middle w-[80px]">
                                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        {link.link && (
                                    <Button
                                      size="sm"
                                            variant="outline"
                                            className="text-xs p-1.5 h-7 w-7"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              window.open(link.link!, "_blank", "noopener,noreferrer");
                                            }}
                                            title="Visit link"
                                  >
                                            <ExternalLink className="h-3 w-3" />
                                      </Button>
                                        )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                          className="text-xs p-1.5 h-7 w-7"
                                        onClick={() => handleCloseClick(linkItem)}
                                        title="Close"
                                      >
                                          <Trash2 className="h-3 w-3" />
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
                        {distinctLeadsLinks.length > 0 && (
                          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-card">
                            <div className="text-xs text-muted-foreground">
                              Showing {(leadsPage - 1) * LEADS_ITEMS_PER_PAGE + 1} to{" "}
                              {Math.min(leadsPage * LEADS_ITEMS_PER_PAGE, distinctLeadsLinks.length)} of{" "}
                              {distinctLeadsLinks.length} posts
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLeadsPage((prev) => Math.max(1, prev - 1))}
                                disabled={leadsPage === 1}
                                className="text-xs h-7 px-2"
                              >
                                <ChevronLeft className="h-3 w-3" />
                                <span className="hidden sm:inline">Previous</span>
                              </Button>
                              <div className="text-xs text-foreground px-1">
                                Page {leadsPage} of {totalLeadsPages}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLeadsPage((prev) => Math.min(totalLeadsPages, prev + 1))}
                                disabled={leadsPage === totalLeadsPages}
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
                      ) : (
                    !isLoadingLeads && !Object.values(isLoadingLeadsLinks).some(Boolean) && (
                          <div className="flex items-center justify-center min-h-[400px]">
                          <p className="text-sm text-muted-foreground">
                          {keywords && keywords.length > 0
                            ? "No leads found. Click 'Refresh Leads' to get started."
                            : "Please add keywords in the Product tab first, then search for leads."}
                          </p>
                          </div>
                        )
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
          <div className="space-y-6 px-1">
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
        return null;
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
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-foreground break-words whitespace-normal">
                    {selectedDiscoveryPost.title?.replace(/:\s*r\/[^\s]+/i, '').trim() || "No title"}
                  </h3>
                  {selectedDiscoveryPost.postData?.created_utc && (
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(selectedDiscoveryPost.postData.created_utc)}
                    </p>
                  )}
                  {selectedDiscoveryPost.query && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Keyword: <span className="font-medium text-foreground">{selectedDiscoveryPost.query}</span>
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
            <div className="flex h-full flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pr-4 pb-40">
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
                  <div className="flex items-center gap-3 mb-3">
                    <label className="text-xs text-muted-foreground">Persona:</label>
                    <div className="flex items-center gap-2 border border-border rounded-md p-1">
                      <button
                        type="button"
                        onClick={() => setDrawerPersona("Founder")}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded transition-colors",
                          drawerPersona === "Founder"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Founder
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerPersona("User")}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded transition-colors",
                          drawerPersona === "User"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        User
                      </button>
                    </div>
                  </div>
                  <div className="border border-border rounded-md p-1">
                  <textarea
                    value={postTextareas[selectedDiscoveryPost.uniqueKey] || ""}
                    onChange={(e) => {
                      setPostTextareas((prev) => ({
                        ...prev,
                        [selectedDiscoveryPost.uniqueKey]: e.target.value,
                      }));
                    }}
                    placeholder="Add comment..."
                      className="w-full min-h-[160px] bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                  />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateComment(selectedDiscoveryPost, drawerPersona)}
                      disabled={postTextareas[selectedDiscoveryPost.uniqueKey]?.trim() === ""}
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

                </div>
              </div>
              </div>
              <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-end gap-3 sticky bottom-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDiscoveryDrawerVisible(false);
                    handleCloseClick(selectedDiscoveryPost);
                  }}
                >
                  Skip
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    const success = await handlePostClick(selectedDiscoveryPost);
                    if (success) {
                    setIsDiscoveryDrawerVisible(false);
                    }
                  }}
                  disabled={isPosting[selectedDiscoveryPost.uniqueKey] || !postTextareas[selectedDiscoveryPost.uniqueKey]?.trim()}
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
      {isDiscoverySettingsModalOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            onClick={() => setIsDiscoverySettingsModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  Discovery Settings
                </h3>
                <button
                  onClick={() => setIsDiscoverySettingsModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Persona
                  </label>
                  <div className="relative w-48" ref={personaDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsPersonaDropdownOpen(!isPersonaDropdownOpen)}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-sm text-foreground">
                        {discoveryPersona
                          ? discoveryPersona.charAt(0).toUpperCase() + discoveryPersona.slice(1)
                          : "Select persona..."}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {isPersonaDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
                        <div className="py-1">
                          {["user", "founder"].map((persona) => (
                            <button
                              key={persona}
                              type="button"
                              onClick={() => {
                                setDiscoveryPersona(persona);
                                setIsPersonaDropdownOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center px-3 py-2 text-sm hover:bg-muted"
                              )}
                            >
                              <span className="text-foreground">
                                {persona.charAt(0).toUpperCase() + persona.slice(1)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button
                  variant="default"
                  onClick={() => setIsDiscoverySettingsModalOpen(false)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {isBulkOperationsModalOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
            onClick={() => setIsBulkOperationsModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  Bulk Commenting <span className="text-sm text-muted-foreground font-normal">({bulkModalInitialCount} selected)</span>
                </h3>
                <button
                  onClick={() => setIsBulkOperationsModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Post as:
                  </label>
                  <div className="flex items-center gap-1 border border-border rounded-md p-1">
                    <button
                      type="button"
                      onClick={() => setBulkPersona("Founder")}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded transition-colors",
                        bulkPersona === "Founder"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Founder
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkPersona("User")}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded transition-colors",
                        bulkPersona === "User"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      User
                    </button>
                  </div>
                </div>
                {/* Scrollable list of selected leads */}
                <div className="max-h-[300px] overflow-y-auto border border-border rounded-md">
                  {/* Header */}
                  <div className="sticky top-0 bg-muted/50 border-b border-border px-3 py-2 flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-xs font-semibold text-foreground">Title</p>
                    </div>
                    <div className="shrink-0 w-[80px] flex justify-center">
                      <p className="text-xs font-semibold text-foreground text-left">Status</p>
                    </div>
                    <div className="shrink-0 w-[60px] text-center">
                      <p className="text-xs font-semibold text-foreground">Link</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {bulkModalLeads.map((leadItem) => {
                        const status = bulkOperationStatus[leadItem.uniqueKey] || "haven't started";
                        const cleanedTitle = (leadItem.title || "")
                          .replace(/\[r\/[^\]]+\]/gi, '')
                          .replace(/\(r\/[^)]+\)/gi, '')
                          .replace(/r\/[^\s]+/gi, '')
                          .replace(/:\s*$/, '')
                          .trim();
                        
                        return (
                          <div key={leadItem.uniqueKey} className="flex items-center justify-between px-3 h-12">
                            <div className="flex-1 min-w-0 pr-3">
                              <p className="text-xs font-medium text-foreground truncate" title={cleanedTitle}>
                                {cleanedTitle || "Untitled"}
                              </p>
                            </div>
                            <div className="shrink-0 w-[80px] flex justify-center">
                              <div className="text-left">
                                {status === "generating" || status === "posting" ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary inline-block" />
                                ) : status === "completed" ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 inline-block" />
                                ) : status === "error" ? (
                                  <X className="h-4 w-4 text-red-500 inline-block" />
                                ) : status === "haven't started" ? (
                                  <Circle className="h-4 w-4 text-muted-foreground inline-block" />
                                ) : (
                                  <div className="h-4 w-4 inline-block" />
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 w-[60px] text-center">
                              {leadItem.link ? (
                                <button
                                  onClick={() => window.open(leadItem.link || '', '_blank')}
                                  className="hover:scale-110 transition-transform cursor-pointer text-muted-foreground hover:text-foreground"
                                  title="Open link"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const completedCount = Object.values(bulkOperationStatus).filter(status => status === "completed").length;
                    const totalCount = bulkModalLeads.length;
                    if (isBulkPosting || completedCount > 0) {
                      return `${completedCount} / ${totalCount} posted`;
                    }
                    return null;
                  })()}
                </div>
                <Button
                  variant="default"
                  onClick={() => {
                    if (isBulkPosting) {
                      // If posting is in progress, do nothing (button is disabled)
                      return;
                    }
                    const allCompleted = Object.values(bulkOperationStatus).every(status => status === "completed" || status === "error");
                    if (allCompleted && Object.keys(bulkOperationStatus).length > 0) {
                      // Close modal if all are completed
                      setIsBulkOperationsModalOpen(false);
                      // Reset states
                      setBulkOperationStatus({});
                      setBulkGeneratedComments({});
                      setIsBulkPosting(false);
                    } else {
                      // Start posting
                      handleBulkComment();
                    }
                  }}
                  disabled={isBulkPosting}
                >
                  {(() => {
                    const allCompleted = Object.values(bulkOperationStatus).every(status => status === "completed" || status === "error");
                    if (allCompleted && Object.keys(bulkOperationStatus).length > 0) {
                      return "Close";
                    }
                    if (isBulkPosting) {
                      return "Posting...";
                    }
                    return "Post Comment";
                  })()}
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
                      You've reached your weekly limit of 30 Free Credits. Upgrade to Premium to get 10,000 Free Credits per month and never worry about limits again.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You have {upgradeModalContext.remaining} Free Credits remaining this week. Upgrade to Premium for 10,000 Free Credits per month and unlock more features.
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
                        <span>30 Free Credits</span>
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
                        <span>10,000 Free Credits</span>
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
      {showNoKeywordsModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
            onClick={() => setShowNoKeywordsModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-foreground">
                    No Keywords Found
                  </h3>
                  <button
                    onClick={() => setShowNoKeywordsModal(false)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-6">
                <p className="text-sm text-muted-foreground mb-6">
                  You need to add keywords to search for leads. Keywords help us find relevant Reddit posts that match your product or service.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowNoKeywordsModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setShowNoKeywordsModal(false);
                      setActiveTab("product");
                    }}
                  >
                    Add Keywords
                  </Button>
                </div>
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

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingModalOpen}
        onComplete={() => {
          setIsOnboardingModalOpen(false);
          setOnboardingCompleted(true);
        }}
        onClose={() => {
          setIsOnboardingModalOpen(false);
          // Don't mark as completed if user closes without finishing
        }}
      />
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

