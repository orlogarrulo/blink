/**
 * Static build of the studio for the native shell (Capacitor). Separate from
 * vite.config.ts so the website (TanStack Start + Nitro on Vercel) is untouched.
 *   npm run build:native  →  www/  (Capacitor webDir)
 */
import { resolve } from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "native"),
  base: "./",
  publicDir: resolve(import.meta.dirname, "public"),
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: resolve(import.meta.dirname, "www"),
    emptyOutDir: true,
    target: ["es2022", "chrome110", "safari16"],
    chunkSizeWarningLimit: 4000,
  },
});
