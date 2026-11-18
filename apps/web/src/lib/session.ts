import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { sessionUserSchema, type SessionUser } from "@kenpai/shared";

const SESSION_COOKIE = "kenpai_session";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Utilisateur connecté, lu côté serveur auprès de l'API (une seule fois par requête).
 * Renvoie null si personne n'est connecté ou si l'API est injoignable.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user: unknown };
    return sessionUserSchema.parse(body.user);
  } catch {
    return null;
  }
});

/**
 * Appel à l'API depuis le rendu serveur, au nom de l'utilisateur connecté
 * (ou en visiteur anonyme). Renvoie null en cas d'erreur (404, 401…).
 */
export async function serverApi<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const response = await fetch(`${apiUrl}/api${path}`, {
      headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined,
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** N'accepte que les redirections internes au site (évite les redirections ouvertes). */
export function safeRedirect(target: string | string[] | undefined, fallback = "/"): string {
  const value = Array.isArray(target) ? target[0] : target;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
