"use client";

import * as React from "react";
import { Calculator, Crosshair, Hand, Loader2, Star, Swords } from "lucide-react";
import {
  BUILD_ELEMENT_TAGS,
  ELEMENTS,
  STATS,
  computeSpellDamage,
  spellGradeAt,
  spellMatchesElements,
  topCombos,
  turnSpells,
  type BuildElementTag,
  type DofusElement,
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
import { ElementTagPicker, RemoteIcon, useBreeds } from "./tags";

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

/** Filtre du calcul : sans « Multi » (aucun élément coché = tous les éléments). */
const FILTER_TAGS = BUILD_ELEMENT_TAGS.filter((t) => t !== "multi");
const ALL_ELEMENTS = Object.keys(ELEMENTS) as DofusElement[];

const fmtRange = (r: { min: number; max: number }) =>
  r.min === r.max ? String(r.min) : `${r.min} – ${r.max}`;

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

  const range = grade
    ? grade.minRange === grade.range
      ? grade.range
      : `${grade.minRange}–${grade.range}`
    : null;

  return (
    <li className="rounded-lg border bg-card/70 p-2.5">
      <div className="flex items-center gap-2.5">
        <RemoteIcon src={spell.icon} className="size-9 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-medium">{spell.name}</p>
          {grade ? (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
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
                PO {range}
              </span>
              {damage && <span>{damage.criticalChance} % crit.</span>}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Disponible au niveau {firstLevel}.</p>
          )}
        </div>
        {damage && (
          <p className="shrink-0 text-right leading-none" title="Dégâts moyens par lancer">
            <span className="font-serif text-lg font-bold tabular-nums">{damage.average}</span>
            <span className="block text-[0.65rem] text-muted-foreground">moy.</span>
          </p>
        )}
      </div>
      {damage && (
        <table className="mt-1.5 w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Élément</th>
              <th>Normal</th>
              <th>Critique</th>
            </tr>
          </thead>
          <tbody>
            {damage.lines.map((line, i) => {
              const element = ELEMENTS[line.element];
              return (
                <tr key={i}>
                  <td className="py-0.5">
                    <span className="flex items-center gap-1.5">
                      <StatIcon stat={element.damage} className="size-3.5" />
                      <span className="sr-only">{element.label}</span>
                      <span className={cn("font-semibold tabular-nums", statTone(element.damage))}>
                        {fmtRange(line.normal)}
                      </span>
                      {line.kind === "steal" && (
                        <span className="text-xs text-muted-foreground">(vol)</span>
                      )}
                    </span>
                  </td>
                  <td className="py-0.5 pl-3">
                    {line.critical ? (
                      <span
                        className="flex items-center justify-end gap-1.5"
                        title="Dégâts en coup critique"
                      >
                        <StatIcon stat="critical" className="size-3.5" />
                        <span className="sr-only">Critique :</span>
                        <span className={cn("tabular-nums", statTone(element.damage))}>
                          {fmtRange(line.critical)}
                        </span>
                      </span>
                    ) : (
                      <span className="block text-right text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
  elementTags,
}: {
  totals: StatTotals;
  level: number;
  breedId: number | null;
  onBreedChange: (id: number) => void;
  /** Éléments du stuff : filtre proposé par défaut à l'ouverture. */
  elementTags: BuildElementTag[];
}) {
  const [open, setOpen] = React.useState(false);
  const { breeds, error: breedsError } = useBreeds(open);
  const [elements, setElements] = React.useState<BuildElementTag[]>([]);
  const [spells, setSpells] = React.useState<Record<number, DofusSpell[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [onlyDamage, setOnlyDamage] = React.useState(true);
  const [showTurns, setShowTurns] = React.useState(false);

  React.useEffect(() => {
    if (!open || breedId === null || spells[breedId]) return;
    apiFetch<{ spells: DofusSpell[] }>(`/dofus/classes/${breedId}/spells`)
      .then((data) => setSpells((m) => ({ ...m, [breedId]: data.spells })))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Sorts indisponibles."));
  }, [open, breedId, spells]);

  const list = breedId !== null ? spells[breedId] : undefined;
  const shown = list?.filter(
    (s) =>
      (!onlyDamage || s.grades.some((g) => g.lines.length > 0)) &&
      spellMatchesElements(s, elements),
  );
  const breed = breeds?.find((b) => b.id === breedId);
  const ap = Math.max(0, totals.ap);
  const turns = React.useMemo(
    () =>
      showTurns && shown ? topCombos(totals, turnSpells(shown, level, ALL_ELEMENTS, ap), ap, 4) : null,
    [showTurns, shown, totals, level, ap],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // À l'ouverture, le filtre reprend les éléments choisis pour le stuff.
        if (next) setElements(elementTags.filter((t) => t !== "multi"));
        setOpen(next);
      }}
    >
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

        {(error ?? breedsError) && (
          <p className="text-sm text-destructive">{error ?? breedsError}</p>
        )}

        {/* Choix de la classe */}
        {breeds === null && !breedsError ? (
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

        {/* Filtre par élément */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Éléments</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ElementTagPicker value={elements} onChange={setElements} tags={FILTER_TAGS} />
            <Button
              variant={showTurns ? "default" : "outline"}
              size="sm"
              aria-pressed={showTurns}
              disabled={breedId === null}
              onClick={() => setShowTurns((v) => !v)}
            >
              <Swords aria-hidden="true" />
              Meilleurs tours
            </Button>
          </div>
        </fieldset>

        {showTurns && breedId !== null && (
          <section aria-label="Meilleurs tours" className="rounded-lg border bg-card/50 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Les 4 combinaisons de sorts qui font le plus de dégâts en un tour avec les {ap} PA du
              stuff (moyenne critiques compris, sorts du filtre, limites de lancers respectées).
            </p>
            {!turns ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Chargement des sorts…
              </p>
            ) : turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun sort de dégâts ne tient dans {ap} PA.
              </p>
            ) : (
              <ol className="grid gap-2 md:grid-cols-2">
                {turns.map((turn, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-md border bg-background/60 p-2">
                    <span className="w-5 shrink-0 text-center font-serif text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {turn.casts.map((c) => (
                        <li
                          key={c.spellId}
                          title={`${c.name} : ${c.casts} × ${c.perCast} (${c.apCost} PA)`}
                          className="flex items-center gap-1 rounded-full border bg-card/70 py-0.5 pl-0.5 pr-2 text-xs"
                        >
                          <RemoteIcon src={c.icon} className="size-6" />
                          <span className="max-w-28 truncate">{c.name}</span>
                          {c.casts > 1 && <span className="font-semibold">× {c.casts}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="shrink-0 text-right leading-none">
                      <span className="font-serif text-lg font-bold tabular-nums">{turn.damage}</span>
                      <span className="block text-[0.65rem] text-muted-foreground">
                        {turn.apUsed}/{ap} PA
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

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
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucun sort ne correspond à ce filtre.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
