import { hash, verify } from "@node-rs/argon2";

/**
 * Hachage des mots de passe avec Argon2id (paramètres par défaut de la
 * bibliothèque : m=19 Mio, t=2, p=1, conformes aux recommandations OWASP).
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Hash factice : quand l'identifiant est inconnu, on vérifie quand même un
// mot de passe pour que le temps de réponse ne révèle pas l'existence du compte.
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("kenpai-dummy-password");
  await verifyPassword(await dummyHash, password);
  return false;
}
