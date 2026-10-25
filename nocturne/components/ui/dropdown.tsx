"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({ className, align = "end", ...props }: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-card focus:outline-none",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownItem({
  className,
  destructive,
  ...props
}: DM.DropdownMenuItemProps & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive ? "text-danger data-[highlighted]:bg-danger-soft" : "text-fg data-[highlighted]:bg-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export function DropdownLabel({ className, ...props }: DM.DropdownMenuLabelProps) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-xs text-subtle", className)} {...props} />;
}
