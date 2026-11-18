/**
 * Avatars par défaut. À l'inscription, l'un d'eux est attribué au hasard ;
 * l'utilisateur peut ensuite en choisir un autre depuis son profil.
 * Les images correspondantes sont dans apps/web/public/avatars/<clé>.svg.
 */
export const AVATARS = [
  { key: "etoile", label: "Étoile" },
  { key: "lune", label: "Croissant de lune" },
  { key: "soleil", label: "Soleil" },
  { key: "flamme", label: "Flamme" },
  { key: "goutte", label: "Goutte d'eau" },
  { key: "feuille", label: "Feuille" },
  { key: "montagne", label: "Montagne" },
  { key: "couronne", label: "Couronne" },
  { key: "cristal", label: "Cristal" },
  { key: "plume", label: "Plume" },
] as const;

export type AvatarKey = (typeof AVATARS)[number]["key"];

export const AVATAR_KEYS = AVATARS.map((a) => a.key) as [AvatarKey, ...AvatarKey[]];

export function isAvatarKey(value: string): value is AvatarKey {
  return (AVATAR_KEYS as readonly string[]).includes(value);
}

export function randomAvatar(random: () => number = Math.random): AvatarKey {
  return AVATAR_KEYS[Math.floor(random() * AVATAR_KEYS.length)] ?? AVATAR_KEYS[0];
}
