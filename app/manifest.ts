import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kharcha — budget and shared money",
    short_name: "Kharcha",
    description: "Know what you can spend today, track loans, and save every period.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4ee",
    theme_color: "#133d2e",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add expense", short_name: "Expense", url: "/add?type=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add money in", short_name: "Money in", url: "/add?type=income", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reports", short_name: "Reports", url: "/reports", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
