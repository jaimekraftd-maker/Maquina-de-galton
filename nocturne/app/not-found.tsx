import Link from "next/link";
import { Ghost } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-full max-w-xl place-items-center p-[var(--space-page)]">
      <EmptyState
        className="w-full"
        icon={<Ghost className="h-6 w-6" />}
        title="Nothing here"
        description="This page, character or conversation doesn't exist — or you don't have access to it."
        action={
          <Link href="/" className={buttonClasses("primary")}>
            Back to Discover
          </Link>
        }
      />
    </div>
  );
}
