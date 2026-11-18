import { z } from "zod";
import type { AvatarKey } from "./avatars";

/** Un utilisateur est « en ligne » s'il a été actif pendant cette fenêtre. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
/** Fréquence à laquelle une page ouverte signale l'activité de l'utilisateur. */
export const PRESENCE_HEARTBEAT_MS = 60 * 1000;

export const friendRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Saisissez le pseudo de votre ami.")
    .max(20, "Ce pseudo n'existe pas."),
});
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;

/** Profil public d'un autre utilisateur : jamais d'e-mail. */
export interface PublicUser {
  id: string;
  username: string;
  avatar: AvatarKey;
}

export interface Friend extends PublicUser {
  online: boolean;
  /** Date à laquelle l'amitié a été acceptée. */
  since: string;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  createdAt: string;
}

export interface FriendsOverview {
  friends: Friend[];
  /** Demandes reçues, en attente de réponse. */
  incoming: FriendRequest[];
  /** Demandes envoyées, en attente de réponse. */
  outgoing: FriendRequest[];
}
