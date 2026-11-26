"use client";

import * as React from "react";
import { Crown, Loader2, Search, Settings2, Target } from "lucide-react";
import {
  ELEMENTS,
  type DamageTarget,
  type DofusElement,
  type DofusMonster,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";
import { RemoteIcon } from "./tags";

/** Cible choisie : un monstre à un grade donné (null : Poutch, aucune résistance). */
export interface ChosenTarget {
  monster: DofusMonster;
  grade: number;
}

const TARGET_ELEMENTS: DofusElement[] = ["neutral", "earth", "fire", "water", "air"];
const RES_PCT: Record<DofusElement, StatKey> = {
  neutral: "neutralResPct",
  earth: "earthResPct",
  fire: "fireResPct",
  water: "waterResPct",
  air: "airResPct",
};

/** Résistances de la cible pour le calcul (null : Poutch). */
export function targetResistances(target: ChosenTarget | null): DamageTarget | null {
  if (!target) return null;
  const grade = target.monster.grades.find((g) => g.grade === target.grade);
  return grade?.resistances ?? null;
}

const fmtPct = (v: number) => `${v}%`;

/**
 * Cible des sorts : un Poutch (aucune résistance) par défaut, ou un monstre du
 * jeu choisi par le joueur ; ses résistances changent le meilleur stuff.
 */
export function TargetCard({
  value,
  onChange,
}: {
  value: ChosenTarget | null;
  onChange: (value: ChosenTarget | null) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  const grade = value?.monster.grades.find((g) => g.grade === value.grade) ?? null;
  const res = grade?.resistances;
  return (
    <section aria-label="Cible" className="rounded-xl border bg-card/70">
      <div className="flex items-center gap-3 p-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-background/60">
          {value ? (
            <RemoteIcon src={value.monster.icon} className="size-10" />
          ) : (
            <Target className="size-7 text-gold" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1.5 truncate font-serif font-semibold">
            {value ? value.monster.name : "Poutch"}
            {value?.monster.boss && (
              <Crown className="size-3.5 shrink-0 text-gold" aria-label="Boss" />
            )}
            <span className="text-xs font-normal text-muted-foreground">
              {grade ? `niv. ${grade.level}` : "(0 %)"}
            </span>
          </p>
          <p className="mt-1 rounded-sm bg-destructive/25 px-2 py-0.5 text-center text-xs font-semibold tabular-nums">
            {grade ? `${grade.hp.toLocaleString("fr-FR")} PV` : "∞ / ∞ PV"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          <Settings2 aria-hidden="true" />
          Modifier
        </Button>
      </div>
      <dl className="grid grid-cols-5 border-t text-xs">
        {TARGET_ELEMENTS.map((e) => {
          const pct = res?.pct[e] ?? 0;
          const flat = res?.flat[e] ?? 0;
          return (
            <div
              key={e}
              title={`${ELEMENTS[e].label} : ${pct} % et ${flat} de résistance fixe`}
              className="flex items-center justify-center gap-1.5 py-2"
            >
              <StatIcon stat={RES_PCT[e]} className="size-4" />
              <dd className="leading-tight tabular-nums">
                <span className={cn("block font-semibold", pct < 0 && "text-primary")}>
                  {fmtPct(pct)}
                </span>
                <span className="block text-muted-foreground">{flat}</span>
              </dd>
              <dt className="sr-only">{ELEMENTS[e].label}</dt>
            </div>
          );
        })}
      </dl>
      <dl className="grid grid-cols-2 border-t text-xs">
        {(
          [
            ["criticalRes", "Critiques", res?.critical ?? 0],
            ["pushbackRes", "Poussée", grade?.pushback ?? 0],
          ] as const
        ).map(([stat, label, v]) => (
          <div key={stat} className="flex items-center justify-center gap-1.5 py-2">
            <StatIcon stat={stat} className="size-4" />
            <dd className="font-semibold tabular-nums">{v}</dd>
            <dt className="text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      {picking && (
        <MonsterPicker
          current={value}
          onClose={() => setPicking(false)}
          onPick={(t) => {
            onChange(t);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}

/** Recherche d'un monstre (nom), puis choix de son niveau (grade). */
function MonsterPicker({
  current,
  onClose,
  onPick,
}: {
  current: ChosenTarget | null;
  onClose: () => void;
  onPick: (target: ChosenTarget | null) => void;
}) {
  const [query, setQuery] = React.useState(current?.monster.name ?? "");
  const [results, setResults] = React.useState<DofusMonster[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [chosen, setChosen] = React.useState<DofusMonster | null>(current?.monster ?? null);

  // Recherche un instant après la frappe (pas une requête par lettre).
  React.useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiFetch<{ monsters: DofusMonster[] }>(`/dofus/monsters?q=${encodeURIComponent(text)}`)
        .then(({ monsters }) => setResults(monsters))
        .catch((e: unknown) =>
          setError(e instanceof ApiError ? e.message : "Monstres indisponibles."),
        )
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const levels = (m: DofusMonster) => {
    const lv = m.grades.map((g) => g.level);
    const lo = Math.min(...lv);
    const hi = Math.max(...lv);
    return lo === hi ? `niv. ${lo}` : `niv. ${lo} à ${hi}`;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-3">
        <DialogTitle>Choisir la cible</DialogTitle>
        <DialogDescription>
          Les résistances du monstre changent les dégâts, et donc le meilleur stuff.
        </DialogDescription>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChosen(null);
              }}
              placeholder="Bouftou, Comte Harebourg…"
              aria-label="Nom du monstre"
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={() => onPick(null)}>
            <Target aria-hidden="true" />
            Poutch
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {chosen ? (
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <RemoteIcon src={chosen.icon} className="size-10" />
              <p className="font-medium">{chosen.name}</p>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setChosen(null)}>
                Autre monstre
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Niveau du monstre :</p>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {chosen.grades.map((g) => {
                const on = current?.monster.id === chosen.id && current.grade === g.grade;
                return (
                  <li key={g.grade}>
                    <button
                      type="button"
                      onClick={() => onPick({ monster: chosen, grade: g.grade })}
                      className={cn(
                        "w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                        on && "border-gold/70 bg-gold-soft",
                      )}
                    >
                      <span className="font-medium">Niveau {g.level}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {g.hp.toLocaleString("fr-FR")} PV
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : query.trim().length < 2 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Tapez au moins 2 lettres du nom d&apos;un monstre.
          </p>
        ) : loading && !results ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Recherche…
          </p>
        ) : results && results.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun monstre trouvé.</p>
        ) : (
          <ul className="grid max-h-[50svh] gap-1 overflow-y-auto">
            {results?.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() =>
                    m.grades.length === 1
                      ? onPick({ monster: m, grade: m.grades[0]!.grade })
                      : setChosen(m)
                  }
                  className="flex w-full items-center gap-2.5 rounded-md border bg-card/60 p-1.5 text-left transition-colors hover:bg-accent"
                >
                  <RemoteIcon src={m.icon} className="size-9 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                  {m.boss && <Crown className="size-3.5 text-gold" aria-label="Boss" />}
                  <span className="text-xs text-muted-foreground">{levels(m)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
