import { defineConfig } from "tsup";

export default defineConfig([
  // Node.js / server build (CJS + ESM)
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: "dist",
    platform: "node",
    target: "node18",
  },
  // CLI binary — rcan-validate
  {
    entry: { "rcan-validate": "src/bin/rcan-validate.ts" },
    format: ["cjs"],
    dts: false,
    sourcemap: false,
    outDir: "dist",
    platform: "node",
    target: "node18",
    noExternal: [],
  },
  // Browser / Edge (ESM, Web Crypto)
  {
    entry: { "browser": "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    outDir: "dist",
    platform: "browser",
    target: "es2020",
    // Replace Node.js crypto with our pure-JS fallback in the browser bundle
    esbuildOptions(opts) {
      opts.define = {
        ...opts.define,
        "process.versions": "{}",
        "process.versions.node": "undefined",
      };
    },
  },
  // IIFE/CDN bundle — for unpkg / jsDelivr
  {
    entry: { "rcan": "src/index.ts" },
    format: ["iife"],
    globalName: "RCAN",
    outDir: "dist",
    outExtension: () => ({ js: ".iife.js" }),
    minify: true,
    sourcemap: false,
    platform: "browser",
    esbuildOptions(opts) {
      opts.define = {
        ...opts.define,
        "process.versions": "{}",
        "process.versions.node": "undefined",
      };
    },
  },
]);
