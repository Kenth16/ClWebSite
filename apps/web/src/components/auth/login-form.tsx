"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import type { SessionUser } from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { FormAlert, FormField } from "./form-field";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        body: { identifier: form.get("identifier"), password: form.get("password") },
      });
      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError(0, "Une erreur inattendue est survenue.");
      setError(err.message);
      setFields(err.fields);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <FormField
        name="identifier"
        label="E-mail ou pseudo"
        autoComplete="username"
        required
        autoFocus
        error={fields.identifier}
      />
      <FormField
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
        error={fields.password}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        <LogIn aria-hidden="true" />
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href={
            redirectTo === "/"
              ? "/inscription"
              : `/inscription?redirect=${encodeURIComponent(redirectTo)}`
          }
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
