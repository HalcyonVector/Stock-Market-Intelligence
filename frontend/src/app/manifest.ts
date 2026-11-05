import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home screen"), which is also what lets
// iPhones receive Web Push notifications for price alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockIntel — Stock Discovery & Intelligence",
    short_name: "StockIntel",
    description: "Market dashboards, watchlists, price alerts and safe-investing tools. Educational use only.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0709",
    theme_color: "#0b0709",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Watchlists", url: "/watchlists" },
      { name: "Alerts", url: "/alerts" },
      { name: "Paper trading", url: "/paper" },
    ],
  };
}
