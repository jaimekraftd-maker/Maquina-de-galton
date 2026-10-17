"use client";

import { MessageCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { startConversation } from "@/app/actions/conversations";
import { Button, type ButtonProps } from "@/components/ui/button";

export function StartChatButton({
  characterId,
  label = "Start chat",
  ...props
}: { characterId: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await startConversation(characterId);
          if (res && !res.ok) toast.error(res.error);
        })
      }
    >
      {!pending ? <MessageCircle className="h-4 w-4" /> : null}
      {label}
    </Button>
  );
}
