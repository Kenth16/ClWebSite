import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts"]),
  // Règles Next.js / React pour le frontend.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [nextVitals, nextTs],
    settings: { next: { rootDir: "apps/web" } },
  },
  // Règles TypeScript pour l'API et les paquets partagés.
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
]);
