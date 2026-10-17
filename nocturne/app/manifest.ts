import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nocturne — chat with characters",
    short_name: "Nocturne",
    description: "Discover, create and chat with original AI characters.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0910",
    theme_color: "#0a0910",
    categories: ["entertainment", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Library", url: "/library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Create a character", url: "/create", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
