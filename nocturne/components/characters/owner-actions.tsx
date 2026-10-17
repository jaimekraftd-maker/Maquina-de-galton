"use client";

import Link from "next/link";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCharacter, duplicateCharacter } from "@/app/actions/characters";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";

export function OwnerActions({ characterId, name }: { characterId: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button asChild variant="secondary">
        <Link href={`/characters/${characterId}/edit`}>
          <Pencil className="h-4 w-4" /> Edit
        </Link>
      </Button>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More character actions" loading={pending}>
            {!pending ? <MoreHorizontal className="h-[18px] w-[18px]" /> : null}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem
            onSelect={() =>
              startTransition(async () => {
                const res = await duplicateCharacter(characterId);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Duplicated as a private copy");
                router.push(`/characters/${res.data.id}/edit`);
              })
            }
          >
            <Copy className="h-4 w-4" /> Duplicate
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
        title={`Delete ${name}?`}
        description="This permanently deletes the character, along with every conversation anyone has had with them. This can't be undone."
        confirmLabel="Delete character"
        onConfirm={async () => {
          const res = await deleteCharacter(characterId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`${name} was deleted`);
          router.push("/library?tab=created");
        }}
      />
    </>
  );
}
