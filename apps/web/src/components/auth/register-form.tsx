"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, type SessionUser } from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { FormAlert, FormField } from "./form-field";

export function RegisterForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setError(null);
      setFields({ confirm: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch<{ user: SessionUser }>("/auth/register", {
        method: "POST",
        body: {
          username: form.get("username"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError(0, "Une erreur inattendue est survenue.");
      // Les erreurs par champ s'affichent sous chaque champ ; le message global seulement sinon.
      setError(Object.keys(err.fields).length > 0 ? null : err.message);
      setFields(err.fields);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <FormField
        name="username"
        label="Pseudo"
        autoComplete="username"
        required
        autoFocus
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        hint={`${USERNAME_MIN} à ${USERNAME_MAX} caractères : lettres, chiffres, « _ », « - » ou « . ».`}
        error={fields.username}
      />
      <FormField
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        error={fields.email}
      />
      <div className="grid gap-1.5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="password"
            label="Mot de passe"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            error={fields.password}
          />
          <FormField
            name="confirm"
            label="Confirmation"
            type="password"
            autoComplete="new-password"
            required
            error={fields.confirm}
          />
        </div>
        {!fields.password && !fields.confirm && (
          <p className="text-sm text-muted-foreground">Au moins {PASSWORD_MIN} caractères.</p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        <UserPlus aria-hidden="true" />
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link
          href={
            redirectTo === "/"
              ? "/connexion"
              : `/connexion?redirect=${encodeURIComponent(redirectTo)}`
          }
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
