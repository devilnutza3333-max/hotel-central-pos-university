import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: path.join(root, "spa"),
  publicDir: path.join(root, "public"),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: path.join(root, "dist/spa"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pos: path.join(root, "spa/index.html"),
        login: path.join(root, "spa/login/index.html"),
      },
    },
    sourcemap: false,
  },
});
