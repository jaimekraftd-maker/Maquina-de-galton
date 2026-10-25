"use client";

import { Eye, EyeOff, Globe, Lock, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCharacter } from "@/app/actions/characters";
import { RichText } from "@/components/chat/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CATEGORIES, categoryLabel, type CategoryId, type CharacterInput } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { characterInputSchema, fieldErrors, LIMITS } from "@/lib/validation";
import { AvatarPicker } from "./avatar-picker";
import { ChipInput } from "./chip-input";

export const EMPTY_CHARACTER: CharacterInput = {
  name: "",
  tagline: "",
  description: "",
  personality: "",
  traits: [],
  background: "",
  greeting: "",
  scenario: "",
  exampleDialogue: "",
  speakingStyle: "",
  tags: [],
  categories: [],
  avatarUrl: null,
  visibility: "public",
};

const FIELD_ORDER = [
  "name",
  "tagline",
  "avatarUrl",
  "categories",
  "description",
  "personality",
  "traits",
  "speakingStyle",
  "greeting",
  "scenario",
  "exampleDialogue",
  "background",
  "tags",
] as const;

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-card border border-line bg-surface/80 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function CharacterStudio({ characterId, initial }: { characterId: string | null; initial: CharacterInput }) {
  const router = useRouter();
  const [values, setValues] = useState<CharacterInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [saving, startSaving] = useTransition();
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));
  const dirty = useMemo(() => JSON.stringify(values) !== savedSnapshot, [values, savedSnapshot]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof CharacterInput>(key: K, value: CharacterInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
  };

  const text = (key: keyof CharacterInput, max: number) => ({
    id: key,
    value: values[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${key}-error` : `${key}-hint`,
    maxLength: max + 200,
  });

  const focusFirstError = (errs: Record<string, string>) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) document.getElementById(first === "categories" ? "categories-group" : first)?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = characterInputSchema.safeParse(values);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      focusFirstError(errs);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    startSaving(async () => {
      const res = await saveCharacter(characterId, parsed.data);
      if (!res.ok) {
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          focusFirstError(res.fieldErrors);
        }
        toast.error(res.error);
        return;
      }
      setSavedSnapshot(JSON.stringify(values));
      toast.success(characterId ? "Character saved" : `${parsed.data.name} is ready to chat`);
      router.push(`/characters/${res.data.id}`);
    });
  };

  const count = (key: keyof CharacterInput, max: number) => ({ value: (values[key] as string).length, max });

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <SectionCard title="Identity" description="How your character appears in Discover and search.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Character name" required error={errors.name} count={count("name", LIMITS.name)}>
              <Input {...text("name", LIMITS.name)} placeholder="e.g. Seraphine Vale" autoComplete="off" />
            </Field>
            <Field id="tagline" label="Short description" required error={errors.tagline} hint="One line shown on cards." count={count("tagline", LIMITS.tagline)}>
              <Input {...text("tagline", LIMITS.tagline)} placeholder="Archivist of a library that catalogs dreams." />
            </Field>
          </div>
          <Field id="avatarUrl" label="Avatar image" error={errors.avatarUrl}>
            <AvatarPicker value={values.avatarUrl} onChange={(v) => set("avatarUrl", v)} name={values.name} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Categories <span className="text-rose" aria-hidden>*</span>
              <span className="ml-2 text-xs font-normal text-subtle">Pick 1–3</span>
            </legend>
            <div
              id="categories-group"
              tabIndex={-1}
              className="flex flex-wrap gap-2 focus:outline-none"
              aria-describedby={errors.categories ? "categories-error" : undefined}
            >
              {CATEGORIES.map((c) => {
                const on = values.categories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "categories",
                        on
                          ? values.categories.filter((x) => x !== c.id)
                          : values.categories.length < LIMITS.categories
                            ? [...values.categories, c.id as CategoryId]
                            : values.categories,
                      )
                    }
                    className={cn(
                      "h-9 rounded-full border px-4 text-sm transition-colors",
                      on ? "border-accent/60 bg-accent-soft text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {errors.categories ? (
              <p id="categories-error" className="text-sm text-danger" role="alert">
                {errors.categories}
              </p>
            ) : null}
          </fieldset>
          <Field id="tags" label="Tags" error={errors.tags} hint={`Up to ${LIMITS.tags}. Press Enter or comma to add.`}>
            <ChipInput
              id="tags"
              values={values.tags}
              onChange={(v) => set("tags", v.map((t) => t.toLowerCase()))}
              max={LIMITS.tags}
              maxLength={LIMITS.tag}
              placeholder="e.g. cozy, space, detective"
              prefix="#"
              invalid={!!errors.tags}
              describedBy={errors.tags ? "tags-error" : "tags-hint"}
            />
          </Field>
        </SectionCard>

        <SectionCard title="Personality" description="This is what the AI uses to stay in character.">
          <Field id="description" label="Full description" required error={errors.description} count={count("description", LIMITS.description)} hint="Who they are and what makes them interesting.">
            <Textarea {...text("description", LIMITS.description)} rows={4} />
          </Field>
          <Field id="personality" label="Personality" required error={errors.personality} count={count("personality", LIMITS.personality)} hint="Temperament, values, quirks, how they treat others.">
            <Textarea {...text("personality", LIMITS.personality)} rows={4} />
          </Field>
          <Field id="traits" label="Personality traits" error={errors.traits} hint={`Up to ${LIMITS.traits} short traits.`}>
            <ChipInput
              id="traits"
              values={values.traits}
              onChange={(v) => set("traits", v)}
              max={LIMITS.traits}
              maxLength={LIMITS.trait}
              placeholder="e.g. Curious, Loyal"
              invalid={!!errors.traits}
              describedBy={errors.traits ? "traits-error" : "traits-hint"}
            />
          </Field>
          <Field id="speakingStyle" label="Speaking style" error={errors.speakingStyle} count={count("speakingStyle", LIMITS.speakingStyle)} hint="Tone, vocabulary, sentence length, verbal tics.">
            <Textarea {...text("speakingStyle", LIMITS.speakingStyle)} rows={2} />
          </Field>
          <Field id="background" label="Background story" error={errors.background} count={count("background", LIMITS.background)}>
            <Textarea {...text("background", LIMITS.background)} rows={4} />
          </Field>
        </SectionCard>

        <SectionCard title="Conversation" description="How chats begin and what they sound like.">
          <Field id="greeting" label="Greeting message" required error={errors.greeting} count={count("greeting", LIMITS.greeting)} hint="The first message of every new chat. Use *asterisks* for actions.">
            <Textarea {...text("greeting", LIMITS.greeting)} rows={4} />
          </Field>
          <Field id="scenario" label="Scenario" error={errors.scenario} count={count("scenario", LIMITS.scenario)} hint="The situation the user steps into.">
            <Textarea {...text("scenario", LIMITS.scenario)} rows={3} />
          </Field>
          <Field id="exampleDialogue" label="Example dialogue" error={errors.exampleDialogue} count={count("exampleDialogue", LIMITS.exampleDialogue)} hint="A short sample exchange that shows their voice.">
            <Textarea {...text("exampleDialogue", LIMITS.exampleDialogue)} rows={4} placeholder={"User: …\nCharacter: …"} />
          </Field>
        </SectionCard>

        <SectionCard title="Visibility">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Who can see this character</legend>
            {(
              [
                ["public", "Public", "Anyone can discover and chat.", Globe],
                ["private", "Private", "Only you can see and chat.", Lock],
              ] as const
            ).map(([id, label, desc, Icon]) => (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                  values.visibility === id ? "border-accent/50 bg-accent-soft" : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={id}
                  checked={values.visibility === id}
                  onChange={() => set("visibility", id)}
                  className="sr-only"
                />
                <Icon className="mt-0.5 h-5 w-5 text-accent" />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted">{desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </SectionCard>

        <div className="glass sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
          <p className="text-sm text-muted" aria-live="polite">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="xl:hidden" onClick={() => setShowPreview((s) => !s)} aria-expanded={showPreview} aria-controls="studio-preview">
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Preview
            </Button>
            <Button type="submit" loading={saving}>
              {!saving ? <Save className="h-4 w-4" /> : null}
              {characterId ? "Save changes" : "Save character"}
            </Button>
          </div>
        </div>
      </div>

      <aside id="studio-preview" aria-label="Live preview" className={cn("xl:block", showPreview ? "block" : "hidden")}>
        <div className="space-y-4 xl:sticky xl:top-6">
          <p className="text-xs font-semibold tracking-wider text-subtle uppercase">Live preview</p>
          <Preview values={values} />
        </div>
      </aside>
    </form>
  );
}

function Preview({ values }: { values: CharacterInput }) {
  const name = values.name.trim() || "Your character";
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-line bg-surface shadow-card">
      <div className="relative">
        <Avatar src={values.avatarUrl} name={name} rounded="rounded-none" className="aspect-[4/5] w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-display text-xl font-semibold">{name}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-fg/75">{values.tagline || "A short description appears here."}</p>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {values.categories.map((c) => (
            <Badge key={c} tone="accent">
              {categoryLabel(c)}
            </Badge>
          ))}
          {values.traits.map((t) => (
            <Badge key={t} tone="rose">
              {t}
            </Badge>
          ))}
          {values.tags.map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
        </div>
        {values.description ? <p className="line-clamp-4 text-sm leading-relaxed text-muted">{values.description}</p> : null}
        <div className="flex gap-2.5">
          <Avatar src={values.avatarUrl} name={name} className="h-8 w-8" />
          <div className="min-w-0 rounded-bubble rounded-tl-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed">
            {values.greeting ? <RichText text={values.greeting} /> : <span className="text-subtle">The greeting starts every chat.</span>}
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          {values.visibility === "public" ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {values.visibility === "public" ? "Public character" : "Private — only you"}
        </p>
      </div>
    </div>
  );
}
