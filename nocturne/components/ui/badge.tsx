import { cn } from "@/lib/utils";

const tones = {
  default: "bg-white/[0.06] text-muted border-line",
  accent: "bg-accent-soft text-[#c9b6ff] border-accent/25",
  rose: "bg-rose-soft text-rose border-rose/25",
  warning: "bg-warning/10 text-warning border-warning/25",
} as const;

export function Badge({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
