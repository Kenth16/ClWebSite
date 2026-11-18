import { and, eq, ne, sql } from "drizzle-orm";
import { isAvatarKey, type SessionUser } from "@kenpai/shared";
import { users, type Database, type User } from "@kenpai/db";

/** Forme publique d'un utilisateur : ne contient jamais le hash du mot de passe. */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: isAvatarKey(user.avatar) ? user.avatar : "etoile",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function findByLogin(db: Database, identifier: string): Promise<User | null> {
  const value = identifier.trim().toLowerCase();
  const column = value.includes("@") ? users.email : users.username;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${column})`, value))
    .limit(1);
  return user ?? null;
}

export async function usernameTaken(db: Database, username: string, exceptUserId?: string) {
  const conditions = [eq(sql`lower(${users.username})`, username.toLowerCase())];
  if (exceptUserId) conditions.push(ne(users.id, exceptUserId));
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

export async function emailTaken(db: Database, email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  return Boolean(row);
}
