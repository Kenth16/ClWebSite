import { defineConfig } from "tsup";

// Les paquets du monorepo (@kenpai/*) sont écrits en TypeScript : on les
// intègre au bundle pour que `dist/server.js` soit autonome.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  noExternal: [/^@kenpai\//],
  clean: true,
  sourcemap: true,
});
