import { cn } from "@/lib/utils";

const control =
  "w-full rounded-control border border-line bg-surface-2/80 px-3.5 text-[15px] text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:ring-danger/20 disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-10 cursor-pointer appearance-none pr-8", className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  count?: { value: number; max: number };
  children: React.ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up with aria-describedby by id convention. */
export function Field({ id, label, hint, error, required, count, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {required ? (
            <span className="ml-0.5 text-rose" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {count ? (
          <span className={cn("text-xs tabular-nums", count.value > count.max ? "text-danger" : "text-subtle")}>
            {count.value}/{count.max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
