"use client";

import { motion } from "motion/react";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/validation";
import { RichText } from "./rich-text";

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg text-subtle [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 transition-colors hover:bg-white/[0.07] hover:text-fg"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/** Clipboard API needs a secure context (https); fall back for http on a local network. */
async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  el.remove();
  if (!ok) throw new Error("copy failed");
}

export function MessageItem({
  message,
  characterName,
  avatarUrl,
  canRegenerate,
  canEdit,
  busy,
  onRegenerate,
  onEdit,
}: {
  message: Message;
  characterName: string;
  avatarUrl: string | null;
  canRegenerate: boolean;
  canEdit: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await copyText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const actions = (
    <div
      className={cn(
        "mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <ActionButton label={copied ? "Copied" : "Copy message"} onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionButton>
      {canEdit && !busy ? (
        <ActionButton
          label="Edit and resend"
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
      {canRegenerate && !busy ? (
        <ActionButton label="Regenerate response" onClick={onRegenerate}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
    </div>
  );

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group flex gap-3", isUser && "flex-row-reverse")}
    >
      {!isUser ? <Avatar src={avatarUrl} name={characterName} className="mt-0.5 h-9 w-9" /> : null}
      <div className={cn("flex min-w-0 flex-col", isUser ? "max-w-[85%] items-end" : "max-w-[92%] sm:max-w-[85%]")}>
        {!isUser ? <span className="mb-1 ml-1 text-xs font-medium text-muted">{characterName}</span> : null}
        {editing ? (
          <form
            className="w-[min(36rem,80vw)] space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text || text.length > LIMITS.message) return;
              setEditing(false);
              onEdit(text);
            }}
          >
            <label htmlFor={`edit-${message.id}`} className="sr-only">
              Edit message
            </label>
            <textarea
              id={`edit-${message.id}`}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              className="w-full resize-y rounded-2xl border border-accent/40 bg-surface-2 px-4 py-3 text-[15px] leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim() || draft.length > LIMITS.message}>
                Save & resend
              </Button>
            </div>
          </form>
        ) : (
          <div
            className={cn(
              "rounded-bubble px-4 py-3 text-[15px] leading-relaxed break-words",
              isUser
                ? "rounded-tr-md border border-accent/25 bg-gradient-to-br from-accent/25 to-accent/10 text-fg"
                : "rounded-tl-md border border-line bg-surface-2/90 text-fg/90",
            )}
          >
            <RichText text={message.content} />
            {message.metadata.interrupted ? (
              <p className="mt-2 text-xs text-subtle italic">Response was interrupted.</p>
            ) : null}
            {message.metadata.edited ? <p className="mt-1 text-right text-[11px] text-subtle">edited</p> : null}
          </div>
        )}
        {!editing ? actions : null}
      </div>
    </motion.li>
  );
}

export function StreamingMessage({ text, characterName, avatarUrl }: { text: string; characterName: string; avatarUrl: string | null }) {
  return (
    <li className="flex gap-3" aria-live="polite" aria-busy="true">
      <Avatar src={avatarUrl} name={characterName} className="mt-0.5 h-9 w-9" />
      <div className="flex max-w-[92%] min-w-0 flex-col sm:max-w-[85%]">
        <span className="mb-1 ml-1 text-xs font-medium text-muted">{characterName}</span>
        <div className="rounded-bubble rounded-tl-md border border-line bg-surface-2/90 px-4 py-3 text-[15px] leading-relaxed break-words text-fg/90">
          {text ? (
            <div className="caret">
              <RichText text={text} className="[&>p:last-child]:inline" />
            </div>
          ) : (
            <span className="flex h-6 items-center gap-1" aria-label={`${characterName} is typing`}>
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
