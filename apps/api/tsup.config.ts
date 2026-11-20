import { defineConfig } from "tsup";

// Les paquets du monorepo (@kenpai/*) sont écrits en TypeScript : on les
// intègre au bundle pour que `dist/server.js` soit autonome.
export default defineConfig({
  // Le fil de calcul HiGHS est un fichier à part (lancé par l'optimiseur).
  entry: { server: "src/server.ts", "highs-worker": "src/modules/dofus/highs-worker.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  noExternal: [/^@kenpai\//],
  clean: true,
  sourcemap: true,
});
