"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto grid min-h-full max-w-xl place-items-center p-[var(--space-page)]">
      <EmptyState
        className="w-full"
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Something went wrong"
        description={`We couldn't load this page. Please try again.${error.digest ? ` (Reference: ${error.digest})` : ""}`}
        action={
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        }
      />
    </div>
  );
}
