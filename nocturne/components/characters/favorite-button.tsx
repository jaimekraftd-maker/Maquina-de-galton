"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setFavorite } from "@/app/actions/characters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  characterId,
  initial,
  signedIn,
  className,
}: {
  characterId: string;
  initial: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fav, setOptimistic] = useOptimistic(initial);

  return (
    <Button
      variant="secondary"
      size="icon"
      className={className}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      title={fav ? "Remove from favorites" : "Add to favorites"}
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(`/characters/${characterId}`)}`);
          return;
        }
        startTransition(async () => {
          setOptimistic(!fav);
          const res = await setFavorite(characterId, !fav);
          if (!res.ok) toast.error(res.error);
          else toast.success(fav ? "Removed from favorites" : "Added to favorites");
          router.refresh();
        });
      }}
    >
      <Heart className={cn("h-[18px] w-[18px] transition-colors", fav && "fill-rose text-rose")} />
    </Button>
  );
}
