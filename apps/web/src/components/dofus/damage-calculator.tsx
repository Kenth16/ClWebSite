"use client";

import * as React from "react";
import { Calculator, Crosshair, Hand, Loader2, Star } from "lucide-react";
import {
  ELEMENTS,
  STATS,
  computeSpellDamage,
  spellGradeAt,
  type DofusBreed,
  type DofusSpell,
  type StatKey,
  type StatTotals,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { StatIcon, statTone } from "./stat-icon";

const KEY_STATS: StatKey[] = [
  "power",
  "strength",
  "intelligence",
  "chance",
  "agility",
  "damage",
  "criticalDamage",
  "critical",
  "spellDamagePct",
  "meleeDamagePct",
  "rangedDamagePct",
];

/** Icône d'une image distante (DofusDB), ou un carré neutre. */
function RemoteIcon({ src, className }: { src: string | null; className?: string }) {
  if (!src) return <span className={cn("rounded-md bg-muted", className)} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- images hébergées par DofusDB
  return <img src={src} alt="" loading="lazy" className={cn("object-contain", className)} />;
}

function SpellCard({
  spell,
  level,
  totals,
}: {
  spell: DofusSpell;
  level: number;
  totals: StatTotals;
}) {
  const grade = spellGradeAt(spell, level);
  const firstLevel = spell.grades[0]?.minLevel ?? 1;
  const damage = grade && grade.lines.length > 0 ? computeSpellDamage(totals, grade) : null;

  return (
    <li className="flex gap-3 rounded-lg border bg-card/70 p-3">
      <RemoteIcon src={spell.icon} className="size-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{spell.name}</p>
          {damage && (
            <p className="shrink-0 text-right leading-tight">
              <span className="font-serif text-lg font-bold tabular-nums">{damage.average}</span>
              <span className="block text-[0.7rem] text-muted-foreground">moy. / lancer</span>
            </p>
          )}
        </div>
        {!grade ? (
          <p className="mt-1 text-xs text-muted-foreground">Disponible au niveau {firstLevel}.</p>
        ) : (
          <>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="size-3 fill-el-ap text-el-ap" aria-hidden="true" />
                {grade.apCost} PA
              </span>
              <span className="flex items-center gap-0.5">
                {damage?.melee ? (
                  <Hand className="size-3" aria-hidden="true" />
                ) : (
                  <Crosshair className="size-3" aria-hidden="true" />
                )}
                PO{" "}
                {grade.minRange === grade.range ? grade.range : `${grade.minRange}–${grade.range}`}
              </span>
              {damage && <span>{damage.criticalChance} % crit.</span>}
            </p>
            {damage && (
              <table className="mt-2 w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Élément</th>
                    <th>Normal</th>
                    <th>Critique</th>
                  </tr>
                </thead>
                <tbody>
                  {damage.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-0.5 pr-2">
                        <span className="flex items-center gap-1.5">
                          <StatIcon stat={ELEMENTS[line.element].damage} className="size-3.5" />
                          <span className={statTone(ELEMENTS[line.element].damage)}>
                            {ELEMENTS[line.element].label}
                          </span>
                          {line.kind === "steal" && (
                            <span className="text-xs text-muted-foreground">(vol)</span>
                          )}
                        </span>
                      </td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">
                        {line.normal.min === line.normal.max
                          ? line.normal.min
                          : `${line.normal.min} – ${line.normal.max}`}
                      </td>
                      <td className="py-0.5 pl-3 text-right tabular-nums text-el-fire">
                        {line.critical
                          ? line.critical.min === line.critical.max
                            ? line.critical.min
                            : `${line.critical.min} – ${line.critical.max}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Calcul des dégâts des sorts de la classe choisie, à partir des
 * caractéristiques finales du stuff (cible sans résistances).
 */
export function DamageCalculator({
  totals,
  level,
  breedId,
  onBreedChange,
}: {
  totals: StatTotals;
  level: number;
  breedId: number | null;
  onBreedChange: (id: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [breeds, setBreeds] = React.useState<DofusBreed[] | null>(null);
  const [spells, setSpells] = React.useState<Record<number, DofusSpell[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [onlyDamage, setOnlyDamage] = React.useState(true);

  React.useEffect(() => {
    if (!open || breeds) return;
    apiFetch<{ classes: DofusBreed[] }>("/dofus/classes")
      .then(({ classes }) => setBreeds(classes))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Classes indisponibles."),
      );
  }, [open, breeds]);

  React.useEffect(() => {
    if (!open || breedId === null || spells[breedId]) return;
    apiFetch<{ spells: DofusSpell[] }>(`/dofus/classes/${breedId}/spells`)
      .then((data) => setSpells((m) => ({ ...m, [breedId]: data.spells })))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Sorts indisponibles."));
  }, [open, breedId, spells]);

  const list = breedId !== null ? spells[breedId] : undefined;
  const shown = list?.filter((s) => !onlyDamage || s.grades.some((g) => g.lines.length > 0));
  const breed = breeds?.find((b) => b.id === breedId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Calculator aria-hidden="true" />
          Calcul des dégâts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl gap-4">
        <div>
          <DialogTitle>Calcul des dégâts{breed ? ` — ${breed.name}` : ""}</DialogTitle>
          <DialogDescription className="mt-1">
            Dégâts des sorts au niveau {level} avec ce stuff, sur une cible sans résistances.
          </DialogDescription>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Choix de la classe */}
        {breeds === null && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement des classes…
          </p>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Classe</legend>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-10">
              {breeds?.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onBreedChange(b.id)}
                  aria-pressed={b.id === breedId}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[0.7rem] transition-colors hover:bg-accent",
                    b.id === breedId ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
                  )}
                >
                  <RemoteIcon src={b.icon} className="size-8" />
                  <span className="w-full truncate text-center">{b.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Caractéristiques prises en compte */}
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {KEY_STATS.map((k) => (
            <li
              key={k}
              className={cn(
                "flex items-center gap-1 rounded-full border bg-background/50 px-2 py-0.5",
                totals[k] === 0 && "text-muted-foreground",
              )}
            >
              <StatIcon stat={k} className="size-3" />
              <span className="font-semibold tabular-nums">{totals[k]}</span>
              {STATS[k]}
            </li>
          ))}
        </ul>

        <div className="-mx-2 max-h-[55svh] min-h-40 overflow-y-auto px-2">
          {breedId === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Choisissez une classe pour voir les dégâts de ses sorts.
            </p>
          ) : !shown ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Chargement des sorts…
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {shown.map((spell) => (
                <SpellCard key={spell.id} spell={spell} level={level} totals={totals} />
              ))}
            </ul>
          )}
        </div>

        {list && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyDamage}
              onChange={(e) => setOnlyDamage(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Masquer les sorts sans dégâts
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Formule : (jet × (100 + caractéristique + puissance) / 100 + dommages) × (100 + % dommages
          aux sorts + % mêlée ou distance) / 100. Critique : jet critique + dommages critiques.
          Données des sorts : DofusDB.
        </p>
      </DialogContent>
    </Dialog>
  );
}
