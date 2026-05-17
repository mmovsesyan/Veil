import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist/content",
    emptyDirOnBuild: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, "src/content/content-script.ts"),
      name: "VeilContent",
      fileName: () => "content-script.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@veil/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
