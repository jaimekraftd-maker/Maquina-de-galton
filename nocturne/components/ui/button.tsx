import { Slot } from "./slot";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-gradient-to-b from-accent to-accent-strong text-white shadow-[0_8px_24px_-8px_rgb(139_101_247/0.7)] hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-3 text-fg border border-line hover:bg-[#2a2539] hover:border-line-strong",
  ghost: "text-muted hover:text-fg hover:bg-white/5",
  outline: "border border-line-strong text-fg hover:bg-white/5",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-control",
  lg: "h-12 px-6 text-base gap-2 rounded-control",
  icon: "h-10 w-10 rounded-control",
  "icon-sm": "h-8 w-8 rounded-[10px]",
} as const;

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
  loading?: boolean;
};

export function buttonClasses(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background,color,filter,border-color,transform] duration-150 select-none",
    "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant, size, asChild, loading, className, children, disabled, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
