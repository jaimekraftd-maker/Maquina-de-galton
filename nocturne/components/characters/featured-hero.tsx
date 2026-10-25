"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { categoryLabel } from "@/lib/data/types";
import { StartChatButton } from "./start-chat-button";

export interface FeaturedItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  avatarUrl: string | null;
  categories: string[];
  tags: string[];
}

export function FeaturedHero({ items }: { items: FeaturedItem[] }) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const item = items[index % items.length];
  const go = (d: number) => setIndex((i) => (i + d + items.length) % items.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured characters"
      className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-card"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_24rem_at_75%_30%,rgb(139_101_247/0.25),transparent_70%)]" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid items-center gap-6 p-5 sm:p-8 md:grid-cols-[1fr_auto] md:gap-10 md:p-10"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${items.length}: ${item.name}`}
        >
          <div className="order-2 min-w-0 md:order-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-[#d6c8ff]">
              <Sparkles className="h-3.5 w-3.5" /> Featured character
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              <span className="text-gradient">{item.name}</span>
            </h1>
            <p className="mt-2 text-base text-fg/85 sm:text-lg">{item.tagline}</p>
            <p className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-muted sm:text-[15px]">{item.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.categories.map((c) => (
                <span key={c} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-muted">
                  {categoryLabel(c)}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <StartChatButton characterId={item.id} size="lg" />
              <Link href={`/characters/${item.id}`} className={buttonClasses("secondary", "lg")}>
                View profile
              </Link>
            </div>
          </div>
          <div className="order-1 mx-auto md:order-2">
            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-accent/40 to-rose/30 opacity-60 blur-2xl" />
              <Avatar
                src={item.avatarUrl}
                name={item.name}
                priority
                rounded="rounded-[1.5rem]"
                className="relative h-56 w-[11.2rem] border border-white/10 sm:h-72 sm:w-[14.4rem] lg:h-80 lg:w-64"
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {items.length > 1 ? (
        <div className="relative flex items-center justify-between gap-3 px-5 pb-5 sm:px-8 md:px-10 md:pb-8">
          <div className="flex gap-1.5" role="group" aria-label="Choose featured character">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${it.name}`}
                aria-current={i === index ? "true" : undefined}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-accent" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white/[0.04] text-muted hover:text-fg"
              aria-label="Previous featured character"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white/[0.04] text-muted hover:text-fg"
              aria-label="Next featured character"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
