import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// base:'/' — the live site is served at a custom-domain root.
// fs.allow includes the repo root so we can import the existing shared CSS
// (../styles/*.css) without duplicating it into web/.
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, "..")] },
    // Lets Firebase signInWithPopup talk to its popup without the COOP warning.
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" }
  },
  preview: {
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" }
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  }
});
