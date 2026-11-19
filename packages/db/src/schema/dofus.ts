import { index, jsonb, pgTable, smallint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Stuffs Dofus enregistrés par les membres depuis le simulateur.
 * `data` : contenu validé par @kenpai/shared (niveau, caractéristiques,
 * parchemins, objets par emplacement, notes).
 */
export const dofusBuilds = pgTable(
  "dofus_builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    level: smallint("level").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dofus_builds_user_idx").on(t.userId, t.updatedAt)],
);

export type DofusBuildRow = typeof dofusBuilds.$inferSelect;
