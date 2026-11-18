import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Demandes et relations d'amitié.
 * - `pending` : `requester` a invité `addressee`, qui n'a pas encore répondu.
 * - `accepted` : les deux utilisateurs sont amis (relation symétrique).
 * Un refus, une annulation ou une suppression efface la ligne : une nouvelle
 * demande reste possible ensuite.
 * Une seule ligne par paire d'utilisateurs, quel que soit le sens.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16, enum: ["pending", "accepted"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("friendships_pair_idx").on(
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index("friendships_addressee_idx").on(t.addresseeId),
    index("friendships_requester_idx").on(t.requesterId),
    check("friendships_not_self", sql`${t.requesterId} <> ${t.addresseeId}`),
    check("friendships_status_check", sql`${t.status} in ('pending', 'accepted')`),
  ],
);

export type Friendship = typeof friendships.$inferSelect;
