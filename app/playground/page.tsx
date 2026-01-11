"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense, useTransition, type ReactNode } from "react";
import { ExternalLink, X, Loader2, CheckCircle2, Send, Trash2, ChevronLeft, ChevronRight, Settings, ChevronDown, Plus, ArrowUp, MessageSquare, CheckSquare, Check, Circle, Package, Hash, Users, Info, Bell } from "lucide-react";
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

const normalizeUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') {
    return '';
  }
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
    // leadsLinks will be saved to localStorage (was previously skipped to avoid quota issues)
    // But user wants leads to persist across page refreshes
    
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
  const [productBenefits, setProductBenefits] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [originalProductDetails, setOriginalProductDetails] = useState<{
    productName: string;
    website: string;
    productDescription: string;
    productBenefits: string;
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
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);
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
  const [upgradeModalContext, setUpgradeModalContext] = useState<{ limitReached?: boolean; remaining?: number; selectedCount?: number; maxCount?: number } | null>(null);
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
    autoPilot?: boolean; // Whether this post was created by auto-pilot
  }
  const [analyticsPosts, setAnalyticsPosts] = useState<AnalyticsPost[]>([]);
  const [autoPilotPosts, setAutoPilotPosts] = useState<AnalyticsPost[]>([]);
  const [analyticsFilter, setAnalyticsFilter] = useState<"posted" | "skipped" | "failed">("posted");
  const [autoPilotFilter, setAutoPilotFilter] = useState<"all" | "auto-pilot" | "manual">("all");
  const [isAutoPilotFilterDropdownOpen, setIsAutoPilotFilterDropdownOpen] = useState(false);
  const autoPilotFilterDropdownRef = useRef<HTMLDivElement>(null);
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
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [engagementFilter, setEngagementFilter] = useState<"all" | "notifications" | "messages">("all");
  const [isDiscoveryDrawerVisible, setIsDiscoveryDrawerVisible] = useState(false);
  const [drawerPersona, setDrawerPersona] = useState<"Founder" | "User">("Founder");
  const [subredditPromotionStatus, setSubredditPromotionStatus] = useState<{ allowsPromotion: boolean | null; isLoading: boolean }>({ allowsPromotion: null, isLoading: false });
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const DISCOVERY_ITEMS_PER_PAGE = 20;
  const [isSavingProductDetails, setIsSavingProductDetails] = useState(false);
  const [isLoadingProductDetails, setIsLoadingProductDetails] = useState(false);
  const [isGeneratingProductDescription, setIsGeneratingProductDescription] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [productDetailsFromDb, setProductDetailsFromDb] = useState<{ link?: string; productName?: string; productDescription?: string; keywords?: string } | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "basic" | "premium" | null>(null);
  const [leadsLinks, setLeadsLinks] = useState<Record<string, Array<{ title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }>>>({});
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [lastLeadsSyncTime, setLastLeadsSyncTime] = useState<Date | null>(null);
  const [isLoadingLeadsLinks, setIsLoadingLeadsLinks] = useState<Record<string, boolean>>({});
  const distinctLeadsLinksRef = useRef<Array<any>>([]);
  const [leadsDataVersion, setLeadsDataVersion] = useState(0); // Force re-computation of distinctLeadsLinks
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsSortBy, setLeadsSortBy] = useState<"relevance" | "date-desc" | "date-asc" | "upvotes-desc" | "upvotes-asc" | "comments-desc" | "comments-asc" | "title-asc" | "title-desc">("date-desc");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [isAnalyticsFilterDropdownOpen, setIsAnalyticsFilterDropdownOpen] = useState(false);
  const analyticsFilterDropdownRef = useRef<HTMLDivElement>(null);
  const leadsTableScrollRef = useRef<HTMLDivElement>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [leadsFilterSignals, setLeadsFilterSignals] = useState<Record<string, "YES" | "MAYBE" | "NO">>({});
  const [leadsSignalFilter, setLeadsSignalFilter] = useState<"all" | "strong" | "partial">("all");
  const [isBulkOperationsModalOpen, setIsBulkOperationsModalOpen] = useState(false);
  const [syncUsage, setSyncUsage] = useState<{ syncCounter: number; maxSyncsPerDay: number; nextSyncReset: string | null } | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [showNoKeywordsModal, setShowNoKeywordsModal] = useState(false);
  const [showNoRowsSelectedModal, setShowNoRowsSelectedModal] = useState(false);
  const [bulkPersona, setBulkPersona] = useState<"Founder" | "User">("Founder");
  const [showProductModal, setShowProductModal] = useState(false);
  const [showKeywordsModal, setShowKeywordsModal] = useState(false);
  const [showSubredditsModal, setShowSubredditsModal] = useState(false);
  const [recommendedKeywordsModal, setRecommendedKeywordsModal] = useState<string[]>([]);
  const recommendedKeywordsModalScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeftKeywordsModal, setCanScrollLeftKeywordsModal] = useState(false);
  const [canScrollRightKeywordsModal, setCanScrollRightKeywordsModal] = useState(false);
  const [recommendedSubredditsModal, setRecommendedSubredditsModal] = useState<Array<{ name: string; count: number; subscribers?: number }>>([]);
  const [isLoadingSubredditRecommendations, setIsLoadingSubredditRecommendations] = useState(false);
  const recommendedSubredditsModalScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeftSubredditsModal, setCanScrollLeftSubredditsModal] = useState(false);
  const [canScrollRightSubredditsModal, setCanScrollRightSubredditsModal] = useState(false);
  const [bulkOperationStatus, setBulkOperationStatus] = useState<Record<string, "haven't started" | "generating" | "posting" | "completed" | "error">>({});
  const [bulkGeneratedComments, setBulkGeneratedComments] = useState<Record<string, string>>({});
  const [bulkModalLeads, setBulkModalLeads] = useState<Array<typeof distinctLeadsLinks[number]>>([]);
  const [bulkModalInitialCount, setBulkModalInitialCount] = useState(0);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [isAutoPilotEnabled, setIsAutoPilotEnabled] = useState(false);
  const [isLoadingAutoPilot, setIsLoadingAutoPilot] = useState(false);
  const [showAutoPilotModal, setShowAutoPilotModal] = useState(false);
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
    return analyticsPosts.filter((post) => {
      // Filter by status
      if (post.status !== analyticsFilter) return false;
      
      // Filter by auto-pilot
      if (autoPilotFilter === "auto-pilot") {
        return post.autoPilot === true;
      } else if (autoPilotFilter === "manual") {
        return post.autoPilot === false || !post.autoPilot;
      }
      
      // "all" - no additional filtering
      return true;
    });
  }, [analyticsPosts, analyticsFilter, autoPilotFilter]);

  // Calculate counts for analytics filter
  const analyticsFilterCounts = useMemo(() => {
    const filteredByStatus = analyticsPosts.filter(post => post.status === analyticsFilter);
    return {
      posted: analyticsPosts.filter(post => post.status === "posted").length,
      skipped: analyticsPosts.filter(post => post.status === "skipped").length,
      failed: analyticsPosts.filter(post => post.status === "failed").length,
      autoPilot: filteredByStatus.filter(post => post.autoPilot === true).length,
      manual: filteredByStatus.filter(post => post.autoPilot === false || !post.autoPilot).length,
    };
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
          } else {
            setIsRedditConnected(false);
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

  // Refresh Reddit connection status when redirected back from OAuth
  useEffect(() => {
    const redditConnected = searchParams?.get("reddit_connected");
    if (redditConnected === "success" && status === "authenticated" && session?.user?.email) {
      // Refresh the connection status
      const checkRedditConnection = async () => {
        try {
          const response = await fetch("/api/reddit/status");
          if (response.ok) {
            const data = await response.json();
            setIsRedditConnected(data.connected);
          } else {
            setIsRedditConnected(false);
          }
        } catch (error) {
          console.error("🔗 Error checking Reddit connection status after OAuth:", error);
          setIsRedditConnected(false);
        }
      };

      checkRedditConnection();

      // Clean up the query parameter from URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete("reddit_connected");
      const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
      router.replace(newUrl);
    }
  }, [searchParams, status, session, router]);

  // Load product details function (reusable)
  const loadProductDetails = useCallback(async () => {
    if (!session?.user?.email) return;
    
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
          if (data.productDetails.productBenefits) {
            setProductBenefits(data.productDetails.productBenefits);
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
            productBenefits: data.productDetails.productBenefits || "",
                keywords: loadedKeywords,
              });
            } else {
              setProductDetailsFromDb(null);
              setOriginalProductDetails({
                productName: "",
                website: "",
                productDescription: "",
            productBenefits: "",
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
        productBenefits: "",
            keywords: [],
          });
        }
  }, [session?.user?.email]);

  // Load auto-pilot status
  useEffect(() => {
    if (!session?.user?.email) return;
    
    const loadAutoPilotStatus = async () => {
      try {
        const response = await fetch("/api/user/auto-pilot");
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setIsAutoPilotEnabled(data.autoPilotEnabled || false);
          }
        }
      } catch (error) {
        console.error("Error loading auto-pilot status:", error);
      }
    };
    
    loadAutoPilotStatus();
  }, [session?.user?.email]);
      
  // Load product details when authenticated (for use in Discovery page)
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      loadProductDetails();
    }
  }, [status, session, loadProductDetails]);

  // Reload product details when onboarding completes
  useEffect(() => {
    if (onboardingCompleted === true && status === "authenticated" && session?.user?.email) {
      // Small delay to ensure backend has saved the data
      setTimeout(() => {
        loadProductDetails();
      }, 500);
    }
  }, [onboardingCompleted, status, session, loadProductDetails]);

  // Load user plan for premium feature checks
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const loadUserPlan = async () => {
        try {
          const response = await fetch("/api/usage");
          if (response.ok) {
            const data = await response.json();
            // Normalize plan value (handle migration from old plan names)
            const rawPlan = (data.plan || session?.user?.plan || "free") as "free" | "basic" | "premium" | "starter" | "pro";
            let normalizedPlan: "free" | "basic" | "premium" = "free";
            if (rawPlan === "starter") {
              normalizedPlan = "basic";
            } else if (rawPlan === "pro") {
              normalizedPlan = "premium";
            } else if (rawPlan === "basic" || rawPlan === "premium" || rawPlan === "free") {
              normalizedPlan = rawPlan;
            }
            setUserPlan(normalizedPlan);
          } else {
            // Fallback to session plan with migration
            const fallbackPlan = session?.user?.plan as "free" | "basic" | "premium" | "starter" | "pro" | undefined;
            let normalizedPlan: "free" | "basic" | "premium" = "free";
            if (fallbackPlan === "starter") {
              normalizedPlan = "basic";
            } else if (fallbackPlan === "pro") {
              normalizedPlan = "premium";
            } else if (fallbackPlan === "basic" || fallbackPlan === "premium" || fallbackPlan === "free") {
              normalizedPlan = fallbackPlan;
            }
            setUserPlan(normalizedPlan);
          }
        } catch (error) {
          console.error("Error loading user plan:", error);
          // Fallback to session plan with migration
          const fallbackPlan = session?.user?.plan as "free" | "basic" | "premium" | "starter" | "pro" | undefined;
          let normalizedPlan: "free" | "basic" | "premium" = "free";
          if (fallbackPlan === "starter") {
            normalizedPlan = "basic";
          } else if (fallbackPlan === "pro") {
            normalizedPlan = "premium";
          } else if (fallbackPlan === "basic" || fallbackPlan === "premium" || fallbackPlan === "free") {
            normalizedPlan = fallbackPlan;
          }
          setUserPlan(normalizedPlan);
        }
      };

      loadUserPlan();
    } else {
      setUserPlan(null);
    }
  }, [status, session]);

  // Check scroll state for recommended keywords modal
  useEffect(() => {
    if (recommendedKeywordsModal.length > 0 && recommendedKeywordsModalScrollRef.current) {
      const checkScrollState = () => {
        if (recommendedKeywordsModalScrollRef.current) {
          const { scrollLeft, scrollWidth, clientWidth } = recommendedKeywordsModalScrollRef.current;
          setCanScrollLeftKeywordsModal(scrollLeft > 0);
          setCanScrollRightKeywordsModal(scrollLeft < scrollWidth - clientWidth - 1);
        }
      };
      
      // Check immediately
      checkScrollState();
      
      // Also check on window resize
      window.addEventListener('resize', checkScrollState);
      return () => window.removeEventListener('resize', checkScrollState);
    }
  }, [recommendedKeywordsModal.length]);

  // Check scroll state for recommended subreddits modal
  useEffect(() => {
    if (recommendedSubredditsModal.length > 0 && recommendedSubredditsModalScrollRef.current) {
      const checkScrollState = () => {
        if (recommendedSubredditsModalScrollRef.current) {
          const { scrollLeft, scrollWidth, clientWidth } = recommendedSubredditsModalScrollRef.current;
          setCanScrollLeftSubredditsModal(scrollLeft > 0);
          setCanScrollRightSubredditsModal(scrollLeft < scrollWidth - clientWidth - 1);
        }
      };
      
      // Check immediately
      checkScrollState();
      
      // Also check on window resize
      window.addEventListener('resize', checkScrollState);
      return () => window.removeEventListener('resize', checkScrollState);
    }
  }, [recommendedSubredditsModal.length]);

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

  // Load inbox messages when Engagement tab is active
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email && activeTab === "engagement") {
      setIsLoadingInbox(true);
      const loadInbox = async () => {
        try {
          const response = await fetch("/api/reddit/inbox");
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.data?.children) {
              setInboxMessages(data.data.data.children);
            } else {
              setInboxMessages([]);
            }
          } else {
            setInboxMessages([]);
          }
        } catch (error) {
          console.error("Error loading inbox:", error);
          setInboxMessages([]);
        } finally {
          setIsLoadingInbox(false);
        }
      };

      loadInbox();
    } else {
      setInboxMessages([]);
    }
  }, [status, session, activeTab]);

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
              if (data.productDetails.productBenefits) {
                setProductBenefits(data.productDetails.productBenefits);
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
                productBenefits: data.productDetails.productBenefits || "",
                keywords: loadedKeywords,
              });
            } else {
              setOriginalProductDetails({
                productName: "",
                website: "",
                productDescription: "",
                productBenefits: "",
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
            productBenefits: "",
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
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (analyticsFilterDropdownRef.current && !analyticsFilterDropdownRef.current.contains(event.target as Node)) {
        setIsAnalyticsFilterDropdownOpen(false);
      }
      if (autoPilotFilterDropdownRef.current && !autoPilotFilterDropdownRef.current.contains(event.target as Node)) {
        setIsAutoPilotFilterDropdownOpen(false);
      }
    };

    if (isSortDropdownOpen || isFilterDropdownOpen || isAnalyticsFilterDropdownOpen || isAutoPilotFilterDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSortDropdownOpen, isFilterDropdownOpen]);

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

    // Clean up old cache entries to reduce localStorage usage
    // This runs once to convert old full RedditPost objects to minimal format
    try {
      const cachePrefix = "redditPost_";
      const keysToClean: string[] = [];

      // Find all cache keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(cachePrefix)) {
          keysToClean.push(key);
        }
      }

      // Clean up each cache entry
      keysToClean.forEach((key) => {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.postData && typeof parsed.postData === 'object') {
              // Check if it's the old format (has many fields)
              const hasOldFormat = parsed.postData.approved_at_utc !== undefined ||
                parsed.postData.subreddit !== undefined ||
                parsed.postData.author_fullname !== undefined;

              if (hasOldFormat) {
                // Convert to minimal format
                const minimalPostData = {
                  ups: parsed.postData.ups || 0,
                  num_comments: parsed.postData.num_comments || 0,
                  created_utc: parsed.postData.created_utc || null,
                  name: parsed.postData.name || null,
                };

                const cleanedData = {
                  selftext: parsed.selftext || null,
                  postData: minimalPostData,
                };

                localStorage.setItem(key, JSON.stringify(cleanedData));
              }
            }
          }
        } catch (e) {
          console.error(`Error cleaning cache entry ${key}:`, e);
        }
      });
    } catch (e) {
      console.error("Error cleaning cache entries:", e);
    }

    // Restore leadsLinks from localStorage if it exists and matches the current user
    try {
      const savedLeadsLinksUserEmail = localStorage.getItem("leadsLinksUserEmail");
    const currentUserEmail = session?.user?.email?.toLowerCase();
    
      // Only restore if the saved email matches the current user's email
      if (savedLeadsLinksUserEmail === currentUserEmail) {
        // Check if a sync was in progress when page was refreshed
        const syncInProgress = localStorage.getItem("syncLeadsInProgress");
        if (syncInProgress === "true") {
          // Sync was interrupted - warn user and clear incomplete data
          console.warn("[Sync Leads] Previous sync was interrupted. Clearing incomplete data.");
          try {
        localStorage.removeItem("leadsLinks");
        localStorage.removeItem("leadsLinksUserEmail");
            localStorage.removeItem("leadsFilterSignals");
            localStorage.removeItem("syncLeadsInProgress");
            localStorage.removeItem("newLeadsSinceLastSync");
            // Note: We can't show toast here because session might not be ready yet
            // The toast will be shown after a delay to ensure session is ready
            setTimeout(() => {
              showToast("Previous sync was interrupted. Please sync again.", { variant: "error" });
            }, 1000);
          } catch (e) {
            console.error("Error clearing incomplete sync data:", e);
          }
        } else {
          // Sync completed normally, restore data
          const savedLeadsLinks = localStorage.getItem("leadsLinks");
    if (savedLeadsLinks) {
            try {
              const parsed = JSON.parse(savedLeadsLinks);
              if (parsed && typeof parsed === 'object') {
                setLeadsLinks(parsed);
              }
            } catch (parseError) {
              console.error("Error parsing saved leadsLinks:", parseError);
              // Clear invalid data
        localStorage.removeItem("leadsLinks");
          localStorage.removeItem("leadsLinksUserEmail");
            }
          }
        
          // Also restore filter signals (only if sync completed normally)
          try {
            const savedSignals = localStorage.getItem("leadsFilterSignals");
            if (savedSignals) {
              const parsedSignals = JSON.parse(savedSignals);
              if (parsedSignals && typeof parsedSignals === 'object') {
                setLeadsFilterSignals(parsedSignals);
              }
            }
          } catch (parseError) {
            console.error("Error parsing saved leadsFilterSignals:", parseError);
            localStorage.removeItem("leadsFilterSignals");
          }

          // Also restore last sync time (only if sync completed normally)
          try {
            const savedSyncTime = localStorage.getItem("lastLeadsSyncTime");
            if (savedSyncTime) {
              const parsedTime = new Date(savedSyncTime);
              if (!isNaN(parsedTime.getTime())) {
                setLastLeadsSyncTime(parsedTime);
              }
            }
          } catch (parseError) {
            console.error("Error parsing saved lastLeadsSyncTime:", parseError);
            localStorage.removeItem("lastLeadsSyncTime");
          }
        }
      } else if (savedLeadsLinksUserEmail && currentUserEmail) {
        // Different user, clear the old data
        localStorage.removeItem("leadsLinks");
        localStorage.removeItem("leadsLinksUserEmail");
        localStorage.removeItem("leadsFilterSignals");
      }
        } catch (e) {
      console.error("Error restoring leadsLinks from localStorage:", e);
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
                postData: post.postData ? { ...post.postData, autoPilot: post.autoPilot || false } : null,
                status: normalizedStatus,
                postedAt: new Date(post.createdAt).getTime(),
                notes: notesValue,
                comment: commentValue,
                autoPilot: post.autoPilot || false,
              };
            });
            setAnalyticsPosts(convertedPosts);
            // Filter auto-pilot posts
            const autoPilotOnly = convertedPosts.filter((post: AnalyticsPost) => {
              return post.postData && (post.postData as any).autoPilot === true;
            });
            setAutoPilotPosts(autoPilotOnly);
          } else {
            setAnalyticsPosts([]);
            setAutoPilotPosts([]);
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
        // Extract subreddit name from postData or link
        let subredditName: string | undefined = undefined;
        if (linkItem.postData?.subreddit) {
          subredditName = linkItem.postData.subreddit;
        } else if (linkItem.postData?.subreddit_name_prefixed) {
          subredditName = linkItem.postData.subreddit_name_prefixed.replace(/^r\//, "");
        } else if (linkItem.link) {
          const subredditMatch = linkItem.link.match(/reddit\.com\/r\/([^/]+)/);
          if (subredditMatch) {
            subredditName = subredditMatch[1];
          }
        }
        
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
            subreddit: subredditName,
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

  // Fetch leads based on keywords
  const fetchLeadsForKeyword = async (keyword: string, resultsPerQuery: number = 20) => {
    setIsLoadingLeadsLinks((prev) => ({ ...prev, [keyword]: true }));

    // Google Custom Search already has site:reddit.com configured in the CSE, so no need to append it
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
        // Use functional state update to avoid race conditions when multiple fetches run in parallel
        setLeadsLinks((prev) => {
          // Use prev (most up-to-date React state) for merging
          const currentState = prev;

        // Merge new results with existing results for this keyword, avoiding duplicates
          const existingLinksForKeyword = currentState[keyword] || [];
        const existingLinkUrls = new Set(existingLinksForKeyword.map((link: any) => link.link).filter(Boolean));

        // Only add new links that don't already exist (by URL)
        const newLinks = data.results.filter((link: any) => link.link && !existingLinkUrls.has(link.link));

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
          return updated;
        });
      }
    } catch (err) {
      console.error(`Error fetching leads for keyword "${keyword}":`, err);
    } finally {
      setIsLoadingLeadsLinks((prev) => ({ ...prev, [keyword]: false }));
    }
  };

  // Batch fetch minimal post stats for leads table (ups, num_comments, created_utc)
  // Full post data (selftext, full postData) will be fetched on-demand when drawer opens
  const batchFetchLeadsPostContent = async () => {
    // Read from localStorage first (source of truth after fetchLeadsForKeyword saves)
    // This ensures we get the latest leads including newly fetched ones
    let currentState: Record<string, any[]> = {};
    try {
      const saved = localStorage.getItem("leadsLinks");
      if (saved) {
        currentState = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading leadsLinks from localStorage:", e);
    }
    // Fallback to React state if localStorage is empty
    if (Object.keys(currentState).length === 0) {
      currentState = leadsLinks;
    }

    const allPostsNeedingFetch: Array<{ url: string; keyword: string; linkIndex: number; postFullname: string }> = [];

    // Collect all posts that need minimal stats OR selftext (only if postData is missing or incomplete, or selftext is missing)
    Object.entries(currentState).forEach(([keyword, links]) => {
      links.forEach((link, index) => {
        if (link.link) {
          // Check if we have minimal stats (ups, num_comments, created_utc)
          const hasMinimalStats = link.postData &&
            (link.postData.ups !== undefined || link.postData.num_comments !== undefined || link.postData.created_utc !== undefined);

          // Check cache for selftext
          const cached = getCachedPost(link.link);
          const hasSelftext = cached && cached.selftext !== undefined;

          if (!hasMinimalStats) {
            // Don't have minimal stats - check cache first
            if (cached && cached.postData) {
              // Extract minimal stats from cache
              const minimalPostData = {
                ups: cached.postData.ups || 0,
                num_comments: cached.postData.num_comments || 0,
                created_utc: cached.postData.created_utc || null,
                name: cached.postData.name || null, // Needed for posting comments
                is_self: cached.postData.is_self !== undefined ? cached.postData.is_self : null, // Needed for filtering self-posts
                title: cached.postData.title || null, // Include title from cache
              };

              // Update state with minimal stats and Reddit API title if available
            setLeadsLinks((prev) => {
              const updated = { ...prev };
              if (updated[keyword] && updated[keyword][index]) {
                updated[keyword][index] = {
                  ...updated[keyword][index],
                    postData: minimalPostData as RedditPost,
                    // Update title with Reddit API title from cache if available
                    title: cached.postData?.title || updated[keyword][index].title,
                  };
                }
                safeSetLocalStorage("leadsLinks", updated);
              return updated;
            });
              // Continue to check if we need to fetch selftext (even if we have minimal stats from cache)
            } else {
              // No minimal stats and no cache - need to fetch
              const urlMatch = link.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
              if (urlMatch) {
                const [, , postId] = urlMatch;
                const postFullname = `t3_${postId}`;
                allPostsNeedingFetch.push({ url: link.link, keyword, linkIndex: index, postFullname });
                setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [link.link!]: true }));
              }
              return; // Skip selftext check, already added to fetch list
          }
          }

          // If we have minimal stats but are missing selftext, also fetch
          if (hasMinimalStats && !hasSelftext) {
          const urlMatch = link.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
          if (urlMatch) {
            const [, , postId] = urlMatch;
            const postFullname = `t3_${postId}`;
            allPostsNeedingFetch.push({ url: link.link, keyword, linkIndex: index, postFullname });
            setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [link.link!]: true }));
          }
        }

          // If we have minimal stats AND selftext, but title is still Google snippet, update from cache if available
          if (hasMinimalStats && hasSelftext && cached && cached.postData && cached.postData.title) {
            // Check if current title looks like a Google snippet (shorter, might have "..." or different format)
            // Or simply update if we have Reddit API title in cache
            const redditTitle = cached.postData.title;
            const currentTitle = link.title;
            
            // Update title from cache if it exists and is different (likely Reddit API title is longer/more complete)
            if (redditTitle && redditTitle !== currentTitle) {
              setLeadsLinks((prev) => {
                const updated = { ...prev };
                if (updated[keyword] && updated[keyword][index]) {
                  updated[keyword][index] = {
                    ...updated[keyword][index],
                    title: redditTitle,
                  };
                }
                safeSetLocalStorage("leadsLinks", updated);
                return updated;
              });
            }
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

    // Fetch posts in batches using /api/reddit/post (concurrently, no delays)
    const BATCH_SIZE = 95; // Reddit API can handle up to 100, so 95 is safe

    // Split into batches
    const batches: Array<Array<{ url: string; keyword: string; linkIndex: number; postFullname: string }>> = [];
    for (let i = 0; i < allPostsNeedingFetch.length; i += BATCH_SIZE) {
      batches.push(allPostsNeedingFetch.slice(i, i + BATCH_SIZE));
    }

    // Accumulate all post data before updating state (so leads only show after all fetching completes)
    const postDataUpdates = new Map<string, { keyword: string; linkIndex: number; postData: any; title?: string | null }>();

    // Process all batches concurrently
    await Promise.all(
      batches.map(async (batch) => {
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
          
            // Process each post and accumulate data (don't update state yet)
          posts.forEach((child: { data: RedditPost }) => {
            const post: RedditPost = child.data;
            const postFullname = post.name; // e.g., "t3_abc123"
            const postInfo = postMap.get(postFullname);

            if (postInfo) {
              const { url, keyword, linkIndex } = postInfo;

                // Cache the full post (for on-demand fetching when drawer opens)
                // Ensure title is included in cached postData
              cachePost(url, { 
                    selftext: post.selftext || null,
                postData: {
                  ...post,
                  title: post.title || ""// Explicitly ensure title is included
                }
              });

                // Only save minimal stats (ups, num_comments, created_utc, name, is_self)
                const minimalPostData = {
                  ups: post.ups || 0,
                  num_comments: post.num_comments || 0,
                  created_utc: post.created_utc || null,
                  name: post.name || null, // Needed for posting comments
                  is_self: post.is_self !== undefined ? post.is_self : null, // Needed for filtering self-posts
                  title: post.title || null, // Include title from Reddit API
                };

                // Store update to apply later (including Reddit API title)
                postDataUpdates.set(`${keyword}:${linkIndex}`, {
                  keyword,
                  linkIndex,
                  postData: minimalPostData as RedditPost,
                  title: post.title || null, // Reddit API title
                });
            }
          });

            // Mark any posts that weren't returned as failed (clear loading state)
          batch.forEach(({ url, postFullname }) => {
            if (!posts.some((child: { data: RedditPost }) => child.data.name === postFullname)) {
              console.warn(`Post ${postFullname} not found in batch response`);
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
            }
          });
        } else {
            // If batch API fails, log error but don't fall back to individual calls (to keep it fast)
            console.warn(`Batch API failed for batch with ${batch.length} posts`);
            batch.forEach(({ url }) => {
              setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
                  });
                }
              } catch (error) {
          console.error("Error in batch fetch:", error);
          batch.forEach(({ url }) => {
                setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [url]: false }));
          });
              }
            })
          );


    // Update state once with all accumulated results (only after all batches complete)
    if (postDataUpdates.size > 0) {
                setLeadsLinks((prev) => {
                  const updated = { ...prev };
        postDataUpdates.forEach(({ keyword, linkIndex, postData, title }) => {
                  if (updated[keyword] && updated[keyword][linkIndex]) {
                    updated[keyword][linkIndex] = {
                      ...updated[keyword][linkIndex],
              postData: postData,
                      // Update title with Reddit API title if available
                      title: title || updated[keyword][linkIndex].title,
                    };
                  }
        });
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

      // Clear loading states for all fetched posts
      postDataUpdates.forEach(({ keyword, linkIndex }) => {
        const postInfo = allPostsNeedingFetch.find(
          (p) => p.keyword === keyword && p.linkIndex === linkIndex
        );
        if (postInfo) {
          setIsLoadingPostContent((prevLoading) => ({ ...prevLoading, [postInfo.url]: false }));
            }
      });
    }
  };

  // Fetch leads from subreddits for a keyword
  const fetchLeadsFromSubreddits = async (keyword: string, subredditsList: string[], limit: number = 15) => {
    if (!subredditsList || subredditsList.length === 0) {
      return;
    }

    // Process subreddit searches in batches to avoid rate limits (Reddit allows ~60 requests/minute for OAuth)
    const SUBREDDIT_SEARCH_BATCH_SIZE = 10; // Process 10 subreddits at a time
    const SUBREDDIT_SEARCH_DELAY_MS = 2000; // 2 second delay between batches

    for (let i = 0; i < subredditsList.length; i += SUBREDDIT_SEARCH_BATCH_SIZE) {
      const subredditBatch = subredditsList.slice(i, i + SUBREDDIT_SEARCH_BATCH_SIZE);

      const subredditPromises = subredditBatch.map(async (subreddit) => {
      try {
        const response = await fetch("/api/reddit/search-posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keyword: keyword,
            subreddit: subreddit,
              limit: limit,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`Error fetching posts from r/${subreddit} for keyword "${keyword}":`, errorData.error);
          return [];
        }

        const data = await response.json();
        if (data.results && Array.isArray(data.results)) {

          // Create a unique key for subreddit-based leads: "keyword:subreddit"
          const keywordSubredditKey = `${keyword}:${subreddit}`;

            // Use functional state update to avoid race conditions when multiple fetches run in parallel
            let newLinks: any[] = [];
            setLeadsLinks((prev) => {
              // Use prev (most up-to-date React state) for merging
              const currentState = prev;

              const currentExistingLinks = currentState[keywordSubredditKey] || [];
              const currentExistingLinkUrls = new Set(currentExistingLinks.map((link: any) => link.link).filter(Boolean));

              // Only add new links that don't already exist (recompute with latest state)
              const latestNewLinks = data.results.filter((link: any) => link.link && !currentExistingLinkUrls.has(link.link));
              newLinks = latestNewLinks; // Store for return value

              const mergedLinks = [...currentExistingLinks, ...latestNewLinks];

          const updated = {
                ...currentState,
            [keywordSubredditKey]: mergedLinks,
          };

              // Save to localStorage (no-op since we're not storing leadsLinks anymore)
          safeSetLocalStorage("leadsLinks", updated);
          if (session?.user?.email) {
            try {
              localStorage.setItem("leadsLinksUserEmail", session.user.email.toLowerCase());
            } catch (e) {
              console.error("Error saving leadsLinksUserEmail:", e);
            }
          }
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

      // Add delay between batches (except after the last batch)
      if (i + SUBREDDIT_SEARCH_BATCH_SIZE < subredditsList.length) {
        await new Promise(resolve => setTimeout(resolve, SUBREDDIT_SEARCH_DELAY_MS));
      }
    }
  };


  // Handle leads search
  const handleLeadsSearch = async () => {
    // If keywords state is empty, try reloading from database first
    if (!keywords || keywords.length === 0) {
      try {
        const response = await fetch("/api/user/product-details");
        if (response.ok) {
          const data = await response.json();
          let loadedKeywords: string[] = [];
          
          // Load keywords from the response
          if (data.keywords && Array.isArray(data.keywords)) {
            loadedKeywords = data.keywords;
          } else if (data.productDetails?.keywords) {
            loadedKeywords = typeof data.productDetails.keywords === 'string'
              ? data.productDetails.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k)
              : Array.isArray(data.productDetails.keywords)
                ? data.productDetails.keywords
                : [];
          }
          
          // If we found keywords, update state and continue
          if (loadedKeywords.length > 0) {
            setKeywords(loadedKeywords);
            // Continue with the sync (don't return)
          } else {
            // No keywords found, show modal
      setShowNoKeywordsModal(true);
      return;
          }
        } else {
          // API call failed, show modal
          setShowNoKeywordsModal(true);
          return;
        }
      } catch (error) {
        console.error("Error reloading product details:", error);
        setShowNoKeywordsModal(true);
        return;
      }
    }

    // Check sync limit
    try {
      const syncCheckResponse = await fetch("/api/usage");
      if (syncCheckResponse.ok) {
        const syncData = await syncCheckResponse.json();
        const syncCounter = syncData.syncCounter ?? 0;
        const maxSyncsPerDay = syncData.maxSyncsPerDay ?? 1;
        const plan = syncData.plan ?? "free";

        if (syncCounter >= maxSyncsPerDay) {
          if (plan === "free") {
            showToast(
              "You've used your one free sync. Upgrade to Basic or Premium to sync more leads.",
              { variant: "error" }
            );
          } else {
            showToast(
              `You've reached your daily sync limit of ${maxSyncsPerDay}. Please try again tomorrow.`,
              { variant: "error" }
            );
          }
          return;
        }
      }
    } catch (error) {
      console.error("Error checking sync limit:", error);
    }

    setIsLoadingLeads(true);
    setLeadsPage(1);

    // Mark sync as in progress in localStorage
    try {
      localStorage.setItem("syncLeadsInProgress", "true");
      localStorage.setItem("newLeadsSinceLastSync", "0");
    } catch (e) {
      console.error("Error setting sync in progress flag:", e);
    }

    // Get initial count of leads before sync
    const initialLeadsCount = Object.values(leadsLinks).flat().length;
    const initialLeadsUrls = new Set<string>();
    Object.values(leadsLinks).forEach((links: any[]) => {
      links.forEach((link: any) => {
        if (link?.link) {
          initialLeadsUrls.add(normalizeUrl(link.link));
        }
      });
    });

    try {
      /**
       * STEP 1 — Generate similar keywords
       */
      const allKeywordsSet = new Set<string>();
      keywords.forEach(k => allKeywordsSet.add(k.toLowerCase().trim()));

      await Promise.all(
        keywords.map(async (keyword) => {
          try {
            const res = await fetch("/api/openai/similar-keywords", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keyword })
            });

            if (!res.ok) return;
            const data = await res.json();
            if (data?.success && Array.isArray(data.keywords)) {
              data.keywords.forEach((k: string) =>
                allKeywordsSet.add(k.toLowerCase().trim())
              );
            }
          } catch (err) {
            console.error("Keyword expansion failed:", err);
          }
        })
      );

      const expandedKeywords = Array.from(allKeywordsSet);

      /**
       * STEP 2 — Google Custom Search
       */
      await Promise.all(
        expandedKeywords.map(keyword => fetchLeadsForKeyword(keyword, 20))
      );

      /**
       * STEP 3 — Fetch Reddit post content
       */
        await batchFetchLeadsPostContent();

      /**
       * STEP 4 — Build postsToFilter with post IDs
       */
      // Read current state - always read from localStorage first (source of truth after batchFetchLeadsPostContent)
      // since batchFetchLeadsPostContent saves to localStorage immediately
      let currentState: Record<string, any[]> = {};
      try {
        const saved = localStorage.getItem("leadsLinks");
        if (saved) {
          currentState = JSON.parse(saved);
        } else {
          // Fallback to React state if localStorage is empty
          currentState = leadsLinks;
        }
      } catch {
        // Fallback to React state if localStorage read fails
        currentState = leadsLinks;
      }

      const postsToFilter: Array<{
        postId: string;
        title: string;
        content: string;
        keyword: string;
        linkIndex: number;
        url: string;
      }> = [];

      const seenPostIds = new Set<string>();

      // Load existing filter signals from localStorage to avoid re-filtering
      let existingFilterSignals: Record<string, "YES" | "MAYBE" | "NO"> = {};
      try {
        const savedSignals = localStorage.getItem("leadsFilterSignals");
        if (savedSignals) {
          existingFilterSignals = JSON.parse(savedSignals);
        }
      } catch (e) {
        console.error("Error loading existing filter signals:", e);
      }

      Object.entries(currentState).forEach(([keyword, links]) => {
        links.forEach((link: any, index: number) => {
          if (!link?.link || !link?.title) return;

          const normalizedUrl = normalizeUrl(link.link);
          if (analyticsUrlSet.has(normalizedUrl)) return;

          // Extract Reddit post ID
          const postId = extractRedditPostId(link.link);
          if (!postId) {
            console.warn(`[Sync Leads] Could not extract post ID from: ${link.link}`);
            return;
          }

          if (seenPostIds.has(postId)) return;
          seenPostIds.add(postId);

          // Skip if this post already has a filter signal from a previous sync
          if (existingFilterSignals[normalizedUrl]) {
            return; // Already filtered, skip
          }

          const cached = getCachedPost(link.link);
          // Prioritize Reddit API title from cache (most reliable) or postData or updated link.title over Google snippet
          // Check cache first (has full Reddit API data), then check if link.title was updated by batchFetchLeadsPostContent,
          // then check postData, finally fallback to original link.title
          const redditTitleFromCache = cached?.postData?.title || null;
          const redditTitleFromState = link.title && link.title !== link.snippet ? link.title : null; // If title was updated, it won't match snippet
          const redditTitleFromPostData = link.postData?.title || null;
          const titleToUse = redditTitleFromCache || redditTitleFromState || redditTitleFromPostData || link.title;
          
          
          postsToFilter.push({
            postId,
            title: titleToUse,
            content: cached?.selftext || "",
            keyword,
            linkIndex: index,
            url: link.link
          });
        });
      });

      if (postsToFilter.length === 0) {
        setIsLoadingLeads(false);
        return;
      }

      /**
       * STEP 5 — CALL FILTER API WITH BATCHING (using post IDs)
       */
      const BATCH_SIZE = 100;
      const batches: Array<typeof postsToFilter> = [];

      // Split postsToFilter into batches of 100
      for (let i = 0; i < postsToFilter.length; i += BATCH_SIZE) {
        batches.push(postsToFilter.slice(i, i + BATCH_SIZE));
      }

      // Create a map to store postId -> verdict
      const verdictMap = new Map<string, string>();

      // Process all batches concurrently
      const batchPromises = batches.map(async (batch, batchIndex) => {
        try {

          const filterResponse = await fetch("/api/openai/filter-titles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              posts: batch.map(p => ({ id: p.postId, title: p.title })),
              product: productDescription
            })
          });

          if (!filterResponse.ok) {
            console.error(`[Sync Leads] Batch ${batchIndex + 1} failed with status ${filterResponse.status}`);
            batch.forEach(post => verdictMap.set(post.postId, 'NO'));
            return;
          }

          const filterData: { results?: Array<{ id: string; verdict: string }>; error?: string } = await filterResponse.json();

          if (filterData.error) {
            console.error(`[Sync Leads] Batch ${batchIndex + 1} error:`, filterData.error);
            batch.forEach(post => verdictMap.set(post.postId, 'NO'));
            return;
          }

          const batchResults = filterData.results ?? [];

          // Map results by post ID
          batchResults.forEach(result => {
            verdictMap.set(result.id, result.verdict);
          });

          // Handle any missing results
          batch.forEach(post => {
            if (!verdictMap.has(post.postId)) {
              console.warn(`[Sync Leads] Missing verdict for post ${post.postId}, defaulting to NO`);
              verdictMap.set(post.postId, 'NO');
            }
          });


    } catch (error) {
          console.error(`[Sync Leads] Batch ${batchIndex + 1} exception:`, error);
          batch.forEach(post => verdictMap.set(post.postId, 'NO'));
        }
      });

      // Wait for all batches to complete
      await Promise.all(batchPromises);

      /**
 * STEP 6 — Apply filtering using postId-based verdictMap
 */
      const filteredPosts = postsToFilter.filter(post => {
        const verdict = verdictMap.get(post.postId);
        return verdict === "YES" || verdict === "MAYBE";
      });

      /**
       * STEP 6.5 — Update leadsFilterSignals for badge display
       */
      // Merge new filter signals with existing ones (from previous syncs)
      const newFilterSignals: Record<string, "YES" | "MAYBE" | "NO"> = { ...existingFilterSignals };

      postsToFilter.forEach(post => {
        const verdict = verdictMap.get(post.postId);
        if (verdict === "YES" || verdict === "MAYBE" || verdict === "NO") {
          const normalizedUrl = normalizeUrl(post.url);
          newFilterSignals[normalizedUrl] = verdict;
        }
      });

      setLeadsFilterSignals(newFilterSignals);
      
      // Persist signals to localStorage
      try {
        localStorage.setItem("leadsFilterSignals", JSON.stringify(newFilterSignals));
      } catch (e) {
        console.error("Error saving leadsFilterSignals to localStorage:", e);
      }

      /**
       * STEP 7 — Update leadsLinks state (REMOVE rejected posts)
       */
      const updatedLeadsLinks: Record<string, any[]> = {};

      // Build a set of post IDs that passed the filter (from current sync)
      const approvedPostIds = new Set(filteredPosts.map(p => p.postId));

      // Also include posts that already have "YES" or "MAYBE" signals from previous syncs
      Object.entries(currentState).forEach(([keyword, links]) => {
        links.forEach((link: any) => {
          if (!link?.link) return;
          const normalizedUrl = normalizeUrl(link.link);
          const existingSignal = existingFilterSignals[normalizedUrl];
          if (existingSignal === "YES" || existingSignal === "MAYBE") {
            const postId = extractRedditPostId(link.link);
            if (postId) {
              approvedPostIds.add(postId);
            }
          }
        });
      });

      // Rebuild leadsLinks with only approved posts AND enrich with cached metadata
      Object.entries(currentState).forEach(([keyword, links]) => {
        const approvedLinks = links
          .filter((link: any) => {
            if (!link?.link) return false;
            const postId = extractRedditPostId(link.link);
            return postId && approvedPostIds.has(postId);
          })
          .map((link: any) => {
            // Get cached post data - always check cache to ensure we have the latest data
            const cached = getCachedPost(link.link);
            
            // Merge postData from link and cache, preferring the most complete version
            let postData = link.postData;
            
            // If cached data exists, merge it with link.postData (cache takes precedence for completeness)
            if (cached && cached.postData) {
              postData = {
                ups: cached.postData.ups !== undefined ? cached.postData.ups : (postData?.ups || 0),
                num_comments: cached.postData.num_comments !== undefined ? cached.postData.num_comments : (postData?.num_comments || 0),
                created_utc: cached.postData.created_utc !== undefined ? cached.postData.created_utc : (postData?.created_utc || null),
                name: cached.postData.name || postData?.name || null,
                is_self: cached.postData.is_self !== undefined ? cached.postData.is_self : (postData?.is_self !== undefined ? postData.is_self : null),
              } as RedditPost;
            } else if (!postData || (!postData.ups && !postData.num_comments && !postData.created_utc)) {
              // postData is missing or completely empty, set to null
              postData = null;
            }

            return {
              ...link,
              // Ensure postData is set
              postData: postData || null
            };
          });

        if (approvedLinks.length > 0) {
          updatedLeadsLinks[keyword] = approvedLinks;
        }
      });

      setLeadsLinks(updatedLeadsLinks);
      localStorage.setItem("leadsLinks", JSON.stringify(updatedLeadsLinks));
      
      // Force distinctLeadsLinks to re-compute with the updated postData
      setLeadsDataVersion(prev => prev + 1);

      // Calculate new posts added (posts that weren't in initial leadsLinks)
      const finalLeadsUrls = new Set<string>();
      Object.values(updatedLeadsLinks).forEach((links: any[]) => {
        links.forEach((link: any) => {
          if (link?.link) {
            finalLeadsUrls.add(normalizeUrl(link.link));
          }
        });
      });

      // Count new posts (in final but not in initial)
      let newPostsCount = 0;
      finalLeadsUrls.forEach((url) => {
        if (!initialLeadsUrls.has(url)) {
          newPostsCount++;
        }
      });

      // Console.log array of leads with title and id
      const leadsArray = Object.values(updatedLeadsLinks).flat().map((link: any) => {
        // Extract Reddit post ID from URL (format: https://reddit.com/r/.../comments/{postId}/...)
        let postId: string | null = null;
        if (link.link) {
          const match = link.link.match(/comments\/([^\/?#]+)/i);
          if (match && match[1]) {
            postId = match[1]; // Just the post ID, not the t3_ prefix
          }
        }
        
        const title = link.title || link.postData?.title || null;
        
        return {
          title,
          id: postId
        };
      });
      
      // Show toast with new posts count
      if (newPostsCount > 0) {
        showToast(`${newPostsCount} new post${newPostsCount === 1 ? '' : 's'} added`, { variant: "success" });
      }

      // Store new leads count in localStorage for display in stats card
      try {
        localStorage.setItem("newLeadsSinceLastSync", newPostsCount.toString());
      } catch (e) {
        console.error("Error saving newLeadsSinceLastSync:", e);
      }

      // Increment total leads generated in the database
      if (newPostsCount > 0) {
        try {
          await fetch("/api/usage/increment-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ count: newPostsCount }),
          });
        } catch (e) {
          console.error("Error incrementing total leads generated:", e);
        }
      }

      // Debug: Check if postData is populated
      const sampleLink = Object.values(updatedLeadsLinks)[0]?.[0];


      // Set last sync time and persist to localStorage
      const syncTime = new Date();
      setLastLeadsSyncTime(syncTime);
      try {
        localStorage.setItem("lastLeadsSyncTime", syncTime.toISOString());
      } catch (e) {
        console.error("Error saving lastLeadsSyncTime:", e);
      }

      // Increment sync counter after successful sync
      try {
        await fetch("/api/usage/increment-sync", { method: "POST" });
        refreshUsage(); // Refresh usage display
      } catch (syncError) {
        console.error("Error incrementing sync counter:", syncError);
        // Don't fail the whole operation if sync counter increment fails
      }

      // Mark sync as completed
      try {
        localStorage.removeItem("syncLeadsInProgress");
      } catch (e) {
        console.error("Error clearing sync in progress flag:", e);
      }
    } catch (error) {
      console.error("Error syncing leads:", error);
      showToast("Error fetching leads. Please try again.", { variant: "error" });
      
      // Clear sync in progress flag on error
      try {
        localStorage.removeItem("syncLeadsInProgress");
      } catch (e) {
        console.error("Error clearing sync in progress flag on error:", e);
      }
    } finally {
      // Set isLoadingLeads to false AFTER state update to ensure distinctLeadsLinks re-runs
      // with the latest leadsLinks state that includes postData
      setIsLoadingLeads(false);
    }
  };

  const extractRedditPostId = (url: string): string | null => {
    try {
      const match = url.match(/\/comments\/([a-z0-9]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };


  // Compute distinct leads links (similar to distinctLinks)
  // Freeze the count during loading to prevent count jumping
  const distinctLeadsLinks = useMemo(() => {
    // If loading leads, return previous result to prevent count jumping
    if (isLoadingLeads) {
      return distinctLeadsLinksRef.current;
    }
    
    // If analytics is still loading, freeze the count to prevent it from changing
    // when analyticsPosts loads and filters out posts that are already in analytics.
    // This ensures the count stays stable and doesn't jump from 679 to 604 after refresh.
    // We freeze if:
    // 1. Analytics is loading AND we have a previous result (to maintain stability)
    // 2. Analytics hasn't been fetched yet AND we have a previous result (to avoid showing wrong count on refresh)
    if ((isLoadingAnalytics || !analyticsFetchedRef.current) && distinctLeadsLinksRef.current.length > 0) {
      return distinctLeadsLinksRef.current;
    }

    // Separate Google search results (keys without colon) from subreddit search results (keys with colon)
    const googleSearchKeys: string[] = [];
    const subredditSearchKeys: string[] = [];

    Object.keys(leadsLinks).forEach(key => {
      if (key.includes(':')) {
        subredditSearchKeys.push(key);
      } else {
        googleSearchKeys.push(key);
      }
    });

    // Find the maximum number of results across all searches to know how many rounds to process
    const maxResults = Math.max(
      ...googleSearchKeys.map(key => leadsLinks[key]?.length || 0),
      ...subredditSearchKeys.map(key => leadsLinks[key]?.length || 0),
      0
    );

    // Round-robin: first result from all Google searches, then first from all subreddit searches,
    // then second from all Google searches, then second from all subreddit searches, etc.
    let globalIndex = 0;
    const allLinksWithKeyword: Array<any> = [];

    for (let resultIndex = 0; resultIndex < maxResults; resultIndex++) {
      // First, add result at this index from each Google search
      for (const key of googleSearchKeys) {
        const links = leadsLinks[key] || [];
        if (links[resultIndex]) {
          const link = links[resultIndex];
          const uniqueKey = `leads-${key}-${link.link || "no-link"}-${resultIndex}-${globalIndex}`;

          // Always check cache to ensure we have the most complete postData
          // Cache takes precedence for completeness, but merge with state data
          let postData = link.postData;
          if (link.link) {
            const cached = getCachedPost(link.link);
            if (cached && cached.postData) {
              // Merge cache with state data, preferring cache for completeness
              postData = {
                ups: cached.postData.ups !== undefined ? cached.postData.ups : (postData?.ups || 0),
                num_comments: cached.postData.num_comments !== undefined ? cached.postData.num_comments : (postData?.num_comments || 0),
                created_utc: cached.postData.created_utc !== undefined ? cached.postData.created_utc : (postData?.created_utc || null),
                name: cached.postData.name || postData?.name || null,
                is_self: cached.postData.is_self !== undefined ? cached.postData.is_self : (postData?.is_self !== undefined ? postData.is_self : null),
              } as RedditPost;
            } else if (!postData || (!postData.ups && !postData.num_comments && !postData.created_utc)) {
              // postData is missing or completely empty, set to null
              postData = null;
            }
          }

          const item = {
            ...link,
            postData: postData || null,
            query: key,
            keyword: key,
            subreddit: null,
            linkIndex: resultIndex,
            uniqueKey,
            order: globalIndex,
          };
          allLinksWithKeyword.push(item);
          globalIndex += 1;
        }
      }

      // Then, add result at this index from each subreddit search
      for (const key of subredditSearchKeys) {
        const links = leadsLinks[key] || [];
        if (links[resultIndex]) {
          const link = links[resultIndex];
          const [keyword, subreddit] = key.split(':');
          const uniqueKey = `leads-${key}-${link.link || "no-link"}-${resultIndex}-${globalIndex}`;

          // Always check cache to ensure we have the most complete postData
          // Cache takes precedence for completeness, but merge with state data
          let postData = link.postData;
          if (link.link) {
            const cached = getCachedPost(link.link);
            if (cached && cached.postData) {
              // Merge cache with state data, preferring cache for completeness
              postData = {
                ups: cached.postData.ups !== undefined ? cached.postData.ups : (postData?.ups || 0),
                num_comments: cached.postData.num_comments !== undefined ? cached.postData.num_comments : (postData?.num_comments || 0),
                created_utc: cached.postData.created_utc !== undefined ? cached.postData.created_utc : (postData?.created_utc || null),
                name: cached.postData.name || postData?.name || null,
                is_self: cached.postData.is_self !== undefined ? cached.postData.is_self : (postData?.is_self !== undefined ? postData.is_self : null),
              } as RedditPost;
            } else if (!postData || (!postData.ups && !postData.num_comments && !postData.created_utc)) {
              // postData is missing or completely empty, set to null
              postData = null;
            }
          }

          const item = {
            ...link,
            postData: postData || null,
            query: `${keyword} (r/${subreddit})`,
            keyword: keyword,
            subreddit: subreddit,
            linkIndex: resultIndex,
            uniqueKey,
            order: globalIndex,
          };
          allLinksWithKeyword.push(item);
          globalIndex += 1;
        }
      }
    }

    const sortedLinks = [...allLinksWithKeyword].sort((a, b) => {
      if (leadsSortBy === "relevance") {
        // Sort by order field to maintain round-robin relevance order
        return a.order - b.order;
      } else if (leadsSortBy === "date-desc" || leadsSortBy === "date-asc") {
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

      results.push(linkItem);
    }
    // Store the result in ref for use during loading
    distinctLeadsLinksRef.current = results;
    return results;
  }, [leadsLinks, analyticsUrlSet, leadsSortBy, isLoadingLeads, isLoadingAnalytics, leadsDataVersion]);

  // Calculate counts for Strong and Partial posts
  const signalCounts = useMemo(() => {
    let strongCount = 0;
    let partialCount = 0;
    
    distinctLeadsLinks.forEach((linkItem) => {
      if (!linkItem.link) return;
      const normalizedUrl = normalizeUrl(linkItem.link);
      const signal = leadsFilterSignals[normalizedUrl];
      
      if (signal === "YES") {
        strongCount++;
      } else if (signal === "MAYBE") {
        partialCount++;
      }
    });
    
    return { strongCount, partialCount };
  }, [distinctLeadsLinks, leadsFilterSignals]);

  // Filter distinctLeadsLinks by signal
  const filteredDistinctLeadsLinks = useMemo(() => {
    if (leadsSignalFilter === "all") {
      return distinctLeadsLinks;
    }
    
    return distinctLeadsLinks.filter((linkItem) => {
      if (!linkItem.link) return false;
      const normalizedUrl = normalizeUrl(linkItem.link);
      const signal = leadsFilterSignals[normalizedUrl];
      
      if (leadsSignalFilter === "strong") {
        return signal === "YES";
      } else if (leadsSignalFilter === "partial") {
        return signal === "MAYBE";
      }
      
      return true;
    });
  }, [distinctLeadsLinks, leadsSignalFilter, leadsFilterSignals]);

  // Paginated leads links
  const paginatedLeadsLinks = useMemo(() => {
    const startIndex = (leadsPage - 1) * LEADS_ITEMS_PER_PAGE;
    const endIndex = startIndex + LEADS_ITEMS_PER_PAGE;
    return filteredDistinctLeadsLinks.slice(startIndex, endIndex);
  }, [filteredDistinctLeadsLinks, leadsPage]);

  const totalLeadsPages = Math.ceil(filteredDistinctLeadsLinks.length / LEADS_ITEMS_PER_PAGE);

  // Log each page as an array of objects with title and content (selftext)
  // Fetches selftext from cache or API if not available
  useEffect(() => {
    if (paginatedLeadsLinks.length === 0) return;

    const fetchAndLogPageData = async () => {
      const pageDataPromises = paginatedLeadsLinks.map(async (linkItem) => {
        let content = linkItem.selftext || null;

        // If selftext is not available, try to get it from cache
        if (!content && linkItem.link) {
          const cached = getCachedPost(linkItem.link);
          if (cached && cached.selftext) {
            content = cached.selftext;
          } else if (cached && cached.postData && cached.postData.selftext) {
            content = cached.postData.selftext;
          } else if (linkItem.link) {
            // If not in cache, fetch from API
            try {
              const urlMatch = linkItem.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
              if (urlMatch) {
                const [, , postId] = urlMatch;
                const postFullname = `t3_${postId}`;

                const redditResponse = await fetch("/api/reddit/post", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ postIds: [postFullname] }),
                });

                if (redditResponse.ok) {
                  const redditData = await redditResponse.json();
                  const posts = redditData?.data?.children || [];

                  if (posts.length > 0) {
                    const post: RedditPost = posts[0].data;
                    content = post.selftext || null;
                    // Cache the full post for future use
                    cachePost(linkItem.link, { selftext: post.selftext || null, postData: post });
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching selftext for ${linkItem.link}:`, error);
            }
          }
        }

        return {
          title: linkItem.title || null,
          content: content,
        };
      });

      const pageData = await Promise.all(pageDataPromises);
    };

    fetchAndLogPageData();
  }, [paginatedLeadsLinks, leadsPage]);

  // Reset to page 1 when filter changes or when filteredDistinctLeadsLinks length changes
  useEffect(() => {
    setLeadsPage(1);
  }, [leadsSignalFilter]);

  // Reset to page 1 when filteredDistinctLeadsLinks changes (if current page is out of bounds)
  useEffect(() => {
    if (filteredDistinctLeadsLinks.length > 0) {
      const maxPage = Math.ceil(filteredDistinctLeadsLinks.length / LEADS_ITEMS_PER_PAGE);
      if (leadsPage > maxPage && maxPage > 0) {
        setLeadsPage(1);
      }
    }
  }, [filteredDistinctLeadsLinks.length, leadsPage]);

  // Fetch sync usage data
  useEffect(() => {
    const fetchSyncUsage = async () => {
      try {
        const response = await fetch("/api/usage");
        if (response.ok) {
          const data = await response.json();
          setSyncUsage({
            syncCounter: data.syncCounter ?? 0,
            maxSyncsPerDay: data.maxSyncsPerDay ?? 2,
            nextSyncReset: data.nextSyncReset ?? null,
          });
        }
      } catch (error) {
        console.error("Error fetching sync usage:", error);
      }
    };

    if (session?.user?.email) {
      fetchSyncUsage();
    }

    // Listen for usage refresh events
    const handleRefresh = () => {
      fetchSyncUsage();
    };

    window.addEventListener("refreshUsage", handleRefresh);
    return () => window.removeEventListener("refreshUsage", handleRefresh);
  }, [session?.user?.email]);

  // Update countdown timer every second
  useEffect(() => {
    if (!syncUsage?.nextSyncReset) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const resetTime = new Date(syncUsage.nextSyncReset!);
      const diff = resetTime.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown("");
        // Refresh usage data when countdown reaches 0
        window.dispatchEvent(new Event("refreshUsage"));
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [syncUsage?.nextSyncReset]);

  // Scroll to top of leads table when page changes
  useEffect(() => {
    if (leadsTableScrollRef.current) {
      leadsTableScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [leadsPage]);

  // Log selfText of first 50 posts
  useEffect(() => {
    const first50SelfTexts = distinctLinks.slice(0, 50).map(link => link.selftext || null);
  }, [distinctLinks]);

  // Log first 100 posts in leads table
  useEffect(() => {
    if (distinctLeadsLinks.length > 0) {
      const first100Leads = distinctLeadsLinks.slice(0, 100);
      const titles = first100Leads.map(post => post.title || 'No title');
    }
  }, [distinctLeadsLinks]);

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
    const sessionId = searchParams?.get("session_id");
    
    if (checkout === "success" && sessionId) {
      setShowCheckoutSuccessModal(true);
      
      // Verify checkout session and update plan if webhook hasn't processed yet
      const verifyAndUpdatePlan = async () => {
        try {
          const response = await fetch(`/api/stripe/verify-checkout?session_id=${sessionId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              // Refresh usage to get updated plan
      refreshUsage();
              // Reload page to refresh session with updated plan
      setTimeout(() => {
        window.location.reload();
              }, 500);
            } else {
              // If verification failed, still reload after delay in case webhook processes
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            }
          } else {
            // If API call failed, reload anyway
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        } catch (error) {
          console.error("Error verifying checkout:", error);
          // Still reload to check if webhook processed
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      };
      
      verifyAndUpdatePlan();
      
      // Clean up URL params
      const params = new URLSearchParams(searchParams.toString());
      params.delete("checkout");
      params.delete("session_id");
      const newQuery = params.toString();
      router.replace(`${pathname}${newQuery ? `?${newQuery}` : ""}`, { scroll: false });
    }
  }, [searchParams, router, pathname, refreshUsage]);

  // Handle portal return - sync subscription status from Stripe
  useEffect(() => {
    const portalReturn = searchParams?.get("portal_return");
    
    if (portalReturn === "true" && status === "authenticated" && session?.user?.email) {
      const syncSubscription = async () => {
        try {
          const response = await fetch("/api/stripe/sync-subscription", {
            method: "POST",
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("Subscription synced:", data);
            
            // Clean up URL params
            const params = new URLSearchParams(searchParams.toString());
            params.delete("portal_return");
            const newQuery = params.toString();
            router.replace(`${pathname}${newQuery ? `?${newQuery}` : ""}`, { scroll: false });
            
            // Reload page to refresh session with updated plan
            setTimeout(() => {
              window.location.reload();
            }, 500);
          } else {
            console.error("Failed to sync subscription");
            // Still reload after delay in case webhook processed
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        } catch (error) {
          console.error("Error syncing subscription:", error);
          // Still reload to check if webhook processed
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      };
      
      syncSubscription();
    }
  }, [searchParams, router, pathname, status, session]);

  // Handle tab query parameter to set active tab
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam && ["product", "dashboard", "analytics", "feedback", "pricing", "engagement"].includes(tabParam)) {
      setActiveTab(tabParam as "product" | "dashboard" | "analytics" | "feedback" | "pricing" | "engagement");
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

  // Helper function to cache post - stores minimal fields we actually use, including title
  const cachePost = (url: string, post: { selftext?: string | null; postData?: RedditPost | null }) => {
    try {
      const cacheKey = normalizeUrl(url);

      // Store the fields we actually use from postData, including title for filtering
      const minimalPostData = post.postData ? {
        ups: post.postData.ups || 0,
        num_comments: post.postData.num_comments || 0,
        created_utc: post.postData.created_utc || null,
        name: post.postData.name || null, // Needed for posting comments
        is_self: post.postData.is_self !== undefined ? post.postData.is_self : null, // Needed for filtering self-posts
        title: post.postData.title || null, // Include title from Reddit API for filtering
      } : null;

      const cachedData = {
        selftext: post.selftext || null,
        postData: minimalPostData,
      };

      localStorage.setItem(`redditPost_${cacheKey}`, JSON.stringify(cachedData));
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
      await processBatchFetch(allPostsNeedingFetch, deferStateUpdates);
    }
  };
  
  // Helper function to process batch fetching
  // If deferStateUpdates is true, only update localStorage and don't trigger React re-renders
  const processBatchFetch = async (
    allPostsNeedingFetch: Array<{ url: string; query: string; linkIndex: number; postFullname: string }>,
    deferStateUpdates: boolean = false
  ) => {
    if (allPostsNeedingFetch.length === 0) {
      return;
    }

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

    // Process each batch sequentially with delays and retry logic
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // Add delay between batches (except for the first one)
      if (batchIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
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

      } catch (dbError) {
        console.error("Error saving post to database:", dbError);
        // Don't fail the whole operation if DB save fails
      }

      // Refresh analytics from database after posting
      await refreshAnalytics();
      refreshUsage(); // Refresh leads stats card
    
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
        refreshUsage(); // Refresh leads stats card
      } catch (recordError) {
        console.error("Error recording failed analytics entry:", recordError);
      }
    } finally {
      setIsPosting((prev) => ({ ...prev, [linkKey]: false }));
    }
    return false;
  };

  // Handler for Generate Comment button
  const handleGenerateComment = async (linkItem: { uniqueKey: string; query: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }, persona?: string) => {
    await generateCommentForLink(linkItem, { force: true, showAlerts: true, persona: persona || "Founder" });
  };

  // Fetch full post data (selftext and full postData) when drawer opens
  const fetchFullPostDataForDrawer = async (linkItem: { uniqueKey: string; query?: string; title?: string | null; link?: string | null; snippet?: string | null; selftext?: string | null; postData?: RedditPost | null }) => {
    if (!linkItem.link) return;

    // Check if we already have full data (selftext or full postData with all fields)
    const hasFullData = linkItem.selftext || (linkItem.postData && linkItem.postData.selftext !== undefined);
    if (hasFullData) {
      return; // Already have full data, no need to fetch
    }

    // Check cache first
    const cached = getCachedPost(linkItem.link);
    if (cached && (cached.selftext || cached.postData)) {
      // Update selectedDiscoveryPost with cached data, including Reddit title
      setSelectedDiscoveryPost((prev) => {
        if (!prev || prev.uniqueKey !== linkItem.uniqueKey) return prev;
        return {
          ...prev,
          title: cached.postData?.title || prev.title, // Use Reddit API title if available
          selftext: cached.selftext || prev.selftext,
          postData: cached.postData || prev.postData,
        };
      });
      return; // Found in cache
    }

    // Fetch from Reddit API
    try {
      setIsLoadingPostContent((prev) => ({ ...prev, [linkItem.link!]: true }));

      const urlMatch = linkItem.link.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/\?]+)/);
      if (urlMatch) {
        const [, , postId] = urlMatch;
        const postFullname = `t3_${postId}`;

        const redditResponse = await fetch("/api/reddit/post", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ postIds: [postFullname] }),
        });

        if (redditResponse.ok) {
          const redditData = await redditResponse.json();
          const posts = redditData?.data?.children || [];

          if (posts.length > 0) {
            const post: RedditPost = posts[0].data;

            // Cache the full post
            cachePost(linkItem.link, { selftext: post.selftext || null, postData: post });

            // Update selectedDiscoveryPost with full data, including Reddit title
            setSelectedDiscoveryPost((prev) => {
              if (!prev || prev.uniqueKey !== linkItem.uniqueKey) return prev;
              return {
                ...prev,
                title: post.title || prev.title, // Use Reddit API title (full title, not truncated)
                selftext: post.selftext || null,
                postData: post,
              };
            });
          }
        } else {
          // Fallback to individual API call
          const fallbackResponse = await fetch(`/api/reddit?url=${encodeURIComponent(linkItem.link)}`);
          if (fallbackResponse.ok) {
            const redditData = await fallbackResponse.json();
            const post: RedditPost = redditData.post;

            // Cache the full post
            cachePost(linkItem.link, { selftext: post.selftext || null, postData: post });

            // Update selectedDiscoveryPost with full data, including Reddit title
            setSelectedDiscoveryPost((prev) => {
              if (!prev || prev.uniqueKey !== linkItem.uniqueKey) return prev;
              return {
                ...prev,
                title: post.title || prev.title, // Use Reddit API title (full title, not truncated)
                selftext: post.selftext || null,
                postData: post,
              };
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching full post data for ${linkItem.link}:`, error);
    } finally {
      setIsLoadingPostContent((prev) => {
        const newState = { ...prev };
        delete newState[linkItem.link!];
        return newState;
      });
    }
  };

  // Check subreddit promotion status by fetching rules and using OpenAI
  const checkSubredditPromotionStatus = async (subredditName: string) => {
    if (!subredditName) return;
    
    // Remove 'r/' prefix if present
    const cleanSubredditName = subredditName.replace(/^r\//, "").replace(/^r/, "");
    if (!cleanSubredditName) return;
    
    setSubredditPromotionStatus({ allowsPromotion: null, isLoading: true });
    
    try {
      // First, check if we have a cached result in the database
      const cachedResponse = await fetch(`/api/subreddit-rules/get?subreddit=${encodeURIComponent(cleanSubredditName)}`);
      if (cachedResponse.ok) {
        const cachedData = await cachedResponse.json();
        if (cachedData.rule && typeof cachedData.rule.allowPromoting === 'boolean') {
          // Found cached result, use it immediately and skip API calls
          setSubredditPromotionStatus({ 
            allowsPromotion: cachedData.rule.allowPromoting, 
            isLoading: false 
          });
          return; // Return early, no need to call Reddit API or OpenAI
        }
      }
      
      // No cached result found, fetch from Reddit API and analyze with OpenAI
      // Fetch subreddit rules
      const rulesResponse = await fetch(`/api/reddit/subreddit-rules?subreddit=${encodeURIComponent(cleanSubredditName)}`);
      
      if (!rulesResponse.ok) {
        console.error("Failed to fetch subreddit rules");
        setSubredditPromotionStatus({ allowsPromotion: null, isLoading: false });
        return;
      }
      
      const rulesData = await rulesResponse.json();
      
      // Extract all rule descriptions and combine them
      const allRules = rulesData.rules || [];
      const rulesText = allRules
        .map((rule: any) => rule.description || "")
        .filter((desc: string) => desc.trim().length > 0)
        .join("\n\n");
      
      if (!rulesText || rulesText.trim().length === 0) {
        // No rules found - default to allowing promotion
        setSubredditPromotionStatus({ allowsPromotion: true, isLoading: false });
        
        // Save the default result to the database
        try {
          await fetch("/api/subreddit-rules/save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subredditName: cleanSubredditName,
              allowPromoting: true,
            }),
          });
        } catch (saveError) {
          console.error("Error saving default subreddit rule to database:", saveError);
          // Don't fail the whole operation if save fails
        }
        return;
      }
      
      // Send to OpenAI check-subreddit-rules endpoint
      const checkResponse = await fetch("/api/openai/check-subreddit-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rules: rulesText,
        }),
      });
      
      if (!checkResponse.ok) {
        console.error("Failed to check subreddit promotion status");
        setSubredditPromotionStatus({ allowsPromotion: null, isLoading: false });
        return;
      }
      
      const checkData = await checkResponse.json();
      const allowsPromotion = checkData.allowsPromotion || false;
      
      setSubredditPromotionStatus({ 
        allowsPromotion, 
        isLoading: false 
      });
      
      // Save the result to the database
      try {
        await fetch("/api/subreddit-rules/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subredditName: cleanSubredditName,
            allowPromoting: allowsPromotion,
          }),
        });
      } catch (saveError) {
        console.error("Error saving subreddit rule to database:", saveError);
        // Don't fail the whole operation if save fails
      }
    } catch (error) {
      console.error("Error checking subreddit promotion status:", error);
      setSubredditPromotionStatus({ allowsPromotion: null, isLoading: false });
    }
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
          console.error(`[Bulk Operations] No post content for lead: ${leadItem.title || leadItem.link}`);
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        // Extract subreddit name from postData or link
        let subredditName: string | undefined = undefined;
        if (leadItem.postData?.subreddit) {
          subredditName = leadItem.postData.subreddit;
        } else if (leadItem.postData?.subreddit_name_prefixed) {
          subredditName = leadItem.postData.subreddit_name_prefixed.replace(/^r\//, "");
        } else if (leadItem.link) {
          const subredditMatch = leadItem.link.match(/reddit\.com\/r\/([^/]+)/);
          if (subredditMatch) {
            subredditName = subredditMatch[1];
          }
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
            subreddit: subredditName,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[Bulk Operations] Comment generation failed for "${leadItem.title || leadItem.link}":`, {
            status: response.status,
            statusText: response.statusText,
            error: errorData.error || errorData.message || "Unknown error"
          });
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const data = await response.json();
        if (data.error || !data.comments || data.comments.length === 0) {
          console.error(`[Bulk Operations] Invalid comment response for "${leadItem.title || leadItem.link}":`, {
            error: data.error,
            hasComments: !!data.comments,
            commentsLength: data.comments?.length || 0
          });
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const generatedComment = data.comments.join("\n\n");
        setBulkGeneratedComments(prev => ({ ...prev, [linkKey]: generatedComment }));

        // Step 2: Post comment
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "posting" }));

        if (!leadItem.postData?.name) {
          console.error(`[Bulk Operations] Missing postData.name for "${leadItem.title || leadItem.link}":`, {
            hasPostData: !!leadItem.postData,
            postDataName: leadItem.postData?.name,
            link: leadItem.link
          });
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const thingId = extractThingIdFromLink(leadItem.link || "");
        if (!thingId) {
          console.error(`[Bulk Operations] Failed to extract thing_id from link: "${leadItem.link}"`);
          setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
          return;
        }

        const postResponse = await fetch("/api/reddit/post-comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thing_id: thingId,
            text: generatedComment.trim(),
          }),
        });

        if (!postResponse.ok) {
          const errorData = await postResponse.json().catch(() => ({}));
          console.error(`[Bulk Operations] Failed to post comment for "${leadItem.title || leadItem.link}":`, {
            status: postResponse.status,
            statusText: postResponse.statusText,
            error: errorData.error || errorData.message || "Unknown error",
            thingId: thingId,
            link: leadItem.link
          });
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
        console.error(`[Bulk Operations] Unexpected error processing lead "${leadItem.title || leadItem.link}":`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          link: leadItem.link,
          title: leadItem.title
        });
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

  // Retry failed comments in bulk operations
  const handleRetryFailedComments = async () => {
    const failedLeads = bulkModalLeads.filter(
      leadItem => bulkOperationStatus[leadItem.uniqueKey] === "error"
    );

    if (failedLeads.length === 0) {
      showToast("No failed comments to retry");
      return;
    }

    // Set posting state to true
    setIsBulkPosting(true);

    // Reset status for failed leads to "haven't started" so they can be retried
    setBulkOperationStatus(prev => {
      const updated = { ...prev };
      failedLeads.forEach(leadItem => {
        updated[leadItem.uniqueKey] = "haven't started";
      });
      return updated;
    });

    // Process all failed leads asynchronously in parallel
    const ideaToUse = submittedProductIdea || currentProductIdea;
    const dbLink = productDetailsFromDb?.link || website;
    const dbProductDescription = productDetailsFromDb?.productDescription;
    const productIdeaToUse = dbProductDescription || ideaToUse;

    if (!productIdeaToUse || !dbLink) {
      showToast("Please enter your product details in the Product tab first.", { variant: "error" });
      setIsBulkPosting(false);
      return;
    }

    const processLead = async (leadItem: typeof failedLeads[number]) => {
      const linkKey = leadItem.uniqueKey;

      try {
        // Step 1: Generate comment (or use existing if available)
        setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "generating" }));

        let generatedComment = bulkGeneratedComments[linkKey];

        // If we don't have a generated comment, generate one
        if (!generatedComment) {
          const postContent = leadItem.selftext || leadItem.snippet || leadItem.title || "";
          if (!postContent) {
            setBulkOperationStatus(prev => ({ ...prev, [linkKey]: "error" }));
            return;
          }

          // Extract subreddit name from postData or link
          let subredditName: string | undefined = undefined;
          if (leadItem.postData?.subreddit) {
            subredditName = leadItem.postData.subreddit;
          } else if (leadItem.postData?.subreddit_name_prefixed) {
            subredditName = leadItem.postData.subreddit_name_prefixed.replace(/^r\//, "");
          } else if (leadItem.link) {
            const subredditMatch = leadItem.link.match(/reddit\.com\/r\/([^/]+)/);
            if (subredditMatch) {
              subredditName = subredditMatch[1];
            }
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
              subreddit: subredditName,
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

          generatedComment = data.comments.join("\n\n");
          setBulkGeneratedComments(prev => ({ ...prev, [linkKey]: generatedComment }));
        }

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

    // Process all failed leads in parallel
    await Promise.all(failedLeads.map(leadItem => processLead(leadItem)));
    
    // Refresh analytics and usage once after all operations complete
    await refreshAnalytics();
    refreshUsage();

    setIsBulkPosting(false);
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
    refreshUsage(); // Refresh leads stats card

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

  // Handler for bulk removing selected leads
  const handleBulkRemove = async () => {
    if (selectedLeads.size === 0) {
      showToast("No leads selected", { variant: "error" });
      return;
    }

    setIsBulkRemoving(true);
    const selectedLeadItems = distinctLeadsLinks.filter(link => selectedLeads.has(link.uniqueKey));
    let removedCount = 0;

    try {
      // Process each selected lead
      for (const leadItem of selectedLeadItems) {
        try {
          // Save to MongoDB with "skipped" status
          await fetch("/api/posts/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "skipped",
              query: leadItem.query,
              title: leadItem.title || null,
              link: leadItem.link || null,
              snippet: leadItem.snippet || null,
              selftext: leadItem.selftext || null,
              postData: leadItem.postData || null,
              comment: null,
              notes: "Bulk removed",
            }),
          });
          removedCount++;
        } catch (dbError) {
          console.error("Error saving skipped post to database:", dbError);
        }
      }

      // Remove all selected leads from leadsLinks state
      setLeadsLinks((prev) => {
        const updated = { ...prev };
        selectedLeadItems.forEach((leadItem) => {
          if (updated[leadItem.query]) {
            updated[leadItem.query] = updated[leadItem.query].filter((link) => link.link !== leadItem.link);
            if (updated[leadItem.query].length === 0) {
              delete updated[leadItem.query];
            }
          }
        });
        safeSetLocalStorage("leadsLinks", updated);
        return updated;
      });

      // Clear selection
      setSelectedLeads(new Set());

      // Refresh analytics
      await refreshAnalytics();
      refreshUsage();

      // Force distinctLeadsLinks to re-compute
      setLeadsDataVersion(prev => prev + 1);

      showToast(`${removedCount} lead${removedCount !== 1 ? 's' : ''} removed`, { variant: "success" });
    } catch (error) {
      console.error("Error in bulk remove:", error);
      showToast("Error removing leads", { variant: "error" });
    } finally {
      setIsBulkRemoving(false);
    }
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
      refreshUsage(); // Refresh leads stats card
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
      const response = await fetch("/api/openai/suggest-keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: productDescription,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate keywords");
      }

      const data = await response.json();
      if (data.keywords && Array.isArray(data.keywords)) {
        // Set recommended keywords (don't auto-add to user's keywords)
        setRecommendedKeywordsModal(data.keywords);
        showToast(`Generated ${data.keywords.length} keyword suggestions!`, { variant: "success" });
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

  // Generate recommended subreddits based on keywords
  const generateRecommendedSubreddits = async () => {
    if (keywords.length === 0) {
      showToast("Please add keywords first to get subreddit recommendations", { variant: "error" });
      return;
    }

    setIsLoadingSubredditRecommendations(true);
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
          }
        } catch (error) {
          console.error(`Error searching for keyword "${keyword}":`, error);
        }
      });

      // Wait for all searches to complete concurrently
      await Promise.all(searchPromises);

      // Convert to array and sort by count
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

      setRecommendedSubredditsModal(subredditsWithInfo);
      showToast(`Generated ${subredditsWithInfo.length} subreddit recommendations!`, { variant: "success" });
    } catch (error) {
      console.error("Error generating subreddit recommendations:", error);
      showToast(error instanceof Error ? error.message : "Failed to generate subreddit recommendations", { variant: "error" });
                      } finally {
      setIsLoadingSubredditRecommendations(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "product":
        return (
          <>
          <div className={cn(
              "flex h-full flex-col",
              !sidebarOpen && "pl-2"
            )}>
              {/* Fixed header with title */}
              <div className={cn(
                "sticky top-0 z-10 bg-background pb-4",
                !sidebarOpen && "pl-14"
              )}>
                  <h3 className="text-lg font-semibold">
                  Dashboard
                  </h3>
              </div>
              
              {/* Three cards */}
              <div className={cn(
                "flex-1 overflow-y-auto pt-2 pb-6 px-1",
                !sidebarOpen && "pl-14"
          )}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                  {/* Product Card */}
                  <button
                    onClick={() => setShowProductModal(true)}
                    className="p-6 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left cursor-pointer h-full"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <h4 className="text-lg font-semibold">Product</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {productName || "No product name set"}
                    </p>
                  </button>

                  {/* Keywords Card */}
                  <button
                    onClick={() => setShowKeywordsModal(true)}
                    className="p-6 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left cursor-pointer h-full"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Hash className="h-5 w-5 text-primary" />
                </div>
                      <h4 className="text-lg font-semibold">Keywords</h4>
              </div>
                    <p className="text-sm text-muted-foreground">
                      {keywords.length > 0 ? `${keywords.length} keyword${keywords.length !== 1 ? 's' : ''}` : "No keywords set"}
                    </p>
                  </button>

                  {/* Subreddits Card */}
                  <button
                    onClick={() => setShowSubredditsModal(true)}
                    className="p-6 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left cursor-pointer h-full"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <h4 className="text-lg font-semibold">Subreddits</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {subreddits.length > 0 ? `${subreddits.length} subreddit${subreddits.length !== 1 ? 's' : ''}` : "No subreddits set"}
                    </p>
                  </button>
                </div>
                
                {/* Auto-pilot Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-4">
                  <div className="p-6 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-semibold">Auto-pilot</h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAutoPilotEnabled}
                          onChange={async (e) => {
                            // Check if user is premium - if not, show modal
                            if (userPlan !== "premium") {
                              setShowAutoPilotModal(true);
                              return;
                            }
                            
                            setIsLoadingAutoPilot(true);
                            try {
                              const response = await fetch("/api/user/auto-pilot", {
                          method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ autoPilotEnabled: e.target.checked }),
                              });
                              
                              if (response.ok) {
                        const data = await response.json();
                        if (data.success) {
                                  setIsAutoPilotEnabled(data.autoPilotEnabled);
                                  showToast(
                                    data.autoPilotEnabled 
                                      ? "Auto-pilot enabled" 
                                      : "Auto-pilot disabled",
                                    { variant: "success" }
                                  );
                                }
                              } else {
                                showToast("Failed to update auto-pilot status", { variant: "error" });
                        }
                      } catch (error) {
                              console.error("Error updating auto-pilot status:", error);
                              showToast("Failed to update auto-pilot status", { variant: "error" });
                      } finally {
                              setIsLoadingAutoPilot(false);
                            }
                          }}
                          disabled={isLoadingAutoPilot}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                      </label>
                </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Please go to history tab to see auto commented posts.
                    </p>
                    
                    {/* Auto-pilot Stats */}
                    <div className="mt-4">
                      {isLoadingAnalytics ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          <div className="text-3xl font-bold text-foreground">
                            {autoPilotPosts.length}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(() => {
                              const now = Date.now();
                              const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
                              const postsLast24Hours = autoPilotPosts.filter(post => post.postedAt >= twentyFourHoursAgo).length;
                              return `${postsLast24Hours} in the past 24 hours`;
                            })()}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block"></div>
                  <div className="hidden md:block"></div>
              </div>
                </div>
              </div>
              
            {/* Product Modal */}
            {showProductModal && (
              <>
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setShowProductModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                      <h3 className="text-lg font-semibold">Edit Product</h3>
                      <button
                        onClick={() => setShowProductModal(false)}
                        className="rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                        <label className="block text-sm font-medium mb-1">Product Name</label>
                      <Input
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="Enter your product name"
                      />
              </div>
              <div>
                        <label className="block text-sm font-medium mb-1">Product Website</label>
                      <Input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                      />
              </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Product Description</label>
                        <div className="relative">
                        <textarea
                          value={productDescription}
                          onChange={(e) => setProductDescription(e.target.value)}
                            placeholder={isGeneratingProductDescription ? "Generating..." : "Describe your product..."}
                          disabled={isGeneratingProductDescription}
                            className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 pb-12 text-sm resize-y"
                        />
                        {isGeneratingProductDescription && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                              <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                            className="absolute bottom-2 right-2 bg-black text-white hover:bg-black/90 text-xs h-7"
                            disabled={isGeneratingProductDescription || !website?.trim()}
                          onClick={async () => {
                              if (!website?.trim()) return;
                            setIsGeneratingProductDescription(true);
                            try {
                              const response = await fetch("/api/openai/product", {
                                method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ website }),
                              });
                                if (response.ok) {
                              const data = await response.json();
                              if (data.success && data.description) {
                                setProductDescription(data.description);
                                  }
                              }
                            } catch (error) {
                                console.error("Error generating description:", error);
                            } finally {
                              setIsGeneratingProductDescription(false);
                            }
                          }}
                        >
                          {isGeneratingProductDescription ? "Generating..." : "AI generate"}
                        </Button>
                      </div>
                    </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Product Benefits/Results</label>
                        <textarea
                          value={productBenefits}
                          onChange={(e) => setProductBenefits(e.target.value)}
                          placeholder="Enter metrics and achievements..."
                          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                        />
                  </div>
                    </div>
                    <div className="border-t border-border px-6 py-4 flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowProductModal(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          setIsSavingProductDetails(true);
                          try {
                            const response = await fetch("/api/user/product-details", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                productName: productName || undefined,
                                link: website || undefined,
                                productDescription: productDescription || undefined,
                                productBenefits: productBenefits || undefined,
                              }),
                            });
                            if (response.ok) {
                              const data = await response.json();
                              if (data.success) {
                                setOriginalProductDetails({
                                  productName: productName || "",
                                  website: website || "",
                                  productDescription: productDescription || "",
                                  productBenefits: productBenefits || "",
                                  keywords: keywords,
                                });
                                showToast("Product details saved!", { variant: "success" });
                                setShowProductModal(false);
                              }
                            }
                          } catch (error) {
                            console.error("Error saving:", error);
                            showToast("Failed to save", { variant: "error" });
                          } finally {
                            setIsSavingProductDetails(false);
                          }
                        }}
                        disabled={isSavingProductDetails}
                      >
                        {isSavingProductDetails ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Keywords Modal */}
            {showKeywordsModal && (
              <>
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => {
                  setShowKeywordsModal(false);
                  setRecommendedKeywordsModal([]);
                }} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                      <h3 className="text-lg font-semibold">Edit Keywords</h3>
                      <button
                        onClick={() => {
                          setShowKeywordsModal(false);
                          setRecommendedKeywordsModal([]);
                        }}
                        className="rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium">Keywords</label>
                    <Button
                          size="sm"
                          variant="outline"
                          onClick={generateKeywords}
                          disabled={isGeneratingKeywords || !productDescription?.trim()}
                        >
                          {isGeneratingKeywords ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                              Suggesting...
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3 mr-1.5" />
                              AI Suggest
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Recommended Keywords Section */}
                      {isGeneratingKeywords && (
                        <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/50 border border-border">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Generating keyword suggestions...</span>
                        </div>
                      )}
                      {!isGeneratingKeywords && recommendedKeywordsModal.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground block">
                            Recommended Keywords
                          </label>
                      <p className="text-xs text-muted-foreground mb-2">
                            Click the + button to add keywords to your list:
                      </p>
                        <div className="relative">
                            <div
                              ref={recommendedKeywordsModalScrollRef}
                              className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
                              onScroll={() => {
                                if (recommendedKeywordsModalScrollRef.current) {
                                  const { scrollLeft, scrollWidth, clientWidth } = recommendedKeywordsModalScrollRef.current;
                                  setCanScrollLeftKeywordsModal(scrollLeft > 0);
                                  setCanScrollRightKeywordsModal(scrollLeft < scrollWidth - clientWidth - 1);
                                }
                              }}
                            >
                              <div className="flex gap-3 min-w-max">
                                {recommendedKeywordsModal.map((keyword) => {
                                  const normalizedRecommended = keyword.toLowerCase().trim();
                                  const isAdded = keywords.some(k => k.toLowerCase().trim() === normalizedRecommended);
                                  const maxKeywords = userPlan === "premium" ? 10 : 5;
                                  const isDisabled = isAdded || keywords.length >= maxKeywords;
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
                                          if (!isAdded && keywords.length < maxKeywords) {
                                            const trimmedKeyword = keyword.toLowerCase().trim();
                                            if (!keywords.some(k => k.toLowerCase().trim() === trimmedKeyword)) {
                                              const newKeywords = [...keywords, trimmedKeyword];
                                              setKeywords(newKeywords);
                                              saveKeywords(newKeywords);
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
                            {canScrollLeftKeywordsModal && (
                              <button
                                onClick={() => {
                                  if (recommendedKeywordsModalScrollRef.current) {
                                    recommendedKeywordsModalScrollRef.current.scrollBy({
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
                            {canScrollRightKeywordsModal && (
                              <button
                                onClick={() => {
                                  if (recommendedKeywordsModalScrollRef.current) {
                                    recommendedKeywordsModalScrollRef.current.scrollBy({
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
                      
                      <p className="text-xs text-muted-foreground">
                        Add keywords ({keywords.length}/{userPlan === "premium" ? 10 : 5})
                      </p>
                      <div className="min-h-[100px] max-h-[300px] overflow-y-auto flex flex-wrap gap-2 p-3 border border-input rounded-md">
                            {keywords.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No keywords added</p>
                            ) : (
                              keywords.map((keyword, index) => (
                            <div key={index} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1 text-sm">
                                  <span>{keyword}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newKeywords = keywords.filter((_, i) => i !== index);
                                      setKeywords(newKeywords);
                                      saveKeywords(newKeywords);
                                    }}
                                className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                      <div className="flex gap-2">
                          <Input
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = keywordInput.trim();
                                if (trimmed && !keywords.includes(trimmed)) {
                                const maxKeywords = userPlan === "premium" ? 10 : 5;
                                if (keywords.length >= maxKeywords) {
                                  showToast(`Maximum of ${maxKeywords} keywords allowed`, { variant: "error" });
                                    return;
                                  }
                                  const newKeywords = [...keywords, trimmed];
                                  setKeywords(newKeywords);
                                  setKeywordInput("");
                                  saveKeywords(newKeywords);
                                }
                              }
                            }}
                            placeholder="Enter a keyword"
                          />
                          <div className="relative group">
                          <Button
                            onClick={() => {
                              const trimmed = keywordInput.trim();
                              if (trimmed && !keywords.includes(trimmed)) {
                                const maxKeywords = userPlan === "premium" ? 10 : 5;
                                if (keywords.length >= maxKeywords) {
                                  showToast(`Maximum of ${maxKeywords} keywords allowed`, { variant: "error" });
                                  return;
                                }
                                const newKeywords = [...keywords, trimmed];
                                setKeywords(newKeywords);
                                setKeywordInput("");
                                saveKeywords(newKeywords);
                              }
                            }}
                            disabled={!keywordInput.trim() || keywords.includes(keywordInput.trim()) || keywords.length >= (userPlan === "premium" ? 10 : 5)}
                          >
                            <Plus className="h-4 w-4" />
                    </Button>
                            {keywords.length >= (userPlan === "premium" ? 10 : 5) && keywordInput.trim() && !keywords.includes(keywordInput.trim()) && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-md shadow-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                Max keywords reached
                  </div>
                            )}
                </div>
              </div>
                </div>
              </div>
                </div>
              </>
            )}

            {/* Subreddits Modal */}
            {showSubredditsModal && (
              <>
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => {
                  setShowSubredditsModal(false);
                  setRecommendedSubredditsModal([]);
                }} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                      <h3 className="text-lg font-semibold">Edit Subreddits</h3>
                      <button
                        onClick={() => {
                          setShowSubredditsModal(false);
                          setRecommendedSubredditsModal([]);
                        }}
                        className="rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium">Target Subreddits</label>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={generateRecommendedSubreddits}
                          disabled={isLoadingSubredditRecommendations || keywords.length === 0}
                        >
                          {isLoadingSubredditRecommendations ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                              Suggesting...
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3 mr-1.5" />
                              AI Suggest
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Recommended Subreddits Section */}
                      {isLoadingSubredditRecommendations && (
                        <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/50 border border-border">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Analyzing your keywords to recommend subreddits...</span>
                        </div>
                      )}
                      {!isLoadingSubredditRecommendations && recommendedSubredditsModal.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground block">
                            Recommended Subreddits
                      </label>
                          <p className="text-xs text-muted-foreground mb-2">
                            Based on your keywords, these subreddits appear most frequently in relevant posts:
                          </p>
                        <div className="relative">
                            <div
                              ref={recommendedSubredditsModalScrollRef}
                              className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
                              onScroll={() => {
                                if (recommendedSubredditsModalScrollRef.current) {
                                  const { scrollLeft, scrollWidth, clientWidth } = recommendedSubredditsModalScrollRef.current;
                                  setCanScrollLeftSubredditsModal(scrollLeft > 0);
                                  setCanScrollRightSubredditsModal(scrollLeft < scrollWidth - clientWidth - 1);
                                }
                              }}
                            >
                              <div className="flex gap-3 min-w-max">
                                {recommendedSubredditsModal.map((rec) => {
                                  const recName = rec.name.toLowerCase().replace(/^r\//, "");
                                  const isAdded = subreddits.includes(recName);
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
                                        onClick={() => {
                                          if (!isAdded && subreddits.length < 15) {
                                            const newSubreddits = [...subreddits, recName];
                                            setSubreddits(newSubreddits);
                                            saveSubreddits(newSubreddits);
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
                            {canScrollLeftSubredditsModal && (
                              <button
                                onClick={() => {
                                  if (recommendedSubredditsModalScrollRef.current) {
                                    recommendedSubredditsModalScrollRef.current.scrollBy({
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
                            {canScrollRightSubredditsModal && (
                              <button
                                onClick={() => {
                                  if (recommendedSubredditsModalScrollRef.current) {
                                    recommendedSubredditsModalScrollRef.current.scrollBy({
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
                      
                      <div className="min-h-[100px] max-h-[300px] overflow-y-auto flex flex-wrap gap-2 p-3 border border-input rounded-md">
                            {subreddits.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No subreddits selected</p>
                            ) : (
                              subreddits.map((subreddit, index) => (
                            <div key={index} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1 text-sm">
                                  <span>r/{subreddit}</span>
                                  <button
                                    type="button"
                                  onClick={() => {
                                    const newSubreddits = subreddits.filter((_, i) => i !== index);
                                    setSubreddits(newSubreddits);
                                    saveSubreddits(newSubreddits);
                                  }}
                                className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                      <div className="relative">
                            <Input
                              ref={subredditInputRef}
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
                              placeholder="Search for subreddits..."
                            />
                            {isLoadingSubreddits && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            )}
                            {showSubredditDropdown && subredditSuggestions.length > 0 && subredditDropdownPosition && (
                              <div
                                ref={subredditDropdownRef}
                            className="fixed z-50 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
                                style={{
                                  top: `${subredditDropdownPosition.top}px`,
                                  left: `${subredditDropdownPosition.left}px`,
                                  width: `${subredditDropdownPosition.width}px`,
                                }}
                              >
                                {subredditSuggestions.map((sub, index) => (
                                  <button
                                    key={index}
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
                                        saveSubreddits(newSubreddits);
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center justify-between"
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{sub.displayName}</span>
                                      {sub.subscribers > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                      {sub.subscribers >= 1000 ? `${(sub.subscribers / 1000).toFixed(1)}k members` : `${sub.subscribers} members`}
                                        </span>
                                      )}
                                    </div>
                                {subreddits.includes(sub.name) && <Check className="h-4 w-4 text-primary" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
              </>
            )}
          </>
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
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0 relative",
                !sidebarOpen && "pl-14"
              )}>
                {/* Blur overlay for free users */}
                {userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1 && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/10 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white dark:bg-card rounded-2xl shadow-xl border border-border text-center space-y-4 p-8 max-w-md">
                      <h3 className="text-4xl font-bold text-foreground">
                        Create Comments
                      </h3>
                      <p className="text-xl font-semibold text-foreground">
                        Generate and Post Comments
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Select a plan to get started. On average, users find more than 500+ high potential leads in their first week using SignalScouter.
                      </p>
                      <Button
                        onClick={() => setActiveTab("pricing")}
                        className="bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                      >
                        View Plans
                      </Button>
                    </div>
                  </div>
                )}
                <div className={cn(
                  "space-y-6 px-1 flex-1 overflow-y-auto",
                  userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1 && "blur-md pointer-events-none select-none"
                )}>
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

                              // Extract subreddit name from post
                              let subredditName: string | undefined = undefined;
                              if (post.subreddit) {
                                subredditName = post.subreddit;
                              } else if (post.subreddit_name_prefixed) {
                                subredditName = post.subreddit_name_prefixed.replace(/^r\//, "");
                              }

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
                                  subreddit: subredditName,
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

                                    } catch (dbError) {
                                      console.error("Error saving post to database:", dbError);
                                      // Don't fail the whole operation if DB save fails
                                    }

                                    // Refresh analytics
                                    await refreshAnalytics();
                                    refreshUsage(); // Refresh leads stats card

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
                                      refreshUsage(); // Refresh leads stats card
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
                "sticky top-0 z-30 bg-background pb-2",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold">
                    History
                  </h3>
                  <div className="flex gap-2 self-start sm:self-auto">
                    {/* Analytics Filter Dropdown */}
                    <div className="relative" ref={analyticsFilterDropdownRef}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-sm px-2 py-1 min-w-[120px] justify-between"
                        onClick={() => setIsAnalyticsFilterDropdownOpen(!isAnalyticsFilterDropdownOpen)}
                        disabled={isLoadingAnalytics}
                      >
                        <span>
                          {analyticsFilter === "posted" ? `Active ${analyticsFilterCounts.posted > 0 ? `(${analyticsFilterCounts.posted})` : ''}` :
                           analyticsFilter === "skipped" ? `Skipped ${analyticsFilterCounts.skipped > 0 ? `(${analyticsFilterCounts.skipped})` : ''}` :
                           analyticsFilter === "failed" ? `Failed ${analyticsFilterCounts.failed > 0 ? `(${analyticsFilterCounts.failed})` : ''}` : "Active"}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </Button>
                      {isAnalyticsFilterDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg min-w-[120px]">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setAnalyticsFilter("posted");
                                setIsAnalyticsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                analyticsFilter === "posted" && "bg-muted"
                              )}
                            >
                              Active {analyticsFilterCounts.posted > 0 && `(${analyticsFilterCounts.posted})`}
                            </button>
                            <button
                              onClick={() => {
                                setAnalyticsFilter("skipped");
                                setIsAnalyticsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                analyticsFilter === "skipped" && "bg-muted"
                              )}
                            >
                              Skipped {analyticsFilterCounts.skipped > 0 && `(${analyticsFilterCounts.skipped})`}
                            </button>
                            <button
                              onClick={() => {
                                setAnalyticsFilter("failed");
                                setIsAnalyticsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                analyticsFilter === "failed" && "bg-muted"
                              )}
                            >
                              Failed {analyticsFilterCounts.failed > 0 && `(${analyticsFilterCounts.failed})`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Auto-pilot Filter Dropdown */}
                    <div className="relative" ref={autoPilotFilterDropdownRef}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-sm px-2 py-1 min-w-[120px] justify-between"
                        onClick={() => setIsAutoPilotFilterDropdownOpen(!isAutoPilotFilterDropdownOpen)}
                        disabled={isLoadingAnalytics}
                      >
                        <span>
                          {autoPilotFilter === "all" ? "All" :
                           autoPilotFilter === "auto-pilot" ? `Auto-pilot ${analyticsFilterCounts.autoPilot > 0 ? `(${analyticsFilterCounts.autoPilot})` : ''}` :
                           autoPilotFilter === "manual" ? `Manual ${analyticsFilterCounts.manual > 0 ? `(${analyticsFilterCounts.manual})` : ''}` : "All"}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </Button>
                      {isAutoPilotFilterDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg min-w-[120px]">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setAutoPilotFilter("all");
                                setIsAutoPilotFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                autoPilotFilter === "all" && "bg-muted"
                              )}
                            >
                              All
                            </button>
                            <button
                              onClick={() => {
                                setAutoPilotFilter("auto-pilot");
                                setIsAutoPilotFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                autoPilotFilter === "auto-pilot" && "bg-muted"
                              )}
                            >
                              Auto-pilot {analyticsFilterCounts.autoPilot > 0 && `(${analyticsFilterCounts.autoPilot})`}
                            </button>
                            <button
                              onClick={() => {
                                setAutoPilotFilter("manual");
                                setIsAutoPilotFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                autoPilotFilter === "manual" && "bg-muted"
                              )}
                            >
                              Manual {analyticsFilterCounts.manual > 0 && `(${analyticsFilterCounts.manual})`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Status</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Title</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Subreddit</th>
                          <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted/50">Posted on</th>
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
                                    {(() => {
                                      let subredditName: string | null = null;
                                      if (post.postData?.subreddit_name_prefixed) {
                                        subredditName = post.postData.subreddit_name_prefixed;
                                      } else if (post.postData?.subreddit) {
                                        subredditName = `r/${post.postData.subreddit}`;
                                      } else if (post.link) {
                                        const subredditMatch = post.link.match(/reddit\.com\/r\/([^/]+)/);
                                        if (subredditMatch) {
                                          subredditName = `r/${subredditMatch[1]}`;
                                        }
                                      }
                                      return subredditName || "Unknown";
                                    })()}
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
                  <div className="flex items-center gap-3">
                 
                    {lastLeadsSyncTime && (
                      <span className="text-xs text-muted-foreground">
                        Last synced {(() => {
                          const now = new Date();
                          const diffMs = now.getTime() - lastLeadsSyncTime.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMs / 3600000);
                          const diffDays = Math.floor(diffMs / 86400000);
                          
                          if (diffMins < 1) return "just now";
                          if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
                          if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                          if (diffDays === 1) return "yesterday";
                          if (diffDays < 7) return `${diffDays} days ago`;
                          return lastLeadsSyncTime.toLocaleDateString();
                        })()}
                      </span>
                    )}
                    {/* Signal filter dropdown */}
                    <div className="relative ml-2" ref={filterDropdownRef}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                        disabled={isLoadingLeads || !!(userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1)}
                        className="min-w-[120px] justify-between"
                      >
                        <span>
                          {leadsSignalFilter === "all" ? "All" :
                           leadsSignalFilter === "strong" ? `Strong ${signalCounts.strongCount > 0 ? `(${signalCounts.strongCount})` : ''}` :
                           leadsSignalFilter === "partial" ? `Partial ${signalCounts.partialCount > 0 ? `(${signalCounts.partialCount})` : ''}` : "All"}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </Button>
                      {isFilterDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-40 bg-card border border-border rounded-md shadow-lg min-w-[120px]">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setLeadsSignalFilter("all");
                                setIsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                leadsSignalFilter === "all" && "bg-muted"
                              )}
                            >
                              All
                            </button>
                            <button
                              onClick={() => {
                                setLeadsSignalFilter("strong");
                                setIsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                leadsSignalFilter === "strong" && "bg-muted"
                              )}
                            >
                              Strong {signalCounts.strongCount > 0 && `(${signalCounts.strongCount})`}
                            </button>
                            <button
                              onClick={() => {
                                setLeadsSignalFilter("partial");
                                setIsFilterDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                leadsSignalFilter === "partial" && "bg-muted"
                              )}
                            >
                              Partial {signalCounts.partialCount > 0 && `(${signalCounts.partialCount})`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-2 self-start sm:self-auto">
                        {/* Auto-pilot Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-sm px-2 py-1"
                          disabled={isLoadingLeads || isLoadingAutoPilot}
                          onClick={async () => {
                            // Check if user is premium - if not (free or basic), show modal
                            if (userPlan !== "premium") {
                              setShowAutoPilotModal(true);
                              return;
                            }

                            // For premium/pro users, toggle auto-pilot
                            setIsLoadingAutoPilot(true);
                            try {
                              const response = await fetch("/api/user/auto-pilot", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ autoPilotEnabled: !isAutoPilotEnabled }),
                              });
                              
                              if (response.ok) {
                                const data = await response.json();
                                if (data.success) {
                                  setIsAutoPilotEnabled(data.autoPilotEnabled);
                                  showToast(
                                    data.autoPilotEnabled 
                                      ? "Auto-pilot enabled" 
                                      : "Auto-pilot disabled",
                                    { variant: "success" }
                                  );
                                }
                              } else {
                                showToast("Failed to update auto-pilot status", { variant: "error" });
                              }
                            } catch (error) {
                              console.error("Error updating auto-pilot status:", error);
                              showToast("Failed to update auto-pilot status", { variant: "error" });
                            } finally {
                              setIsLoadingAutoPilot(false);
                            }
                          }}
                        >
                          {isLoadingAutoPilot ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                              {isAutoPilotEnabled ? "Disabling..." : "Enabling..."}
                            </>
                          ) : (
                            <>
                              {isAutoPilotEnabled ? "Auto-pilot: ON" : "Auto-pilot: OFF"}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-black text-white hover:bg-black/90 text-sm px-2 py-1"
                          disabled={isLoadingLeads || selectedLeads.size === 0}
                      onClick={async () => {
                        // Check usage limit before opening modal
                        try {
                          const response = await fetch("/api/usage");
                          if (response.ok) {
                            const data = await response.json();
                            const currentCount = data.currentCount ?? 0;
                            const maxCount = data.maxCount ?? 30;
                            const remaining = Math.max(0, maxCount - currentCount);
                            const selectedCount = selectedLeads.size;

                            // Check if user has enough credits for selected leads
                            if (remaining < selectedCount) {
                              // Show upgrade modal instead of toast
                              setUpgradeModalContext({
                                limitReached: remaining === 0,
                                remaining: remaining,
                                selectedCount: selectedCount,
                                maxCount: maxCount
                              });
                              setShowUpgradeModal(true);
                              return;
                            }
                          }
                        } catch (error) {
                          console.error("Error checking usage:", error);
                          // Continue if check fails (don't block user)
                        }

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
                      Bulk Posting {selectedLeads.size > 0 && `(${selectedLeads.size})`}
                      </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-sm px-2 py-1"
                          disabled={isLoadingLeads || selectedLeads.size === 0 || isBulkRemoving}
                          onClick={handleBulkRemove}
                        >
                          {isBulkRemoving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Removing...
                            </>
                          ) : (
                            <>Remove Posts {selectedLeads.size > 0 && `(${selectedLeads.size})`}</>
                          )}
                        </Button>
                    <div className="flex items-center gap-3">
                    
                          <Button
                      onClick={handleLeadsSearch}
                      disabled={isLoadingLeads || (syncUsage ? syncUsage.syncCounter >= syncUsage.maxSyncsPerDay : false) || !!(userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1)}
                            size="sm"
                      variant={distinctLeadsLinks.length > 0 ? "outline" : "default"}
                      className={`text-sm px-2 py-1 ${syncUsage && syncUsage.syncCounter >= syncUsage.maxSyncsPerDay && countdown ? "min-w-[160px]" : "w-[140px]"}`}
                    >
                      {isLoadingLeads ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1) ? (
                        "Upgrade to sync more"
                      ) : syncUsage && syncUsage.syncCounter >= syncUsage.maxSyncsPerDay ? (
                        countdown ? (
                          <>
                            <span className="text-xs">Resets in {countdown}</span>
                        </>
                      ) : (
                          "Sync Leads"
                        )
                      ) : (
                          "Sync Leads"
                      )}
                          </Button>
                    </div>
                      {distinctLeadsLinks.length > 0 && (
                        <div className="relative" ref={sortDropdownRef}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-sm px-2 py-1"
                            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                            disabled={isLoadingLeads || !!(userPlan === "free" && syncUsage && syncUsage.syncCounter >= 1)}
                          >
                          {leadsSortBy === "relevance" ? "Relevance" :
                            leadsSortBy === "date-desc" ? "Date (Newest)" :
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
                          <div className="absolute top-full right-0 mt-1 z-40 bg-card border border-border rounded-md shadow-lg min-w-[160px]">
                              <div className="py-1">
                              <button
                                onClick={() => {
                                  setLeadsSortBy("relevance");
                                  setIsSortDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                                  leadsSortBy === "relevance" && "bg-muted"
                                )}
                              >
                                Relevance
                              </button>
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
                    
                  {/* Show loading state while analytics is loading to prevent count from jumping */}
                  {(isLoadingAnalytics || !analyticsFetchedRef.current) && Object.keys(leadsLinks).length > 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <p className="text-sm text-muted-foreground">Loading leads...</p>
                      </div>
                    </div>
                  ) : distinctLeadsLinks.length > 0 ? (
                  <div className="flex-1 flex flex-col min-h-0 space-y-4">
                    {/* Display Reddit links in table view */}
                      <div className={cn(
                        "relative rounded-lg border border-border overflow-hidden flex-1 flex flex-col min-h-0",
                        isLoadingLeads && "pointer-events-none"
                      )}>
                        {/* Blur overlay for free users */}
                        {userPlan === "free" && distinctLeadsLinks.length > 0 && !isLoadingLeads && (
                          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/10 backdrop-blur-sm">
                            <div className="bg-white dark:bg-card rounded-2xl shadow-xl border border-border text-center space-y-4 p-8 max-w-md">
                              <h3 className="text-5xl font-bold text-foreground"> {distinctLeadsLinks.length}</h3>
                              <p className="text-xl font-semibold text-foreground">
                              High Potential  {distinctLeadsLinks.length === 1 ? 'Lead' : 'Leads'} Found
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Select a plan to get started. On average, users find more than 500+ high potential leads in their first week using SignalScouter.
                              </p>
                              <Button
                                onClick={() => setActiveTab("pricing")}
                                className="bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
                              >
                                View Plans
                              </Button>
                            </div>
                          </div>
                        )}
                        <div
                          ref={leadsTableScrollRef}
                          className={cn(
                            "overflow-x-auto flex-1 overflow-y-auto min-h-0",
                            isLoadingLeads && "blur-sm pointer-events-none select-none",
                            userPlan === "free" && distinctLeadsLinks.length > 0 && !isLoadingLeads && "blur-md pointer-events-none select-none"
                          )}
                        >
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
                                      "cursor-pointer h-4 w-4 rounded border border-gray-400 dark:border-gray-500 bg-white flex items-center justify-center transition-colors",
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
                                <th className="text-left py-1.5 px-2 text-sm font-semibold text-foreground bg-muted w-[80px]">Signal</th>
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
                                    onClick={async () => {
                                    setSelectedDiscoveryPost(linkItem);
                                    setIsDiscoveryDrawerVisible(true);
                                    setSubredditPromotionStatus({ allowsPromotion: null, isLoading: false }); // Reset status
                                      // Fetch full post data on-demand when drawer opens
                                      await fetchFullPostDataForDrawer(linkItem);
                                      
                                      // Extract subreddit and check promotion status
                                      let subredditToCheck: string | null = null;
                                      if (linkItem.postData?.subreddit_name_prefixed) {
                                        subredditToCheck = linkItem.postData.subreddit_name_prefixed;
                                      } else if (linkItem.postData?.subreddit) {
                                        subredditToCheck = `r/${linkItem.postData.subreddit}`;
                                      } else if (linkItem.link) {
                                        const subredditMatch = linkItem.link.match(/reddit\.com\/r\/([^/]+)/);
                                        if (subredditMatch) {
                                          subredditToCheck = `r/${subredditMatch[1]}`;
                                        }
                                      }
                                      if (subredditToCheck) {
                                        checkSubredditPromotionStatus(subredditToCheck);
                                      }
                                  }}
                                >
                                    {/* Checkbox column */}
                                    <td 
                                      className="py-3 px-2 align-middle w-[40px] cursor-pointer" 
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
                                    >
                                      <div
                                        className={cn(
                                          "h-4 w-4 rounded border border-gray-400 dark:border-gray-500 bg-white flex items-center justify-center transition-colors",
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

                                    {/* Signal column */}
                                    <td className="py-3 px-2 align-middle w-[80px]">
                                      {linkItem.link ? (() => {
                                        const normalizedUrl = normalizeUrl(linkItem.link!);
                                        const signal = leadsFilterSignals[normalizedUrl];
                                        // Debug log to check signal lookup
                                        if (signal === "YES") {
                                          return (
                                            <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                                              Strong
                                            </span>
                                          );
                                        } else if (signal === "MAYBE") {
                                          return (
                                            <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                                              Partial
                                            </span>
                                          );
                                        }
                                        return null;
                                      })() : (
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
                          <div className={cn(
                            "flex items-center justify-between border-t border-border px-3 py-1.5 bg-card",
                            isLoadingLeads && "blur-sm pointer-events-none select-none"
                          )}>
                            <div className="text-xs text-muted-foreground">
                              Showing {(leadsPage - 1) * LEADS_ITEMS_PER_PAGE + 1} to{" "}
                              {Math.min(leadsPage * LEADS_ITEMS_PER_PAGE, filteredDistinctLeadsLinks.length)} of{" "}
                              {filteredDistinctLeadsLinks.length} posts
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLeadsPage((prev) => Math.max(1, prev - 1))}
                                disabled={leadsPage === 1 || isLoadingLeads}
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
                                disabled={leadsPage === totalLeadsPages || isLoadingLeads}
                                className="text-xs h-7 px-2"
                              >
                                <span className="hidden sm:inline">Next</span>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        {/* Loading overlay */}
                        {isLoadingLeads && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                              <p className="text-sm font-medium text-foreground">Loading leads...</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isLoadingLeads && distinctLeadsLinks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                      <div className="flex flex-col items-center gap-4 w-full max-w-md px-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <div className="w-full max-w-sm">
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '65%' }}></div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1 mt-2">
                          <p className="text-sm font-medium text-foreground">
                            Searching subreddits and fetching leads...
                          </p>
                          <p className="text-xs text-muted-foreground text-center">
                            This usually takes around 3 - 4 mins...
                          </p>
                        </div>
                      </div>
                        </div>
                      ) : (
                    !isLoadingLeads && !Object.values(isLoadingLeadsLinks).some(Boolean) && (
                          <div className="flex items-center justify-center min-h-[400px]">
                          <p className="text-sm text-muted-foreground">
                          {keywords && keywords.length > 0
                            ? "No leads found. Click 'Sync Leads' to get started."
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
                    Engagement
                  </h3>
                </div>

                {/* Filter tabs */}
                {(() => {
                  // Calculate counts for each category
                  const notifications = inboxMessages.filter((item) => {
                    const msg = item.data;
                    return msg.kind === "t1" || msg.kind === "t3";
                  });
                  const messages = inboxMessages.filter((item) => {
                    return item.data.kind === "t4";
                  });

                  return (
                    <div className="flex items-center gap-2 mt-3 border-b border-border">
                      <button
                        onClick={() => setEngagementFilter("all")}
                        className={cn(
                          "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                          engagementFilter === "all"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        All {inboxMessages.length > 0 && `(${inboxMessages.length})`}
                      </button>
                      <button
                        onClick={() => setEngagementFilter("notifications")}
                        className={cn(
                          "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                          engagementFilter === "notifications"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Notifications {notifications.length > 0 && `(${notifications.length})`}
                      </button>
                      <button
                        onClick={() => setEngagementFilter("messages")}
                        className={cn(
                          "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                          engagementFilter === "messages"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Messages {messages.length > 0 && `(${messages.length})`}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Content area that spans remaining space */}
              <div className={cn(
                "flex-1 overflow-hidden pt-2 pb-6 flex flex-col min-h-0",
                !sidebarOpen && "pl-14"
              )}>
                <div className="flex-1 overflow-y-auto px-1">
                  {isLoadingInbox ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading messages...</p>
                      </div>
                    </div>
                  ) : (() => {
                    // Organize messages by type
                    const notifications: any[] = [];
                    const messages: any[] = [];

                    inboxMessages.forEach((item) => {
                      const message = item.data;
                      // t1 = comment reply, t3 = post reply (notifications)
                      // t4 = private message
                      if (message.kind === "t1" || message.kind === "t3") {
                        notifications.push(item);
                      } else if (message.kind === "t4") {
                        messages.push(item);
                      } else {
                        // Other types go to notifications by default
                        notifications.push(item);
                      }
                    });

                    const filteredMessages = engagementFilter === "all"
                      ? inboxMessages
                      : engagementFilter === "notifications"
                        ? notifications
                        : messages;

                    if (filteredMessages.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <p className="text-muted-foreground">
                              {engagementFilter === "all"
                                ? "No messages in your inbox"
                                : engagementFilter === "notifications"
                                  ? "No notifications"
                                  : "No private messages"}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {filteredMessages.map((item, index) => {
                          const message = item.data;
                          const isComment = message.kind === "t1";
                          const isPostReply = message.kind === "t3";
                          const isPrivateMessage = message.kind === "t4";

                          // Determine message type label
                          let messageType = "Message";
                          let messageIcon = MessageSquare;
                          if (isComment) {
                            messageType = "Comment Reply";
                          } else if (isPostReply) {
                            messageType = "Post Reply";
                          } else if (isPrivateMessage) {
                            messageType = "Private Message";
                          }

                          return (
                            <div
                              key={message.id || index}
                              className="rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm font-medium text-foreground">
                                      {messageType}
                                    </span>
                                    {message.new && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                        New
                                      </span>
                                    )}
                                  </div>

                                  {message.subject && (
                                    <h4 className="text-sm font-semibold text-foreground mb-1 truncate">
                                      {message.subject}
                                    </h4>
                                  )}

                                  {message.body && (
                                    <p className="text-sm text-muted-foreground line-clamp-3 mb-2">
                                      {message.body}
                                    </p>
                                  )}

                                  {message.author && (
                                    <p className="text-xs text-muted-foreground mb-1">
                                      From: <span className="font-medium">u/{message.author}</span>
                                    </p>
                                  )}

                                  {message.created_utc && (
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(message.created_utc * 1000).toLocaleString()}
                                    </p>
                                  )}

                                  {message.context && (
                                    <a
                                      href={`https://www.reddit.com${message.context}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      View Context
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
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
            <div className="flex items-start justify-between border-b border-border px-4 py-3 gap-3">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="min-w-0 w-full">
                  <h3 className="text-lg font-semibold text-foreground break-words whitespace-normal overflow-wrap-anywhere w-full">
                    {selectedDiscoveryPost.title?.replace(/[:\s]*r\/[^\s]+/gi, '').trim() || "No title"}
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
                onClick={() => {
                  setIsDiscoveryDrawerVisible(false);
                  setSubredditPromotionStatus({ allowsPromotion: null, isLoading: false }); // Reset status when closing
                }}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex h-full flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pr-4 pb-48">
                {isLoadingPostContent[selectedDiscoveryPost.link || ''] ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm text-muted-foreground">Loading post content...</span>
                  </div>
                ) : (selectedDiscoveryPost.selftext || selectedDiscoveryPost.snippet) ? (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Post Content</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDiscoveryPost.selftext || selectedDiscoveryPost.snippet}
                    </p>
                  </div>
                ) : null}
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
                  {(() => {
                    // Get subreddit from postData if available, otherwise extract from link
                    let subredditName: string | null = null;
                    if (selectedDiscoveryPost.postData?.subreddit_name_prefixed) {
                      subredditName = selectedDiscoveryPost.postData.subreddit_name_prefixed;
                    } else if (selectedDiscoveryPost.postData?.subreddit) {
                      subredditName = `r/${selectedDiscoveryPost.postData.subreddit}`;
                    } else if (selectedDiscoveryPost.link) {
                      const subredditMatch = selectedDiscoveryPost.link.match(/reddit\.com\/r\/([^/]+)/);
                      if (subredditMatch) {
                        subredditName = `r/${subredditMatch[1]}`;
                      }
                    }
                    return subredditName ? (
                      <div className="mb-3 flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          Subreddit: <span className="font-medium text-foreground">{subredditName}</span>
                        </p>
                        {subredditPromotionStatus.isLoading ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        ) : subredditPromotionStatus.allowsPromotion !== null ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              subredditPromotionStatus.allowsPromotion
                                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                : "bg-red-500/20 text-red-700 dark:text-red-400"
                            )}>
                              {subredditPromotionStatus.allowsPromotion ? "Allow self-promotion" : "No self-promotion"}
                            </span>
                            <div className="relative group">
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                              <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-popover border border-border rounded-md shadow-lg text-xs max-w-[200px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                {subredditPromotionStatus.allowsPromotion 
                                  ? "Product details will be included in the generated comment"
                                  : "Promotional content will be omitted from the generated comment"}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null;
                  })()}
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
                    const failedCount = Object.values(bulkOperationStatus).filter(status => status === "error").length;
                    const totalCount = bulkModalLeads.length;
                    if (isBulkPosting || completedCount > 0 || failedCount > 0) {
                      return `${completedCount} / ${totalCount} posted${failedCount > 0 ? ` (${failedCount} failed)` : ''}`;
                    }
                    return null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const failedCount = Object.values(bulkOperationStatus).filter(status => status === "error").length;
                    const allCompleted = Object.values(bulkOperationStatus).every(status => status === "completed" || status === "error");
                    const hasErrors = failedCount > 0;

                    return (
                      <>
                        {hasErrors && !isBulkPosting && (
                          <Button
                            variant="outline"
                            onClick={handleRetryFailedComments}
                            disabled={isBulkPosting}
                            size="sm"
                          >
                            Retry Failed ({failedCount})
                          </Button>
                        )}
                <Button
                  variant="default"
                  onClick={() => {
                    if (isBulkPosting) {
                      // If posting is in progress, do nothing (button is disabled)
                      return;
                    }
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
                    if (allCompleted && Object.keys(bulkOperationStatus).length > 0) {
                      return "Close";
                    }
                    if (isBulkPosting) {
                      return "Posting...";
                    }
                    return "Post Comment";
                  })()}
                </Button>
                      </>
                    );
                  })()}
                </div>
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
                      You've reached your weekly limit of {upgradeModalContext.maxCount || 30} Free Credits. {upgradeModalContext.selectedCount ? `You selected ${upgradeModalContext.selectedCount} leads, but need more credits. ` : ''}Upgrade to Premium to get 1200 generated comments per week and never worry about limits again.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You have {upgradeModalContext.remaining} Free Credits remaining this week, but you selected {upgradeModalContext.selectedCount || 0} leads. Upgrade to Premium for 1200 generated comments per week and unlock more features.
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

                  <div className="flex h-full flex-col gap-4 rounded-xl border border-[#ff4500]/60 bg-[#ffffff] p-6 text-left shadow-[0_0_35px_-12px_rgba(255,69,0,0.65)]">
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
                        <span>1200 generated comments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Usage analytics</span>
                      </li>
                    </ul>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!session) {
                          signIn(undefined, { callbackUrl: "/playground" });
                          return;
                        }

                        try {
                        setShowUpgradeModal(false);
                          const response = await fetch("/api/stripe/create-checkout-session", {
                            method: "POST",
                          });

                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || "Unable to start checkout.");
                          }

                          const data = await response.json();
                          window.location.href = data.url;
                        } catch (error) {
                          console.error("Error starting Stripe checkout:", error);
                          showToast(error instanceof Error ? error.message : "Unable to start checkout.", { variant: "error" });
                        }
                      }}
                      className="mt-auto bg-[#ff4500] hover:bg-[#ff4500]/90 text-white"
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
      {showNoRowsSelectedModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
            onClick={() => setShowNoRowsSelectedModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-foreground">
                    No Rows Selected
                  </h3>
                  <button
                    onClick={() => setShowNoRowsSelectedModal(false)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-6">
                <p className="text-sm text-muted-foreground mb-6">
                  Please select at least one row from the table to use bulk operations. You can select rows by clicking the checkboxes on the left side of each row.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowNoRowsSelectedModal(false)}
                  >
                    Close
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

      {/* Auto-pilot Modal for Free Users */}
      {showAutoPilotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 bg-background rounded-lg shadow-xl border border-border p-6">
            <button
              onClick={() => setShowAutoPilotModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Animated Icons Section */}
            <div className="flex justify-center gap-12 mb-8 mt-4">
              {/* Reddit Messages Icon */}
              <AutoPilotIcon
                key={`message-${showAutoPilotModal}`}
                icon={<MessageSquare className="h-16 w-16 text-[#ff4500]" />}
                count={99}
              />
              
              {/* Notifications Icon */}
              <AutoPilotIcon
                key={`bell-${showAutoPilotModal}`}
                icon={<Bell className="h-16 w-16 text-blue-500" />}
                count={99}
              />
            </div>

            {/* Description Section */}
            <div className="space-y-4 text-left">
              <h2 className="text-2xl font-bold text-foreground">
                What is Auto-pilot?
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Auto-pilot automatically finds extremely high potential Reddit posts matching your keywords, 
                generates personalized comments using AI, and posts them for you. Set it once 
                and let it work 24/7 to engage with potential customers on Reddit while you focus 
                on building your product.
              </p>
              
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Post comments only on extremely high intent posts</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Comments are customized to abide by the subreddit rules</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-foreground flex-shrink-0" />
                  <span>Runs 24/7 without any human intervention</span>
                </li>
              </ul>
            </div>
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

// Auto-pilot Icon Component with Animated Counter
function AutoPilotIcon({ icon, count }: { icon: ReactNode; count: number }) {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const steps = 60; // 60 steps for smooth animation
    const increment = count / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const nextCount = Math.min(Math.ceil(increment * currentStep), count);
      setDisplayCount(nextCount);

      if (currentStep >= steps || nextCount >= count) {
        setDisplayCount(count);
        clearInterval(timer);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [count]);

  return (
    <div className="relative">
      <div className="relative">
        {icon}
        {/* Badge with animated number */}
        <div className="absolute -top-2 -right-2 bg-[#ff4500] text-white rounded-full min-w-[32px] h-8 px-2 flex items-center justify-center text-sm font-bold shadow-lg">
          {displayCount >= count ? "99+" : displayCount}
        </div>
      </div>
    </div>
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

