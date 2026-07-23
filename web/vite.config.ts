import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// On GitHub Pages a project site is served under /<repo>/, so the workflow sets
// VITE_BASE=/LotteryEdge/. Locally it defaults to "/".
const base = process.env.VITE_BASE || "/";

// Surface the package version inside the app (footer + info sheet) so the
// deployed build is identifiable — useful with the auto-updating service worker.
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "LotteryEdge",
        short_name: "LotteryEdge",
        description: "Scratch-off expected-value ranker",
        theme_color: "#0b1020",
        background_color: "#0b1020",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        runtimeCaching: [
          {
            // Scratcher data: serve fresh when online, fall back to cache offline.
            urlPattern: ({ url }) => url.pathname.endsWith(".json"),
            handler: "NetworkFirst",
            options: {
              cacheName: "scratcher-data",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
