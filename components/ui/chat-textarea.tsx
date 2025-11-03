"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Select } from "./select";

export interface ChatTextareaProps
    extends Omit<
        React.TextareaHTMLAttributes<HTMLTextAreaElement>,
        "onChange" | "onKeyDown"
    > {
    onSend?: (value: string) => void;
    onChange?: (value: string) => void;
    maxRows?: number;
    minRows?: number;
    sendButtonDisabled?: boolean;
    // Input fields props
    redditPost?: string;
    onRedditPostChange?: (value: string) => void;
    website?: string;
    onWebsiteChange?: (value: string) => void;
    callToAction?: string;
    onCallToActionChange?: (value: string) => void;
    persona?: string;
    onPersonaChange?: (value: string) => void;
    showInputs?: boolean;
    disableCallToAction?: boolean;
    disablePersona?: boolean;
    // Previous ideas props
    previousIdeas?: string[];
    onIdeaSelect?: (value: string) => void;
    selectedIdea?: string;
}

const ChatTextarea = React.forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
    (
        {
            className,
            onSend,
            onChange,
            maxRows = 10,
            minRows = 4,
            sendButtonDisabled,
            value,
            placeholder = "Tell us about your product and what it does...",
            redditPost,
            onRedditPostChange,
            website,
            onWebsiteChange,
            callToAction,
            onCallToActionChange,
            persona,
            onPersonaChange,
            showInputs = true,
            disableCallToAction = false,
            disablePersona = false,
            previousIdeas = [],
            onIdeaSelect,
            selectedIdea,
            ...props
        },
        ref
    ) => {
        const textareaRef = React.useRef<HTMLTextAreaElement>(null);
        const [text, setText] = React.useState<string>(
            typeof value === "string" ? value : ""
        );

        // Combine refs
        React.useImperativeHandle(ref, () => textareaRef.current!);

        // Auto-resize functionality
        const adjustHeight = React.useCallback(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            // Reset height to get accurate scrollHeight
            textarea.style.height = "auto";

            // Calculate the number of lines
            const lineHeight = parseInt(
                window.getComputedStyle(textarea).lineHeight
            );
            const paddingTop = parseInt(
                window.getComputedStyle(textarea).paddingTop
            );
            const paddingBottom = parseInt(
                window.getComputedStyle(textarea).paddingBottom
            );

            const scrollHeight = textarea.scrollHeight;
            const contentHeight = scrollHeight - paddingTop - paddingBottom;
            const numberOfLines = Math.floor(contentHeight / lineHeight);

            // Set min and max rows
            const rows = Math.max(minRows, Math.min(maxRows, numberOfLines));
            textarea.style.height = `${rows * lineHeight + paddingTop + paddingBottom}px`;
        }, [maxRows, minRows]);

        // Update height when text changes
        React.useEffect(() => {
            adjustHeight();
        }, [text, adjustHeight]);

        // Sync with external value prop
        React.useEffect(() => {
            if (value !== undefined && value !== text) {
                setText(typeof value === "string" ? value : "");
            }
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            setText(newValue);
            onChange?.(newValue);
            // Height adjustment happens in useEffect
        };

        const handleSend = () => {
            const trimmedText = text.trim();
            const trimmedWebsite = website?.trim() || "";
            
            // Validate required fields
            const missingFields: string[] = [];
            if (!trimmedText) {
                missingFields.push("Product idea");
            }
            if (!trimmedWebsite) {
                missingFields.push("Website");
            }
            
            if (missingFields.length > 0) {
                const message = `Please fill in the following field${missingFields.length > 1 ? 's' : ''}:\n${missingFields.join('\n')}`;
                alert(message);
                return;
            }
            
            if (trimmedText && !sendButtonDisabled) {
                onSend?.(trimmedText);
                setText("");
                onChange?.("");
                // Reset height after clearing
                setTimeout(() => {
                    const textarea = textareaRef.current;
                    if (textarea) {
                        textarea.style.height = "auto";
                        adjustHeight();
                    }
                }, 0);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Allow Enter to submit, Shift+Enter for new line
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };

        const trimmedText = text.trim();
        const trimmedWebsite = website?.trim() || "";
        const canSend = trimmedText.length > 0 && trimmedWebsite.length > 0 && !sendButtonDisabled;
        
        // Get missing fields for tooltip
        const getMissingFields = () => {
            const missing: string[] = [];
            if (!trimmedText) missing.push("Product idea");
            if (!trimmedWebsite) missing.push("Website");
            return missing;
        };
        
        const missingFields = getMissingFields();
        const tooltipText = missingFields.length > 0 
            ? `Please fill in: ${missingFields.join(", ")}`
            : "";

        return (
            <div
                className={cn(
                    "relative flex max-w-full h-full flex-col bg-background transition-all",
                    className
                )}
            >
                {showInputs && (
                    <div className="px-4 pt-4 pb-1 border border-transparent focus-within:rounded-lg">
                        <div className="flex flex-col gap-4">
                            {onRedditPostChange && (
                                <div className="w-full">
                                    <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                                        Reddit Post Link
                                    </label>
                                    <Input
                                        type="url"
                                        placeholder="https://reddit.com/r/..."
                                        value={redditPost || ""}
                                        onChange={(e) => onRedditPostChange?.(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            )}
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:w-fit">
                                <div className="w-full sm:w-auto">
                                    <Input
                                        type="url"
                                        placeholder="Enter your website URL"
                                        value={website || ""}
                                        onChange={(e) => onWebsiteChange?.(e.target.value)}
                                        className="w-full sm:w-auto sm:min-w-[200px]"
                                    />
                                </div>
                                <div className="flex flex-row gap-4 items-center w-fit sm:w-auto">
                                    <div className="w-auto">
                                        <Select
                                            value={callToAction || ""}
                                            onChange={(e) => onCallToActionChange?.(e.target.value)}
                                            disabled={disableCallToAction}
                                            className="w-full"
                                        >
                                            <option value="try-it-out">Try It Out</option>
                                            <option value="join-waitlist">Join Waitlist</option>
                                            <option value="get-feedback">Get Feedback</option>
                                        </Select>
                                    </div>
                                    <div className="w-auto">
                                        <Select
                                            value={persona || ""}
                                            onChange={(e) => onPersonaChange?.(e.target.value)}
                                            disabled={disablePersona}
                                            className="w-full"
                                        >
                                            <option value="founder">Founder</option>
                                            <option value="user">User</option>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mx-4 mb-4 mt-1 flex flex-1 flex-col gap-2 rounded-lg bg-muted/30 p-2 min-h-0 border border-input">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={minRows}
                        className={cn(
                            "flex-1 resize-none border-0 bg-transparent px-2 py-1 text-base w-full",
                            "placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-0",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            "overflow-y-auto"
                        )}
                        {...props}
                    />
                    <div className="flex items-center justify-between gap-2">
                        {previousIdeas && previousIdeas.length > 0 ? (
                            <div className="w-auto max-w-[180px]">
                                <Select
                                    value={selectedIdea || ""}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        onIdeaSelect?.(value);
                                        // If a valid idea is selected, populate the textarea
                                        if (value && previousIdeas.includes(value)) {
                                            setText(value);
                                            onChange?.(value);
                                        }
                                    }}
                                    className="w-full"
                                >
                                    <option value="">Select previous idea...</option>
                                    {previousIdeas.map((idea, index) => (
                                        <option key={index} value={idea}>
                                            {idea}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        ) : (
                            <div></div>
                        )}
                        <div className="relative group">
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={!canSend}
                                className={cn(
                                    "flex size-8 items-center justify-center rounded-md transition-all shrink-0",
                                    "disabled:opacity-30 disabled:cursor-not-allowed",
                                    canSend
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                )}
                                aria-label="Send message"
                            >
                                <Send className="size-4" />
                            </button>
                            {!canSend && tooltipText && (
                                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    {tooltipText}
                                    <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
);

ChatTextarea.displayName = "ChatTextarea";

export { ChatTextarea };

