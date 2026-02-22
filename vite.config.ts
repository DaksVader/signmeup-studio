import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: 'inline', // Ensures the phone registers the SW immediately
      includeAssets: ["favicon.ico", "icons/SignLogo.png", "icons/icon-192x192.png", "icons/icon-512x512.png"],
      manifest: {
        name: "SignSpeak",
        short_name: "SignSpeak",
        description: "Sign Language AI Recognition",
        theme_color: "#0D9488",
        background_color: "#f8fafb",
        display: "standalone", // Makes it look like a real app on phone
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // Bumped to 5MB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Cache MediaPipe WASM and data files (this is what the phone needs offline)
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mediapipe-offline",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/models\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "ai-models",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));