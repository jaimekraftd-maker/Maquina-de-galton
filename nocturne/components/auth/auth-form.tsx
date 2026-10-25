"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const fe = state.fieldErrors ?? {};

  if (state.message) {
    return (
      <div role="status" className="space-y-3 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-accent" />
        <p className="font-medium">{state.message}</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-sm text-accent hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {mode === "signup" ? (
        <Field id="displayName" label="Display name" error={fe.displayName}>
          <Input id="displayName" name="displayName" autoComplete="nickname" required maxLength={40} aria-invalid={!!fe.displayName || undefined} />
        </Field>
      ) : null}
      <Field id="email" label="Email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email || undefined} />
      </Field>
      <Field id="password" label="Password" error={fe.password} hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          aria-invalid={!!fe.password || undefined}
        />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? "New to Nocturne? " : "Already have an account? "}
        <Link
          href={`/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(next)}`}
          className="font-medium text-accent hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
