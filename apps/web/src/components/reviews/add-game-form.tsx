"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { GAME_TITLE_MAX } from "@kenpai/shared";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";

/** Ajoute un jeu (ou retrouve celui qui existe déjà) puis ouvre sa fiche pour le noter. */
export function AddGameForm() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!title) {
      setError("Saisissez le titre du jeu.");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const { game } = await apiFetch<{ game: { id: string } }>("/games", {
        method: "POST",
        body: { title },
      });
      router.push(`/avis-desastreux/${game.id}#mon-avis`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields.title ?? e.message)
          : "Une erreur inattendue est survenue.",
      );
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="ajouter-jeu"
      className="frame-gilded rounded-xl border bg-card/70 p-5"
    >
      <h2 id="ajouter-jeu" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Plus className="size-5 text-primary" aria-hidden="true" />
        Noter un jeu
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        S&apos;il est déjà dans la liste, vous arriverez directement sur sa fiche.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-3">
        <FormField
          name="title"
          label="Titre du jeu"
          autoComplete="off"
          maxLength={GAME_TITLE_MAX}
          error={error}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Ouverture…" : "Continuer"}
        </Button>
      </form>
    </section>
  );
}
