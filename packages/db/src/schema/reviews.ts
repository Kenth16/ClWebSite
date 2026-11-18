import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Jeux vidéo évalués dans « Avis désastreux ». Chaque jeu provient du
 * catalogue RAWG (identifiant unique : pas de doublon « GTA 6 » / « GTA VI »).
 * Titre, image, date, plateformes et genres sont recopiés à l'ajout.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawgId: integer("rawg_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    coverUrl: text("cover_url"),
    released: varchar("released", { length: 10 }),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    genres: jsonb("genres").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("games_rawg_id_idx").on(t.rawgId)],
);

/**
 * Évaluation d'un jeu par un membre (une seule par jeu et par membre).
 * - `scores` : note sur 10 de chaque critère (validée par @kenpai/shared).
 * - `total_tenths` : note globale sur 100 en dixièmes (ex. 725 = 72,5), pour trier et agréger.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    totalTenths: smallint("total_tenths").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_game_user_idx").on(t.gameId, t.userId),
    index("reviews_user_idx").on(t.userId),
    check("reviews_total_range", sql`${t.totalTenths} between 0 and 1000`),
  ],
);

export type Game = typeof games.$inferSelect;
export type Review = typeof reviews.$inferSelect;
