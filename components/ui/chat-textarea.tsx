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
}

const ChatTextarea = React.forwardRef<HTMLTextAreaElement, ChatTextareaProps>(
    (
        {
            className,
            onSend,
            onChange,
            maxRows = 10,
            minRows = 2,
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

        const canSend = text.trim().length > 0 && !sendButtonDisabled;

        return (
            <div
                className={cn(
                    "relative flex max-w-full h-full flex-col bg-background transition-all",
                    className
                )}
            >
                {showInputs && (
                    <div className="p-4 border border-transparent focus-within:border-border focus-within:rounded-lg">
                        <div className="flex flex-col gap-4">
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
                            <div className="w-full">
                                <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                                    Website
                                </label>
                                <Input
                                    type="url"
                                    placeholder="Enter your website URL"
                                    value={website || ""}
                                    onChange={(e) => onWebsiteChange?.(e.target.value)}
                                    className="w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <div className="flex-1">
                                    <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                                        Call to Action
                                    </label>
                                    <Select
                                        value={callToAction || ""}
                                        onChange={(e) => onCallToActionChange?.(e.target.value)}
                                    >
                                        <option value="try-it-out">Try It Out</option>
                                        <option value="join-waitlist">Join Waitlist</option>
                                        <option value="get-feedback">Get Feedback</option>
                                    </Select>
                                </div>
                                <div className="flex-1">
                                    <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                                        Persona
                                    </label>
                                    <Select
                                        value={persona || ""}
                                        onChange={(e) => onPersonaChange?.(e.target.value)}
                                    >
                                        <option value="">Persona</option>
                                        <option value="casual">Casual</option>
                                        <option value="professional">Professional</option>
                                        <option value="enthusiastic">Enthusiastic</option>
                                        <option value="friendly">Friendly</option>
                                        <option value="formal">Formal</option>
                                        <option value="conversational">Conversational</option>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mx-4 mb-4 mt-4 flex flex-1 flex-col gap-2 rounded-lg bg-muted/30 p-4 min-h-0 border border-transparent focus-within:border-border">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={minRows}
                        className={cn(
                            "flex-1 resize-none border-0 bg-transparent px-2 py-3 text-sm w-full",
                            "placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-0",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            "overflow-y-auto"
                        )}
                        {...props}
                    />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={!canSend}
                            className={cn(
                                "flex size-8 items-center justify-center rounded-md transition-all",
                                "disabled:opacity-30 disabled:cursor-not-allowed",
                                canSend
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                            )}
                            aria-label="Send message"
                        >
                            <Send className="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }
);

ChatTextarea.displayName = "ChatTextarea";

export { ChatTextarea };

