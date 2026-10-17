"use client";

import { AlertTriangle, ArrowDown, KeyRound, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readError, readEvents } from "@/lib/chat/client";
import type { Message } from "@/lib/data/types";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageItem, StreamingMessage } from "./message-item";

type Mode = "send" | "regenerate" | "retry" | "edit";

interface ChatError {
  message: string;
  retryable: boolean;
  code: string;
}

export interface ChatViewProps {
  conversation: { id: string; title: string; pinned: boolean };
  character: { id: string; name: string; avatarUrl: string | null } | null;
  initialMessages: Message[];
  providerProblem: string | null;
}

const NEAR_BOTTOM_PX = 120;

export function ChatView({ conversation, character, initialMessages, providerProblem }: ChatViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const busyRef = useRef(false);
  const fetchAbort = useRef<AbortController | null>(null);
  const pendingText = useRef("");
  const frame = useRef<number | null>(null);

  const streaming = streamText !== null;
  const characterName = character?.name ?? "Character";
  const disabledReason = !character
    ? "This character is no longer available."
    : providerProblem
      ? "The AI provider isn't configured on the server."
      : undefined;

  // ---- scrolling ------------------------------------------------------------
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  // Follow new content only while the reader is already near the bottom.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom(streaming ? "instant" : "smooth");
  }, [messages, streamText, error, streaming, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setAtBottom(near);
  };

  // ---- server sync ------------------------------------------------------------
  const syncFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, { cache: "no-store" });
      if (res.ok) setMessages(((await res.json()) as { messages: Message[] }).messages);
    } catch {
      // keep local state; the next action will resync
    }
  }, [conversation.id]);

  // Abort any in-flight request when leaving the page.
  useEffect(() => () => fetchAbort.current?.abort(), []);

  // ---- generation ---------------------------------------------------------------
  const run = useCallback(
    async (mode: Mode, payload: { content?: string; messageId?: string } = {}) => {
      if (busyRef.current || !character || providerProblem) return;
      busyRef.current = true;
      setError(null);
      atBottomRef.current = true;

      const snapshot = messages;
      if (mode === "send") {
        const temp: Message = {
          id: `temp-${Date.now()}`,
          conversationId: conversation.id,
          role: "user",
          content: payload.content!,
          seq: Number.MAX_SAFE_INTEGER,
          metadata: {},
          createdAt: new Date().toISOString(),
        };
        setMessages((m) => [...m, temp]);
      } else if (mode === "regenerate") {
        setMessages((m) => m.slice(0, -1));
      } else if (mode === "edit") {
        setMessages((m) => {
          const i = m.findIndex((x) => x.id === payload.messageId);
          return i === -1 ? m : [...m.slice(0, i), { ...m[i], content: payload.content! }];
        });
      }
      setStreamText("");

      const controller = new AbortController();
      fetchAbort.current = controller;
      let finished = false;

      const flush = () => {
        frame.current = null;
        const chunk = pendingText.current;
        pendingText.current = "";
        if (chunk) setStreamText((t) => (t ?? "") + chunk);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, conversationId: conversation.id, ...payload }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await readError(res);
          setMessages(snapshot);
          if (mode === "send") setDraft(payload.content!);
          setError({ message: err.error, retryable: false, code: err.code });
          if (err.code === "rate_limited") toast.error(err.error);
          return;
        }

        for await (const event of readEvents(res)) {
          switch (event.type) {
            case "start":
              setMessages((m) => {
                let next = m.filter((x) => !x.id.startsWith("temp-") && !event.removedMessageIds.includes(x.id));
                if (event.userMessage) {
                  const um = event.userMessage;
                  next = next.some((x) => x.id === um.id) ? next.map((x) => (x.id === um.id ? um : x)) : [...next, um];
                }
                return next;
              });
              break;
            case "delta":
              pendingText.current += event.text;
              frame.current ??= requestAnimationFrame(flush);
              break;
            case "done":
              finished = true;
              setMessages((m) => [...m, event.message]);
              if (event.refused) toast.message(`${characterName} declined to respond to that.`);
              break;
            case "error":
              finished = true;
              if (event.message) setMessages((m) => [...m, event.message!]);
              if (event.code !== "aborted") setError({ message: event.error, retryable: event.retryable, code: event.code });
              break;
          }
        }
        if (!finished) {
          setError({ message: "The connection was interrupted.", retryable: true, code: "network" });
          await syncFromServer();
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // We aborted locally (stop fallback / navigation). The server saved what it had.
          await new Promise((r) => setTimeout(r, 400));
          await syncFromServer();
        } else {
          setError({ message: "Couldn't reach the server. Check your connection.", retryable: true, code: "network" });
          await syncFromServer();
        }
      } finally {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = null;
        pendingText.current = "";
        setStreamText(null);
        setStopping(false);
        fetchAbort.current = null;
        busyRef.current = false;
        router.refresh(); // update sidebar (titles, recent order)
      }
    },
    [character, characterName, conversation.id, messages, providerProblem, router, syncFromServer],
  );

  const stop = async () => {
    if (!streaming || stopping) return;
    setStopping(true);
    try {
      const res = await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const { stopped } = (await res.json()) as { stopped?: boolean };
      // The generation may be running on another server instance: drop the stream locally.
      if (!stopped) fetchAbort.current?.abort();
    } catch {
      fetchAbort.current?.abort();
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void run("send", { content: text });
  };

  // ---- derived state for message actions ------------------------------------------
  const last = messages.at(-1);
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;
  const hasUserMessage = Boolean(lastUserId);
  const canRetry = !streaming && last?.role === "user" && !last.id.startsWith("temp-");

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        conversationId={conversation.id}
        title={conversation.title}
        pinned={conversation.pinned}
        character={character}
        status={!character ? "unavailable" : providerProblem ? "offline" : streaming ? "typing" : "online"}
      />

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-3 sm:px-6">
          <div className="mx-auto max-w-[var(--measure-chat)] py-6">
            {providerProblem ? (
              <div role="status" className="mb-6 flex gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 text-sm">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-warning">AI replies are unavailable</p>
                  <p className="mt-1 text-muted">{providerProblem}</p>
                </div>
              </div>
            ) : null}

            <ol className="space-y-5" aria-label="Messages">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  characterName={characterName}
                  avatarUrl={character?.avatarUrl ?? null}
                  busy={streaming || !character || !!providerProblem}
                  canEdit={m.role === "user" && m.id === lastUserId && !m.id.startsWith("temp-")}
                  canRegenerate={m.role === "assistant" && m.id === last?.id && hasUserMessage}
                  onRegenerate={() => void run("regenerate")}
                  onEdit={(content) => void run("edit", { messageId: m.id, content })}
                />
              ))}
              {streaming ? <StreamingMessage text={streamText} characterName={characterName} avatarUrl={character?.avatarUrl ?? null} /> : null}
            </ol>

            {error ? (
              <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                <p className="min-w-0 flex-1 text-fg/90">{error.message}</p>
                {canRetry ? (
                  <Button size="sm" variant="secondary" onClick={() => void run("retry")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                ) : last?.role === "assistant" && hasUserMessage && error.retryable ? (
                  <Button size="sm" variant="secondary" onClick={() => void run("regenerate")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {!atBottom ? (
          <button
            type="button"
            onClick={() => {
              atBottomRef.current = true;
              scrollToBottom();
            }}
            className="glass absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium text-fg shadow-card"
          >
            <ArrowDown className="h-3.5 w-3.5" /> Jump to latest
          </button>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          stopping={stopping}
          disabled={!!disabledReason}
          disabledReason={disabledReason}
          characterName={characterName}
        />
      </div>
    </div>
  );
}
