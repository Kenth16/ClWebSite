import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // Les tests d'intégration partagent la base kenpai_test (vidée entre chaque
    // test) : les fichiers s'exécutent donc l'un après l'autre.
    fileParallelism: false,
  },
});
