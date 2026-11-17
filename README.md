# Kenpai — Académie des savoirs

Plateforme éducative communautaire : géographie, histoire, français, calcul mental et quiz,
avec comptes utilisateurs, amis et présence en ligne.

## Démarrage rapide (développement)

Prérequis : Node.js 22+, Docker.

```bash
cp .env.example .env      # variables locales (aucun secret requis pour l'instant)
npm install
npm run db:up             # PostgreSQL dans Docker
npm run dev               # API sur :4000, site sur http://localhost:3000
```

Vérifier que tout est branché : <http://localhost:3000/api/health> doit répondre
`{"status":"ok","database":"up",…}`.

## Stack complète sous Docker

```bash
docker compose --profile full up --build   # → http://localhost:8080
```

## Scripts

| Commande                    | Rôle                                        |
| --------------------------- | ------------------------------------------- |
| `npm run dev`               | API + site en mode développement            |
| `npm run build`             | Build de production (API puis site)         |
| `npm run lint`              | ESLint                                      |
| `npm run typecheck`         | Vérification TypeScript de tous les paquets |
| `npm test`                  | Tests unitaires (Vitest)                    |
| `npm run format`            | Formatage Prettier                          |
| `npm run db:up` / `db:down` | Démarrer / arrêter PostgreSQL               |

## Organisation

```
apps/
  web/        Frontend Next.js (App Router, Tailwind, Radix UI)
  api/        Backend Fastify (routes /api/*)
packages/
  shared/     Schémas Zod et types partagés web ↔ API
  db/         Schéma Drizzle, migrations, connexion PostgreSQL
  content/    Catalogue des rubriques et contenu pédagogique
docker/       Configuration du reverse proxy (Caddy)
docs/         Documentation d'architecture
```

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour les choix techniques et la feuille de route.
