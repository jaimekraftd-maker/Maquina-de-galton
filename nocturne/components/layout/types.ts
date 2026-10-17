import type { Viewer } from "@/lib/data/types";

export interface RecentChat {
  id: string;
  title: string;
  pinned: boolean;
  characterName: string;
  avatarUrl: string | null;
}

export interface ShellData {
  viewer: Viewer | null;
  mode: "supabase" | "local";
  recent: RecentChat[];
  error?: string;
}
