"use client";

import Link from "next/link";
import { MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteConversation, updateConversation } from "@/app/actions/conversations";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import type { ConversationWithCharacter } from "@/lib/data/types";
import { previewText, relativeTime } from "@/lib/utils";

function Row({ c }: { c: ConversationWithCharacter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const name = c.character?.name ?? "Unavailable character";

  return (
    <li className="group relative flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-2 sm:gap-4 sm:p-4">
      <Avatar src={c.character?.avatarUrl} name={name} rounded="rounded-xl" className="h-12 w-12 sm:h-14 sm:w-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/chat/${c.id}`} className="truncate font-medium after:absolute after:inset-0 after:rounded-2xl">
            {name}
          </Link>
          {c.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Pinned" /> : null}
          <span className="ml-auto shrink-0 text-xs text-subtle">{relativeTime(c.lastActivityAt)}</span>
        </div>
        <p className="truncate text-sm text-muted">{c.title}</p>
        {c.lastMessagePreview ? <p className="mt-0.5 truncate text-xs text-subtle">{previewText(c.lastMessagePreview)}</p> : null}
      </div>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Options for ${c.title}`} loading={pending}>
            {!pending ? <MoreHorizontal className="h-4 w-4" /> : null}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem
            onSelect={() =>
              startTransition(async () => {
                const res = await updateConversation(c.id, { pinned: !c.pinned });
                if (!res.ok) toast.error(res.error);
                router.refresh();
              })
            }
          >
            {c.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {c.pinned ? "Unpin" : "Pin to top"}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this conversation?"
        description={`Your chat with ${name} and all of its messages will be permanently deleted.`}
        confirmLabel="Delete conversation"
        onConfirm={async () => {
          const res = await deleteConversation(c.id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Conversation deleted");
          router.refresh();
        }}
      />
    </li>
  );
}

export function ConversationList({ conversations }: { conversations: ConversationWithCharacter[] }) {
  const pinned = conversations.filter((c) => c.pinned);
  const rest = conversations.filter((c) => !c.pinned);
  return (
    <div className="space-y-6">
      {pinned.length ? (
        <section aria-labelledby="pinned-heading" className="space-y-2">
          <h2 id="pinned-heading" className="text-xs font-semibold tracking-wider text-subtle uppercase">
            Pinned
          </h2>
          <ul className="space-y-2">
            {pinned.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        </section>
      ) : null}
      {rest.length ? (
        <section aria-labelledby="history-heading" className="space-y-2">
          <h2 id="history-heading" className="text-xs font-semibold tracking-wider text-subtle uppercase">
            {pinned.length ? "All conversations" : "Recent conversations"}
          </h2>
          <ul className="space-y-2">
            {rest.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
