"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <RD.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line-strong bg-surface-2 p-6 shadow-card focus:outline-none",
          className,
        )}
      >
        <RD.Title className="font-display text-lg font-semibold">{title}</RD.Title>
        {description ? (
          <RD.Description className="mt-1.5 text-sm text-muted">{description}</RD.Description>
        ) : (
          <RD.Description className="sr-only">{title}</RD.Description>
        )}
        <div className="mt-5">{children}</div>
        <RD.Close
          className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </RD.Close>
      </RD.Content>
    </RD.Portal>
  );
}
