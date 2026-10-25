"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/validation";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  stopping,
  disabled,
  disabledReason,
  characterName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  stopping: boolean;
  disabled: boolean;
  disabledReason?: string;
  characterName: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a max height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Keep focus in the composer after a reply finishes (desktop only).
  useEffect(() => {
    if (!streaming && !disabled && window.matchMedia("(hover: hover)").matches) ref.current?.focus();
  }, [streaming, disabled]);

  const tooLong = value.length > LIMITS.message;
  const canSend = !disabled && !streaming && value.trim().length > 0 && !tooLong;

  return (
    <div className="mx-auto w-full max-w-[var(--measure-chat)]">
      <div
        className={cn(
          "flex items-end gap-2 rounded-[1.4rem] border border-line-strong bg-surface-2/90 p-2 pl-4 shadow-card transition-colors focus-within:border-accent/50",
          disabled && "opacity-70",
        )}
      >
        <label htmlFor="composer" className="sr-only">
          Message {characterName}
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={disabled ? (disabledReason ?? "Chat unavailable") : `Message ${characterName}…`}
          aria-describedby="composer-help"
          className="max-h-[200px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 focus-visible:outline-none text-[15px] leading-relaxed text-fg placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-fg transition-colors hover:bg-white/15 disabled:opacity-50"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-accent to-accent-strong text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-35"
            aria-label="Send message"
            title="Send (Enter)"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
      <p id="composer-help" className="mt-1.5 flex justify-between px-3 text-[11px] text-subtle">
        <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
        <span className="sm:hidden">AI characters can say inaccurate things.</span>
        <span className={cn("tabular-nums", tooLong ? "text-danger" : value.length > LIMITS.message * 0.8 ? "" : "invisible")}>
          {value.length}/{LIMITS.message}
        </span>
      </p>
    </div>
  );
}
