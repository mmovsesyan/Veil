import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyDirOnBuild: true,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: {
        "background/background-script": resolve(__dirname, "src/background/background-script.ts"),
        "content/content-script": resolve(__dirname, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "es",
      },
    },
  },
  resolve: {
    alias: {
      "@veil/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
