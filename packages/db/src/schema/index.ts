/**
 * Schéma de la base de données (Drizzle ORM).
 * Toute modification passe par une migration versionnée :
 *   npm run generate -w @kenpai/db
 * Les migrations sont appliquées automatiquement au démarrage de l'API.
 */
export * from "./users";
