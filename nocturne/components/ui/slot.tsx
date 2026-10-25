import { Children, cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

/** Minimal Slot: merges props/className into its single child (for `asChild`). */
export function Slot({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const child = Children.only(children);
  if (!isValidElement<{ className?: string }>(child)) return null;
  return cloneElement(child, { ...props, ...child.props, className: cn(className, child.props.className) });
}
