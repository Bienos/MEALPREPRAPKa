import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. Standalone display and the warm background
 * make the installed iPhone app look like the real thing rather than a tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MealPrep",
    short_name: "MealPrep",
    description: "Prywatna aplikacja do planowania i jedzenia bez zastanawiania się.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6f0",
    theme_color: "#faf6f0",
    lang: "pl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
