"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Free-form list input: type and press Enter or comma to add; Backspace removes the last item. */
export function ChipInput({
  id,
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  prefix = "",
  invalid,
  describedBy,
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  maxLength: number;
  placeholder: string;
  prefix?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/^#/, "").slice(0, maxLength);
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
  };

  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface-2/80 px-2 py-1.5 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25 hover:border-line-strong",
        invalid && "border-danger/60",
      )}
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-sm text-fg">
          {prefix}
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-fg"
            aria-label={`Remove ${v}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={values.length >= max}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            v.split(",").slice(0, -1).forEach(add);
            setText(v.split(",").at(-1) ?? "");
          } else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
            setText("");
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => {
          add(text);
          setText("");
        }}
        placeholder={values.length >= max ? `Maximum ${max}` : placeholder}
        className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[15px] text-fg placeholder:text-subtle focus:outline-none"
      />
    </div>
  );
}
