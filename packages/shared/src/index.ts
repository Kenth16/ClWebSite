/**
 * @kenpai/shared — schémas et types partagés entre le frontend et l'API.
 * Toute donnée qui traverse la frontière web ↔ API est décrite ici par un
 * schéma Zod : l'API l'utilise pour valider, le web pour typer.
 */
export * from "./auth";
export * from "./avatars";
export * from "./health";
export * from "./friends";
export * from "./reviews";
export * from "./dofus";
