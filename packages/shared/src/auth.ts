import { z } from "zod";
import { AVATAR_KEYS } from "./avatars";

/** Règles communes au frontend (aide à la saisie) et à l'API (validation faisant foi). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Le pseudo doit contenir au moins ${USERNAME_MIN} caractères.`)
  .max(USERNAME_MAX, `Le pseudo doit contenir au plus ${USERNAME_MAX} caractères.`)
  .regex(
    /^[\p{L}\p{N}_.-]+$/u,
    "Le pseudo ne peut contenir que des lettres, des chiffres, « _ », « - » et « . ».",
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Adresse e-mail trop longue.")
  .pipe(z.email("Adresse e-mail invalide."));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`)
  .max(PASSWORD_MAX, `Le mot de passe doit contenir au plus ${PASSWORD_MAX} caractères.`);

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Adresse e-mail ou pseudo. */
  identifier: z.string().trim().min(1, "Saisissez votre e-mail ou votre pseudo.").max(254),
  password: z.string().min(1, "Saisissez votre mot de passe.").max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    avatar: z.enum(AVATAR_KEYS, "Avatar inconnu.").optional(),
  })
  .refine((v) => v.username !== undefined || v.avatar !== undefined, "Aucune modification.");
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Utilisateur tel que renvoyé par l'API (jamais le hash du mot de passe). */
export const sessionUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  avatar: z.enum(AVATAR_KEYS),
  createdAt: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Format des erreurs renvoyées par l'API. */
export interface ApiErrorBody {
  error: string;
  /** Erreurs par champ de formulaire, le cas échéant. */
  fields?: Record<string, string>;
}
