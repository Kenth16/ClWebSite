"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ExternalLink, Loader2, WandSparkles } from "lucide-react";
import {
  CHARACTERISTICS,
  ELEMENTS,
  LEVEL_MAX,
  SLOTS,
  STATS,
  clampLevel,
  computeCharacter,
  conditionsMet,
  conditionsText,
  OPTIMIZER_AP_MIN,
  OPTIMIZER_ELEMENTS,
  STAT_CAPS,
  type Characteristic,
  type DofusBreed,
  type DofusElement,
  type ExoStat,
  type Exos,
  type TurnCombo,
  type DofusItem,
  type DofusSet,
  type ElementShare,
  type SlotId,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EffectList, ItemIcon } from "./item-picker";
import { StatIcon, statTone } from "./stat-icon";
import { STUFF_STORAGE_KEY } from "./storage";
import { RemoteIcon, useBreeds } from "./tags";

interface JobView {
  id: string;
  status: "queued" | "running" | "done" | "error";
  position: number;
  progress: {
    phase: "data" | "search" | "proof";
    damage: number | null;
    upper: number | null;
    cellsLeft: number;
    solves: number;
  };
  result?: OptimizeResponse;
  error?: string;
  elapsedMs: number;
}

interface OptimizeResponse {
  breed: DofusBreed;
  level: number;
  elements: DofusElement[];
  ap: number;
  exos: Exos;
  classElements: ElementShare[];
  points: Record<Characteristic, number>;
  scrolls: Record<Characteristic, number>;
  slots: Partial<Record<SlotId, number>>;
  proof: {
    proven: boolean;
    damage: number;
    upper: number;
    solves: number;
    candidates: number;
    considered: number;
    ms: number;
    localDamage: number;
  };
  combo: TurnCombo;
  items: DofusItem[];
  sets: DofusSet[];
}

const EXO_CHOICES: { stat: ExoStat; label: string }[] = [
  { stat: "ap", label: "PA" },
  { stat: "mp", label: "PM" },
  { stat: "range", label: "PO" },
];

const AP_CHOICES = Array.from(
  { length: STAT_CAPS.ap - OPTIMIZER_AP_MIN + 1 },
  (_, i) => OPTIMIZER_AP_MIN + i,
);

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const SUMMARY: StatKey[] = [
  "ap",
  "mp",
  "range",
  "vitality",
  "wisdom",
  "strength",
  "intelligence",
  "chance",
  "agility",
  "power",
  "critical",
  "damage",
  "summons",
];

/** Optimiseur : classe + niveau → meilleur stuff trouvé par l'algorithme. */
export function StuffOptimizer() {
  const router = useRouter();
  const { breeds, error: breedsError } = useBreeds();
  const [breedId, setBreedId] = React.useState<number | null>(null);
  const [level, setLevel] = React.useState(LEVEL_MAX);
  const [elements, setElements] = React.useState<DofusElement[]>([]);
  const [ap, setAp] = React.useState<number>(STAT_CAPS.ap);
  const [exos, setExos] = React.useState<Exos>({ ap: false, mp: false, range: false });
  const [running, setRunning] = React.useState(false);
  const [job, setJob] = React.useState<JobView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<OptimizeResponse | null>(null);

  async function run() {
    if (breedId === null || elements.length === 0) return;
    setRunning(true);
    setError(null);
    setJob(null);
    try {
      // Le calcul tourne en tâche de fond : on le lance puis on suit sa progression.
      let { job: current } = await apiFetch<{ job: JobView }>("/dofus/optimize", {
        method: "POST",
        body: { breedId, level, elements, ap, exos },
      });
      setJob(current);
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = (await apiFetch<{ job: JobView }>(`/dofus/optimize/${current.id}`)).job;
        setJob(current);
      }
      if (current.status === "error" || !current.result) {
        throw new ApiError(500, current.error ?? "L'optimisation a échoué.");
      }
      setResult(current.result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "L'optimisation a échoué.");
    } finally {
      setRunning(false);
    }
  }

  const character = React.useMemo(
    () =>
      result
        ? computeCharacter({
            level: result.level,
            base: result.points,
            scrolls: result.scrolls,
            items: result.items,
            sets: result.sets,
            exos: result.exos,
          })
        : null,
    [result],
  );

  function openInSimulator() {
    if (!result) return;
    try {
      localStorage.setItem(
        STUFF_STORAGE_KEY,
        JSON.stringify({
          name: `${result.breed.name} ${result.level} (optimiseur)`.slice(0, 40),
          level: result.level,
          slots: result.slots,
          base: result.points,
          scrolls: result.scrolls,
          breedId: result.breed.id,
          exos: result.exos,
          tags: {
            elements: result.elements.filter((e) => e !== "neutral"),
            classes: [result.breed.id],
          },
        }),
      );
    } catch {
      // Stockage indisponible : le simulateur s'ouvrira simplement vide.
    }
    router.push("/dofus/simulateur");
  }

  const itemById = new Map(result?.items.map((i) => [i.id, i]));

  return (
    <div className="space-y-6">
      {/* Paramètres */}
      <section className="grid gap-4 rounded-xl border bg-card/70 p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Classe à optimiser</legend>
          {breedsError ? (
            <p className="text-sm text-destructive">{breedsError}</p>
          ) : !breeds ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Chargement des classes…
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-10 xl:grid-cols-[repeat(19,minmax(0,1fr))]">
              {breeds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBreedId(b.id)}
                  aria-pressed={b.id === breedId}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[0.7rem] transition-colors hover:bg-accent",
                    b.id === breedId ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
                  )}
                >
                  <RemoteIcon src={b.icon} className="size-9" />
                  <span className="w-full truncate text-center">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Niveau
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={LEVEL_MAX}
              value={level}
              onChange={(e) => setLevel(clampLevel(Number(e.target.value)))}
              className={cn("w-24 tabular-nums", NO_SPIN)}
            />
          </label>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Éléments joués</legend>
            <div className="flex flex-wrap gap-1.5">
              {OPTIMIZER_ELEMENTS.map((e) => {
                const on = elements.includes(e);
                const el = ELEMENTS[e];
                return (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setElements((list) => (on ? list.filter((x) => x !== e) : [...list, e]))
                    }
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors hover:bg-accent",
                      on
                        ? "border-primary bg-primary/10 font-semibold"
                        : "bg-card/60 text-muted-foreground",
                    )}
                  >
                    <StatIcon stat={el.damage} className="size-4" />
                    {el.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">PA du stuff</legend>
            <div className="flex gap-1" role="radiogroup">
              {AP_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={ap === n}
                  onClick={() => setAp(n)}
                  className={cn(
                    "flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-sm tabular-nums transition-colors hover:bg-accent",
                    ap === n ? "border-gold/60 bg-gold-soft font-semibold text-gold" : "bg-card/60",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Exos possibles</legend>
            <div className="flex gap-1">
              {EXO_CHOICES.map(({ stat, label }) => (
                <button
                  key={stat}
                  type="button"
                  aria-pressed={exos[stat]}
                  title={`Le joueur peut ajouter +1 ${label} par forgemagie sur un objet`}
                  onClick={() => setExos((x) => ({ ...x, [stat]: !x[stat] }))}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors hover:bg-accent",
                    exos[stat]
                      ? "border-gold/60 bg-gold-soft font-semibold text-gold"
                      : "bg-card/60 text-muted-foreground",
                  )}
                >
                  <StatIcon stat={stat} className="size-4" />
                  Exo {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Button
            disabled={breedId === null || elements.length === 0 || running}
            onClick={() => void run()}
          >
            {running ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles aria-hidden="true" />
            )}
            {running ? "Optimisation…" : "Optimiser"}
          </Button>
          {running && <JobProgress job={job} />}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {result && character && (
        <section className="space-y-4" aria-live="polite">
          {/* En-tête du résultat */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gold/40 bg-gold-soft p-4">
            <RemoteIcon src={result.breed.icon} className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl tracking-wide">
                {result.breed.name} niveau {result.level}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {result.elements.map((e) => (
                  <span key={e} className="flex items-center gap-1">
                    <StatIcon stat={ELEMENTS[e].damage} className="size-3.5" />
                    <span className={statTone(ELEMENTS[e].damage)}>{ELEMENTS[e].label}</span>
                  </span>
                ))}
                <span>· {result.ap} PA</span>
                {EXO_CHOICES.filter(({ stat }) => result.exos[stat]).map(({ stat, label }) => (
                  <span key={stat} className="font-semibold text-gold">
                    · Exo {label}
                  </span>
                ))}
                <span>
                  · Points :{" "}
                  {CHARACTERISTICS.filter((c) => result.points[c] > 0)
                    .map((c) => `${result.points[c]} ${STATS[c]}`)
                    .join(", ")}{" "}
                  (+ parchemins)
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-3xl font-bold tabular-nums">
                {result.combo.damage.toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-muted-foreground">dégâts moyens sur un tour</p>
              {result.proof.proven ? (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  Optimum prouvé
                </p>
              ) : (
                <p className="mt-1 text-xs text-destructive">
                  Non prouvé : au plus{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      ((result.proof.upper - result.proof.damage) / result.proof.damage) * 100,
                    ),
                  )}{" "}
                  % de mieux possible
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                calcul : {(result.proof.ms / 1000).toFixed(1)} s
              </p>
            </div>
            <Button onClick={openInSimulator}>
              <ExternalLink aria-hidden="true" />
              Ouvrir dans le simulateur
            </Button>
          </div>

          {/* Combo du tour */}
          <section className="rounded-xl border bg-card/70 p-4">
            <h2 className="mb-3 font-medium">
              Meilleur combo sur {result.ap} PA{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({result.combo.apUsed} PA utilisés)
              </span>
            </h2>
            {result.combo.casts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun sort lançable.</p>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {result.combo.casts.map((c) => (
                  <li
                    key={c.spellId}
                    className="flex items-center gap-2.5 rounded-lg border bg-background/40 p-2.5"
                  >
                    <RemoteIcon src={c.icon} className="size-9 shrink-0" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate font-medium">
                        {c.casts > 1 && <span className="text-gold">{c.casts} × </span>}
                        {c.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.apCost} PA · {c.perCast} par lancer
                      </p>
                    </div>
                    <p className="font-serif text-lg font-bold tabular-nums">
                      {c.perCast * c.casts}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Moyenne par lancer, coups critiques compris, sur une cible sans résistances. Une seule
              variante de chaque sort et les limites de lancers par tour sont respectées.
            </p>
          </section>

          {/* Résumé des caractéristiques (sans points de caractéristique ni parchemins) */}
          <ul className="flex flex-wrap gap-2 text-sm">
            <li className="flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1">
              <StatIcon stat="vitality" className="size-3.5" />
              <span className="font-semibold tabular-nums">{character.hp}</span> PV
            </li>
            {SUMMARY.filter((k) => character.totals[k] !== 0).map((k) => (
              <li
                key={k}
                className="flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1"
              >
                <StatIcon stat={k} className="size-3.5" />
                <span className="font-semibold tabular-nums">{character.totals[k]}</span>
                <span className="text-muted-foreground">{STATS[k]}</span>
              </li>
            ))}
          </ul>

          {character.activeSets.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-sm">
              {character.activeSets.map((s) => (
                <li
                  key={s.set.id}
                  className="rounded-md border border-gold/40 bg-gold-soft px-3 py-1"
                >
                  {s.set.name} · {s.count} objets
                </li>
              ))}
            </ul>
          )}

          {/* Objets retenus */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SLOTS.map((slot) => {
              const id = result.slots[slot.id];
              const item = id !== undefined ? itemById.get(id) : undefined;
              const ok =
                !item ||
                conditionsMet(item.conditions, {
                  level: result.level,
                  totals: character.totals,
                });
              return (
                <li
                  key={slot.id}
                  className="flex flex-col gap-2 rounded-lg border bg-card/70 p-3 text-sm"
                >
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {slot.label}
                  </p>
                  {item ? (
                    <>
                      <div className="flex items-center gap-2.5">
                        <ItemIcon item={item} className="size-11 shrink-0" />
                        <div className="min-w-0 leading-tight">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Niv. {item.level} · {item.type}
                          </p>
                          {item.set && (
                            <p className="truncate text-xs text-gold">{item.set.name}</p>
                          )}
                        </div>
                      </div>
                      <EffectList item={item} className="text-[0.8rem]" />
                      {item.conditions && (
                        <p
                          className={cn(
                            "mt-auto text-xs",
                            ok ? "text-muted-foreground" : "text-destructive",
                          )}
                        >
                          Conditions : {conditionsText(item.conditions)}
                          {!ok && " (non remplies)"}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">Aucun objet retenu.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Le stuff retenu est celui dont le meilleur combo de sorts (dans les éléments choisis,
            avec les PA choisis) fait le plus de dégâts sur un tour, bonus de panoplie compris. «
            Optimum prouvé » : un solveur d&apos;optimisation (programmation linéaire en nombres
            entiers) a vérifié qu&apos;aucun autre stuff ne fait plus, parmi{" "}
            {result.proof.considered.toLocaleString("fr-FR")} objets du niveau. Le stuff doit
            atteindre ces PA, exo compris s&apos;il est coché ; les points de caractéristique sont
            répartis dans les éléments choisis, avec les parchemins complets. Les conditions des
            objets ne sont pas encore prises en compte.
          </p>
        </section>
      )}
    </div>
  );
}

/** Progression du calcul : recherche, puis preuve d'optimalité. */
function JobProgress({ job }: { job: JobView | null }) {
  const p = job?.progress;
  let text = "Lancement du calcul…";
  if (job?.status === "queued") {
    text = `En file d'attente (position ${job.position})…`;
  } else if (p?.phase === "data") {
    text = "Chargement de tous les objets du jeu…";
  } else if (p?.phase === "search") {
    text = "Recherche d'un premier stuff…";
  } else if (p?.phase === "proof") {
    const gap =
      p.damage && p.upper && p.upper > p.damage
        ? ` · au plus ${Math.ceil(((p.upper - p.damage) / p.damage) * 100)} % de mieux possible`
        : "";
    text = `Preuve d'optimalité en cours : meilleur stuff ${Math.round(p.damage ?? 0).toLocaleString("fr-FR")} dégâts${gap}`;
  }
  return (
    <p className="pb-2 text-sm text-muted-foreground" aria-live="polite">
      {text}
      {job && job.elapsedMs > 0 && <> · {Math.round(job.elapsedMs / 1000)} s</>}
    </p>
  );
}
