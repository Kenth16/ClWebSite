"use client";

import * as React from "react";
import {
  ArrowDownWideNarrow,
  Calculator,
  Crosshair,
  Hand,
  Loader2,
  RotateCcw,
  Star,
  Swords,
  UserRound,
} from "lucide-react";
import {
  BUILD_ELEMENT_TAGS,
  ELEMENTS,
  computeSpellDamage,
  spellGradeAt,
  spellMatchesElements,
  topCombos,
  turnSpells,
  type BuildElementTag,
  type DofusElement,
  type DofusSpell,
  type SpellGrade,
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

/** Filtre du calcul : sans « Multi » (aucun élément coché = tous les éléments). */
const FILTER_TAGS = BUILD_ELEMENT_TAGS.filter((t) => t !== "multi");
const ALL_ELEMENTS = Object.keys(ELEMENTS) as DofusElement[];

/** Type d'attaque imposé au calcul : selon la portée du sort, ou forcé. */
type Attack = "auto" | "ranged" | "melee";
type SortKey = "base" | "computed" | "perAp";

const SORTS: { id: SortKey; label: string; help: string }[] = [
  { id: "base", label: "Dégâts de base", help: "Jets du sort, sans aucune caractéristique" },
  { id: "computed", label: "Dégâts calculés", help: "Moyenne avec ce stuff, critiques compris" },
  { id: "perAp", label: "Dégâts par PA", help: "Dégâts calculés divisés par le coût en PA" },
];

/** Grade utilisé pour le calcul : portée 1 en mêlée, 2 au moins à distance. */
function gradeFor(grade: SpellGrade, attack: Attack): SpellGrade {
  if (attack === "melee") return { ...grade, minRange: Math.min(grade.minRange, 1), range: 1 };
  if (attack === "ranged") return { ...grade, range: Math.max(2, grade.range) };
  return grade;
}

/** Valeurs de tri d'un sort (null : pas de dégâts à ce niveau). */
function spellValues(spell: DofusSpell, level: number, totals: StatTotals, attack: Attack) {
  const grade = spellGradeAt(spell, level);
  if (!grade || grade.lines.length === 0) return null;
  const base = grade.lines.reduce((sum, l) => sum + (l.min + l.max) / 2, 0);
  const computed = computeSpellDamage(totals, gradeFor(grade, attack)).average;
  return { base, computed, perAp: grade.apCost > 0 ? computed / grade.apCost : computed };
}

const fmtRange = (r: { min: number; max: number }) =>
  r.min === r.max ? String(r.min) : `${r.min} – ${r.max}`;

function SpellCard({
  spell,
  level,
  totals,
  attack,
  sortBy,
}: {
  spell: DofusSpell;
  level: number;
  totals: StatTotals;
  attack: Attack;
  sortBy: SortKey | null;
}) {
  const grade = spellGradeAt(spell, level);
  const firstLevel = spell.grades[0]?.minLevel ?? 1;
  const damage =
    grade && grade.lines.length > 0 ? computeSpellDamage(totals, gradeFor(grade, attack)) : null;
  const values = spellValues(spell, level, totals, attack);

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
          <p className="shrink-0 text-right leading-none">
            {/* Valeur du tri choisi en gros ; la moyenne reste rappelée dessous. */}
            {sortBy === "base" && values ? (
              <span title="Dégâts de base (jets du sort, sans caractéristique)">
                <span className="font-serif text-lg font-bold tabular-nums">
                  {Math.round(values.base)}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground">base</span>
              </span>
            ) : sortBy === "perAp" && values ? (
              <span title="Dégâts calculés divisés par le coût en PA">
                <span className="font-serif text-lg font-bold tabular-nums">
                  {Math.round(values.perAp)}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground">par PA</span>
              </span>
            ) : (
              <span title="Dégâts moyens par lancer">
                <span className="font-serif text-lg font-bold tabular-nums">{damage.average}</span>
                <span className="block text-[0.65rem] text-muted-foreground">moy.</span>
              </span>
            )}
            {(sortBy === "base" || sortBy === "perAp") && (
              <span className="mt-0.5 block text-[0.65rem] text-muted-foreground tabular-nums">
                moy. {damage.average}
              </span>
            )}
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
                      {line.pick && (
                        <span
                          className="rounded border border-gold/40 bg-gold-soft px-1 text-[0.65rem] text-gold"
                          title={
                            line.pick === "best"
                              ? "Frappe dans l'élément qui fait le plus de dégâts avec ce stuff"
                              : "Frappe dans l'élément qui fait le moins de dégâts avec ce stuff"
                          }
                        >
                          {line.pick === "best" ? "meilleur élément" : "pire élément"}
                        </span>
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
  const [attack, setAttack] = React.useState<Attack>("auto");
  const [sortBy, setSortBy] = React.useState<SortKey | null>(null);
  const [pickingClass, setPickingClass] = React.useState(false);
  const filtered = elements.length > 0 || attack !== "auto" || sortBy !== null;
  const resetFilters = () => {
    setElements([]);
    setAttack("auto");
    setSortBy(null);
  };

  React.useEffect(() => {
    if (!open || breedId === null || spells[breedId]) return;
    apiFetch<{ spells: DofusSpell[] }>(`/dofus/classes/${breedId}/spells`)
      .then((data) => setSpells((m) => ({ ...m, [breedId]: data.spells })))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Sorts indisponibles."));
  }, [open, breedId, spells]);

  const list = breedId !== null ? spells[breedId] : undefined;
  const matching = list?.filter(
    (s) =>
      (!onlyDamage || s.grades.some((g) => g.lines.length > 0)) &&
      spellMatchesElements(s, elements),
  );
  // Tri décroissant sur la valeur choisie ; les sorts sans dégâts restent à la fin.
  const shown =
    matching && sortBy
      ? [...matching]
          .map((spell) => ({ spell, v: spellValues(spell, level, totals, attack)?.[sortBy] ?? -1 }))
          .sort((a, b) => b.v - a.v)
          .map((x) => x.spell)
      : matching;
  const breed = breeds?.find((b) => b.id === breedId);
  const ap = Math.max(0, totals.ap);
  const turns = React.useMemo(
    () =>
      showTurns && shown
        ? topCombos(
            totals,
            turnSpells(shown, level, ALL_ELEMENTS, ap).map((t) => ({
              ...t,
              grade: gradeFor(t.grade, attack),
            })),
            ap,
            4,
          )
        : null,
    [showTurns, shown, totals, level, ap, attack],
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

        {/* Classe : un bouton, la liste s'ouvre dans un popup et se ferme au choix. */}
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={pickingClass} onOpenChange={setPickingClass}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={breeds === null && !breedsError}>
                {breed ? (
                  <RemoteIcon src={breed.icon} className="size-5" />
                ) : breeds === null ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <UserRound aria-hidden="true" />
                )}
                {breed ? breed.name : "Choisir sa classe"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl gap-4">
              <DialogTitle>Choisir sa classe</DialogTitle>
              <DialogDescription className="sr-only">
                Les sorts de la classe choisie s&apos;afficheront.
              </DialogDescription>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
                {breeds?.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onBreedChange(b.id);
                      setPickingClass(false);
                    }}
                    aria-pressed={b.id === breedId}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[0.7rem] transition-colors hover:bg-accent",
                      b.id === breedId
                        ? "border-primary bg-primary/10 font-semibold"
                        : "bg-card/60",
                    )}
                  >
                    <RemoteIcon src={b.icon} className="size-9" />
                    <span className="w-full truncate text-center">{b.name}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filtres et tri : éléments, type d'attaque, ordre des sorts */}
        <div className="grid gap-2 rounded-lg border bg-card/40 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ElementTagPicker value={elements} onChange={setElements} tags={FILTER_TAGS} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type d'attaque">
              {(
                [
                  { id: "ranged", label: "Dégâts distance", icon: Crosshair },
                  { id: "melee", label: "Dégâts mêlée", icon: Hand },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={attack === id}
                  title={
                    id === "melee"
                      ? "Tous les sorts calculés avec le % Do Mêlée"
                      : "Tous les sorts calculés avec le % Do Distance"
                  }
                  onClick={() => setAttack((a) => (a === id ? "auto" : id))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors hover:bg-accent",
                    attack === id
                      ? "border-primary bg-primary/10 font-semibold"
                      : "bg-card/60 text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
              Trier par
            </span>
            {SORTS.map((sort) => (
              <button
                key={sort.id}
                type="button"
                aria-pressed={sortBy === sort.id}
                title={sort.help}
                onClick={() => setSortBy((v) => (v === sort.id ? null : sort.id))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-sm transition-colors hover:bg-accent",
                  sortBy === sort.id
                    ? "border-gold/60 bg-gold-soft font-semibold text-gold"
                    : "bg-card/60 text-muted-foreground",
                )}
              >
                {sort.label}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={!filtered}
              onClick={resetFilters}
              title="Retirer tous les filtres et le tri"
            >
              <RotateCcw aria-hidden="true" />
              Réinitialiser
            </Button>
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
        </div>

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
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-md border bg-background/60 p-2"
                  >
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
                      <span className="font-serif text-lg font-bold tabular-nums">
                        {turn.damage}
                      </span>
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
              Choisissez une classe (bouton « Choisir sa classe ») pour voir les dégâts de ses
              sorts.
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
                <SpellCard
                  key={spell.id}
                  spell={spell}
                  level={level}
                  totals={totals}
                  attack={attack}
                  sortBy={sortBy}
                />
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
