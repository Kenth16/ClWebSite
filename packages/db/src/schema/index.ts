/**
 * Schéma de la base de données (Drizzle ORM).
 *
 * Les tables sont ajoutées étape par étape :
 *   - étape 2 : users, accounts, sessions, verifications
 *   - étape 3 : friendships
 *   - étape 4 : activity_attempts
 * Chaque ajout passe par une migration versionnée (`npm run generate -w @kenpai/db`).
 */
export {};
