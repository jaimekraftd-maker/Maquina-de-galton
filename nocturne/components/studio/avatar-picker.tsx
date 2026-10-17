"use client";

import { ImageUp, Link2, Loader2, Palette, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/validation";

const BUILT_IN = ["seraphine", "kaito", "mira", "lucien", "aria", "noa", "sable", "valen", "juno", "keeper"].map(
  (s) => `/characters/${s}.svg`,
);
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type Tab = "upload" | "url" | "gallery";

export function AvatarPicker({
  value,
  onChange,
  name,
  error,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  name: string;
  error?: string;
}) {
  const [tab, setTab] = useState<Tab>("upload");
  const [url, setUrl] = useState(value?.startsWith("https://") ? value : "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!ACCEPT.includes(file.type)) return void toast.error("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > LIMITS.avatarBytes) return void toast.error("Images must be 2 MB or smaller.");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "upload", label: "Upload", icon: <ImageUp className="h-4 w-4" /> },
    { id: "url", label: "Image URL", icon: <Link2 className="h-4 w-4" /> },
    { id: "gallery", label: "Built-in art", icon: <Palette className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="relative shrink-0 self-start">
        <Avatar src={value} name={name || "New character"} rounded="rounded-2xl" className="h-40 w-32 border border-line" />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="glass absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-danger"
            aria-label="Remove image"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div role="group" aria-label="Avatar source" className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
                tab === t.id ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.icon}
              <span className="max-sm:sr-only">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          <div
            className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line-strong p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT.join(",")}
              className="sr-only"
              id="avatar-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Choose image"}
            </Button>
            <p className="text-xs text-subtle">PNG, JPEG, WebP or GIF up to 2 MB. Portrait (4:5) images look best. You can also drop a file here.</p>
          </div>
        ) : null}

        {tab === "url" ? (
          <div className="space-y-2">
            <label htmlFor="avatar-url" className="sr-only">
              Image URL
            </label>
            <div className="flex gap-2">
              <Input id="avatar-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  try {
                    const u = new URL(url.trim());
                    if (u.protocol !== "https:") throw new Error();
                    onChange(u.toString());
                  } catch {
                    toast.error("Enter a valid https:// image URL.");
                  }
                }}
              >
                Use
              </Button>
            </div>
            <p className="text-xs text-subtle">Only use images you have the right to use. If the link breaks, a placeholder is shown.</p>
          </div>
        ) : null}

        {tab === "gallery" ? (
          <ul className="grid grid-cols-5 gap-2">
            {BUILT_IN.map((src) => (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => onChange(src)}
                  className={cn(
                    "block overflow-hidden rounded-xl border-2 transition-colors",
                    value === src ? "border-accent" : "border-transparent hover:border-line-strong",
                  )}
                  aria-label={`Use built-in portrait ${src.split("/").pop()?.replace(".svg", "")}`}
                  aria-pressed={value === src}
                >
                  <img src={src} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
