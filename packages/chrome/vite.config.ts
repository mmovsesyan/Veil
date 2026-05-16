import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyDirOnBuild: true,
    sourcemap: false,
    minify: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "content/content-script": resolve(__dirname, "src/content/content-script.ts"),
        "popup/popup": resolve(__dirname, "src/popup/index.tsx"),
        "options/options": resolve(__dirname, "src/options/index.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "es",
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@tensorflow")) {
            return "vendor-tfjs";
          }
          if (id.includes("packages/core/src")) {
            return "core-engine";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@veil/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
