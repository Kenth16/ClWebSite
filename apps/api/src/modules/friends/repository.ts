import { and, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  ONLINE_WINDOW_MS,
  isAvatarKey,
  type FriendRequest,
  type FriendsOverview,
  type PublicUser,
} from "@kenpai/shared";
import { friendships, users, type Database, type Friendship, type User } from "@kenpai/db";

/** Fréquence maximale d'écriture de la présence en base, par utilisateur. */
const PRESENCE_WRITE_INTERVAL_MS = 30 * 1000;

export function toPublicUser(user: Pick<User, "id" | "username" | "avatar">): PublicUser {
  return {
    id: user.id,
    username: user.username,
    avatar: isAvatarKey(user.avatar) ? user.avatar : "etoile",
  };
}

export function isOnline(lastSeenAt: Date | null, now = Date.now()): boolean {
  return lastSeenAt !== null && now - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

/** Enregistre l'activité de l'utilisateur (au plus une écriture toutes les 30 s). */
export async function touchPresence(db: Database, user: User): Promise<void> {
  if (user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < PRESENCE_WRITE_INTERVAL_MS) {
    return;
  }
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
}

/** Passe l'utilisateur hors ligne immédiatement (déconnexion). */
export async function clearPresence(db: Database, userId: string): Promise<void> {
  await db.update(users).set({ lastSeenAt: null }).where(eq(users.id, userId));
}

/** Relation existante entre deux utilisateurs, dans un sens ou dans l'autre. */
export async function findBetween(db: Database, a: string, b: string): Promise<Friendship | null> {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findById(db: Database, id: string): Promise<Friendship | null> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, id)).limit(1);
  return row ?? null;
}

const byName = (a: { username: string }, b: { username: string }) =>
  a.username.localeCompare(b.username, "fr", { sensitivity: "base" });

/** Amis (en ligne d'abord), demandes reçues et demandes envoyées. */
export async function overview(db: Database, meId: string): Promise<FriendsOverview> {
  const other = alias(users, "other");
  const rows = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      status: friendships.status,
      createdAt: friendships.createdAt,
      respondedAt: friendships.respondedAt,
      other: {
        id: other.id,
        username: other.username,
        avatar: other.avatar,
        lastSeenAt: other.lastSeenAt,
      },
    })
    .from(friendships)
    .innerJoin(
      other,
      sql`${other.id} = case when ${friendships.requesterId} = ${meId}
        then ${friendships.addresseeId} else ${friendships.requesterId} end`,
    )
    .where(or(eq(friendships.requesterId, meId), eq(friendships.addresseeId, meId)));

  const now = Date.now();
  const result: FriendsOverview = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const user = toPublicUser(row.other);
    if (row.status === "accepted") {
      result.friends.push({
        ...user,
        online: isOnline(row.other.lastSeenAt, now),
        since: (row.respondedAt ?? row.createdAt).toISOString(),
      });
    } else {
      const request: FriendRequest = { id: row.id, user, createdAt: row.createdAt.toISOString() };
      (row.requesterId === meId ? result.outgoing : result.incoming).push(request);
    }
  }
  result.friends.sort((a, b) => Number(b.online) - Number(a.online) || byName(a, b));
  const newestFirst = (a: FriendRequest, b: FriendRequest) =>
    b.createdAt.localeCompare(a.createdAt);
  result.incoming.sort(newestFirst);
  result.outgoing.sort(newestFirst);
  return result;
}
