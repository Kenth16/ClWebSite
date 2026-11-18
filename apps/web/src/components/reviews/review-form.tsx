"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2 } from "lucide-react";
import {
  REVIEW_COMMENT_MAX,
  REVIEW_CRITERIA,
  criterionPoints,
  gradeLabel,
  totalScore,
  type CriterionKey,
  type GameReview,
  type ReviewScores,
} from "@kenpai/shared";
import { FormAlert } from "@/components/auth/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { TotalScore, formatScore, scoreTone } from "./score";

type Draft = Partial<Record<CriterionKey, number>>;
const NOTES = Array.from({ length: 11 }, (_, i) => i);

export function ReviewForm({ gameId, existing }: { gameId: string; existing: GameReview | null }) {
  const router = useRouter();
  const [scores, setScores] = React.useState<Draft>(existing?.scores ?? {});
  const [comment, setComment] = React.useState(existing?.comment ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const rated = REVIEW_CRITERIA.filter((c) => scores[c.key] !== undefined).length;
  const complete = rated === REVIEW_CRITERIA.length;
  const total = complete ? totalScore(scores as ReviewScores) : null;
  const partial = REVIEW_CRITERIA.reduce(
    (sum, c) => sum + criterionPoints(scores[c.key] ?? 0, c.weight),
    0,
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) {
      setError(`Notez les ${REVIEW_CRITERIA.length} critères avant d'enregistrer.`);
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/games/${gameId}/review`, { method: "PUT", body: { scores, comment } });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Une erreur inattendue est survenue.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    setPending(true);
    try {
      await apiFetch(`/games/${gameId}/review`, { method: "DELETE" });
      setScores({});
      setComment("");
      setSaved(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Une erreur inattendue est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {REVIEW_CRITERIA.map((c) => {
        const value = scores[c.key];
        return (
          <fieldset key={c.key} className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <legend className="font-serif text-lg font-semibold">{c.label}</legend>
                <p className="text-sm text-muted-foreground">{c.description}</p>
              </div>
              <Badge className="shrink-0">{c.weight} points</Badge>
            </div>
            <div className="mt-3 grid grid-cols-11 gap-1">
              {NOTES.map((n) => {
                const selected = value === n;
                return (
                  <label
                    key={n}
                    title={`${n} — ${gradeLabel(n)}`}
                    className={cn(
                      "flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background/60 hover:bg-accent",
                    )}
                  >
                    <input
                      type="radio"
                      name={c.key}
                      value={n}
                      checked={selected}
                      onChange={() => {
                        setScores((s) => ({ ...s, [c.key]: n }));
                        setSaved(false);
                      }}
                      className="sr-only"
                    />
                    {n}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 min-h-5 text-sm">
              {value !== undefined ? (
                <>
                  <span className={cn("font-semibold", scoreTone(value))}>{gradeLabel(value)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatScore(criterionPoints(value, c.weight))} / {c.weight} points
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Pas encore noté</span>
              )}
            </p>
          </fieldset>
        );
      })}

      <div className="grid gap-1.5">
        <label htmlFor="commentaire" className="text-sm font-medium">
          Commentaire <span className="font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <textarea
          id="commentaire"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved(false);
          }}
          maxLength={REVIEW_COMMENT_MAX}
          rows={4}
          placeholder="Ce qui vous a marqué, en bien ou en mal…"
          className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
        />
        <p className="text-right text-xs text-muted-foreground">
          {comment.length} / {REVIEW_COMMENT_MAX}
        </p>
      </div>

      {/* Note globale, visible pendant toute la saisie */}
      <div className="frame-gilded sticky bottom-3 z-10 flex flex-wrap items-center gap-4 rounded-xl border bg-popover/95 p-4 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1">
          {total !== null ? (
            <TotalScore total={total} size="md" />
          ) : (
            <div className="leading-tight">
              <p className="font-serif text-2xl font-bold text-muted-foreground tabular-nums">
                {formatScore(partial)} <span className="text-sm">/ 100</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {rated} / {REVIEW_CRITERIA.length} critères notés
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {existing && (
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  <Trash2 aria-hidden="true" />
                  Supprimer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <div>
                  <DialogTitle>Supprimer votre avis ?</DialogTitle>
                  <DialogDescription className="mt-1">
                    Vos notes et votre commentaire sur ce jeu seront effacés.
                  </DialogDescription>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <DialogClose asChild>
                    <Button variant="ghost">Annuler</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      className="bg-destructive text-background hover:bg-destructive/90"
                      onClick={() => void onDelete()}
                    >
                      <Trash2 aria-hidden="true" />
                      Supprimer
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Enregistrement…" : existing ? "Mettre à jour" : "Publier mon avis"}
          </Button>
        </div>
        <div role="status" aria-live="polite" className="w-full empty:hidden">
          {error && <FormAlert>{error}</FormAlert>}
          {saved && !error && (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Avis enregistré.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
