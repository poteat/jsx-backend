import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  // Don't bundle dependencies - they should be installed by consumers
  external: ["typescript"],
});
