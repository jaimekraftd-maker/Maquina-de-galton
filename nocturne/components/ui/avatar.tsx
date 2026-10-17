"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * Character / user image with a graceful fallback: if the URL is missing or
 * fails to load, renders a gradient with initials. Preserves aspect ratio via
 * object-cover inside a sized box.
 */
export function Avatar({
  src,
  name,
  className,
  rounded = "rounded-full",
  priority = false,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;
  const h = hue(name);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-surface-3", rounded, className)} style={{ containerType: "inline-size" }}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div
          role="img"
          aria-label={name}
          className="grid h-full w-full place-items-center font-display font-semibold text-white/90"
          style={{
            background: `linear-gradient(140deg, hsl(${h} 55% 42%), hsl(${(h + 50) % 360} 60% 22%))`,
            fontSize: "clamp(0.65rem, 36cqw, 3rem)",
          }}
        >
          {initials || "?"}
        </div>
      )}
    </div>
  );
}
