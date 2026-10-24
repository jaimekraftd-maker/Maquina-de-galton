"use client";

import Link from "next/link";
import { ArrowLeft, Brain, MessageCirclePlus, MoreVertical, Pencil, Pin, PinOff, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteConversation, startConversation, updateConversation } from "@/app/actions/conversations";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function ChatHeader({
  conversationId,
  title,
  pinned,
  memory,
  character,
  status,
}: {
  conversationId: string;
  title: string;
  pinned: boolean;
  memory: string | null;
  character: { id: string; name: string; avatarUrl: string | null } | null;
  status: "online" | "typing" | "offline" | "unavailable";
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [pending, startTransition] = useTransition();

  const statusLabel = {
    online: "Online",
    typing: "typing…",
    offline: "AI provider not configured",
    unavailable: "Character unavailable",
  }[status];

  return (
    <header className="glass z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
      <Link
        href="/library"
        className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-fg lg:hidden"
        aria-label="Back to library"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      {character ? (
        <Link href={`/characters/${character.id}`} className="flex min-w-0 items-center gap-3 rounded-xl">
          <div className="relative">
            <Avatar src={character.avatarUrl} name={character.name} className="h-10 w-10" priority />
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface",
                status === "online" || status === "typing" ? "bg-success" : "bg-warning",
              )}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold">{character.name}</p>
            <p className={cn("truncate text-xs", status === "typing" ? "text-accent" : "text-muted")} aria-live="polite">
              {statusLabel}
            </p>
          </div>
        </Link>
      ) : (
        <p className="text-sm text-muted">Character unavailable</p>
      )}

      <p className="ml-auto hidden max-w-[16rem] truncate text-sm text-subtle md:block" title={title}>
        {title}
      </p>

      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Conversation options" loading={pending} className="max-md:ml-auto">
            {!pending ? <MoreVertical className="h-5 w-5" /> : null}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          {character ? (
            <>
              <DropdownItem onSelect={() => router.push(`/characters/${character.id}`)}>
                <UserRound className="h-4 w-4" /> View profile
              </DropdownItem>
              <DropdownItem
                onSelect={() =>
                  startTransition(async () => {
                    const res = await startConversation(character.id);
                    if (res && !res.ok) toast.error(res.error);
                  })
                }
              >
                <MessageCirclePlus className="h-4 w-4" /> New chat
              </DropdownItem>
              <DropdownSeparator />
            </>
          ) : null}
          <DropdownItem
            onSelect={() =>
              startTransition(async () => {
                const res = await updateConversation(conversationId, { pinned: !pinned });
                if (!res.ok) toast.error(res.error);
                else toast.success(pinned ? "Conversation unpinned" : "Conversation pinned");
                router.refresh();
              })
            }
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {pinned ? "Unpin" : "Pin"}
          </DropdownItem>
          <DropdownItem onSelect={() => setShowMemory(true)}>
            <Brain className="h-4 w-4" /> What {character?.name.split(" ")[0] ?? "they"} remembers
          </DropdownItem>
          <DropdownItem
            onSelect={() => {
              setNewTitle(title);
              setRenaming(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Rename
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete conversation
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this conversation?"
        description="All messages in this conversation will be permanently deleted."
        confirmLabel="Delete conversation"
        onConfirm={async () => {
          const res = await deleteConversation(conversationId);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Conversation deleted");
          router.push("/library");
        }}
      />

      <Dialog open={showMemory} onOpenChange={setShowMemory}>
        <DialogContent
          title={`What ${character?.name ?? "the character"} remembers`}
          description={
            memory
              ? "A summary of the earlier part of this chat. Recent messages are remembered word for word."
              : "This chat is short enough that every message is remembered word for word. Once it gets long, a summary of the older part is kept here."
          }
          className="max-w-lg"
        >
          {memory ? (
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed whitespace-pre-line text-fg/85">
              {memory}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent title="Rename conversation">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await updateConversation(conversationId, { title: newTitle });
                if (!res.ok) return void toast.error(res.error);
                setRenaming(false);
                router.refresh();
              });
            }}
          >
            <label htmlFor="rename" className="sr-only">
              Conversation title
            </label>
            <Input id="rename" value={newTitle} maxLength={100} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending} disabled={!newTitle.trim()}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
