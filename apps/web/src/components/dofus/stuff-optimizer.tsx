"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ExternalLink, Loader2, WandSparkles } from "lucide-react";
import {
  CHARACTERISTICS,
  ELEMENTS,
  LEVEL_MAX,
  OPTIMIZER_AP_MIN,
  DEFAULT_SITUATION,
  OPTIMIZER_SPELLS_MAX,
  PICKABLE_ELEMENTS,
  RESISTANCE_STATS,
  SCROLL_MAX,
  SLOTS,
  STATS,
  STAT_CAPS,
  clampLevel,
  conditionsMet,
  conditionsText,
  hasPickedLines,
  optimizerGrade,
  spellGradeAt,
  type Characteristic,
  type DofusBreed,
  type DofusElement,
  type DofusItem,
  type DofusSet,
  type DofusSpell,
  type ExoStat,
  type Exos,
  type LineDamage,
  type OptimizerSituation,
  type PickableElement,
  type SlotId,
  type StatTotals,
  type TurnSpell,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EffectList, ItemIcon } from "./item-picker";
import { StatIcon, statTone } from "./stat-icon";
import { DEFAULT_ITEM_RULES, OptimizerItems, type ItemRules } from "./optimizer-items";
import { OptimizerSituationPanel, loadOwnedDofus } from "./optimizer-situation";
import { STUFF_STORAGE_KEY } from "./storage";
import { RemoteIcon, useBreeds } from "./tags";
import {
  OptimizerExplainer,
  type CellTrace,
  type ExplainerState,
  type JobTrace,
} from "./optimizer-explainer";

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
  trace: JobTrace;
  cells: CellTrace[];
  cellsFrom: number;
}

interface SpellResult {
  spellId: number;
  name: string;
  icon: string | null;
  apCost: number;
  average: number;
  lines: LineDamage[];
  criticalChance: number;
}

interface OptimizeResponse {
  breed: DofusBreed;
  level: number;
  ap: number;
  exos: Exos;
  critical: boolean;
  attack: "ranged" | "melee";
  scrolls: number;
  minimums: Minimums;
  points: Record<Characteristic, number>;
  slots: Partial<Record<SlotId, number>>;
  /** Choix des effets spéciaux du stuff (situation simulée). */
  specials: Record<string, string>;
  damage: number;
  spells: SpellResult[];
  hp: number;
  totals: StatTotals;
  items: DofusItem[];
  sets: DofusSet[];
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
}

type ResistanceElement = keyof typeof RESISTANCE_STATS;
interface Minimums {
  hp?: number;
  mp?: number;
  range?: number;
  resistances: Partial<Record<ResistanceElement, number>>;
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
const RESISTANCES: ResistanceElement[] = ["neutral", "earth", "fire", "water", "air"];

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Nombre saisi (vide : pas d'exigence). */
const numberOrUndefined = (text: string) => {
  const n = Math.trunc(Number(text));
  return text.trim() === "" || !Number.isFinite(n) ? undefined : n;
};

/** Boutons à choix unique (ex. Distance / Mêlée). */
function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors hover:bg-accent",
            value === o.value ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Champ numérique court avec libellé. */
function NumberField({
  label,
  value,
  onChange,
  placeholder,
  icon,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1 text-sm font-medium", className)}>
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 w-24 tabular-nums", NO_SPIN)}
      />
    </label>
  );
}

/** Un sort de la paire : case à cocher, coût, éléments, et élément choisi s'il frappe au meilleur élément. */
function SpellChoice({
  spell,
  grade,
  picked,
  on,
  element,
  onToggle,
  onElement,
}: {
  spell: DofusSpell;
  grade: ReturnType<typeof optimizerGrade> | null;
  picked: boolean;
  on: boolean;
  element: PickableElement;
  onToggle: () => void;
  onElement: (element: PickableElement) => void;
}) {
  const hits = !!grade && grade.lines.length > 0;
  const elements = hits ? ([...new Set(grade.lines.map((l) => l.element))] as DofusElement[]) : [];
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-md border transition-colors",
        on ? "border-primary bg-primary/10" : "border-transparent",
      )}
    >
      <button
        type="button"
        aria-pressed={on}
        disabled={!hits}
        onClick={onToggle}
        title={hits ? undefined : "Ce sort ne fait pas de dégâts"}
        className="flex w-full min-w-0 items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded border",
            on && "border-primary bg-primary text-primary-foreground",
          )}
          aria-hidden="true"
        >
          {on && <Check className="size-3" />}
        </span>
        <RemoteIcon src={spell.icon} className="size-8 shrink-0" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-medium">{spell.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {hits ? (
              <>
                {grade.apCost} PA
                {!picked &&
                  elements.map((e) => (
                    <StatIcon key={e} stat={ELEMENTS[e].damage} className="size-3" />
                  ))}
                {picked && <span className="text-gold">meilleur élément</span>}
              </>
            ) : (
              "Pas de dégâts"
            )}
          </span>
        </span>
      </button>
      {on && picked && (
        <div
          className="flex items-center gap-1 px-1.5 pb-1.5"
          role="radiogroup"
          aria-label="Élément"
        >
          {PICKABLE_ELEMENTS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={element === e}
              onClick={() => onElement(e)}
              title={ELEMENTS[e].label}
              className={cn(
                "flex size-6 items-center justify-center rounded border transition-colors hover:bg-accent",
                element === e ? "border-gold/60 bg-gold-soft" : "opacity-60",
              )}
            >
              <StatIcon stat={ELEMENTS[e].damage} className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const range = (r: { min: number; max: number }) =>
  r.min === r.max ? String(r.min) : `${r.min} – ${r.max}`;

/**
 * Optimiseur : le joueur choisit sa classe, son niveau et les sorts qu'il veut
 * évaluer, puis ses exigences ; le solveur trouve le stuff qui fait le plus de
 * dégâts sur ces sorts en respectant tout, et le prouve.
 */
export function StuffOptimizer() {
  const router = useRouter();
  const { breeds, error: breedsError } = useBreeds();
  const [breedId, setBreedId] = React.useState<number | null>(null);
  const [level, setLevel] = React.useState(LEVEL_MAX);
  const [classSpells, setClassSpells] = React.useState<Record<number, DofusSpell[]>>({});
  const [spellIds, setSpellIds] = React.useState<number[]>([]);
  const [pickElements, setPickElements] = React.useState<Record<number, PickableElement>>({});
  const [itemRules, setItemRules] = React.useState<ItemRules>(DEFAULT_ITEM_RULES);
  const [situation, setSituation] = React.useState<OptimizerSituation>(DEFAULT_SITUATION);
  // Dofus possédés retenus sur cet appareil (affichés une fois la liste chargée).
  const [ownedDofus, setOwnedDofus] = React.useState<number[] | null>(loadOwnedDofus);
  const [ap, setAp] = React.useState<number>(STAT_CAPS.ap);
  const [exos, setExos] = React.useState<Exos>({ ap: false, mp: false, range: false });
  const [critical, setCritical] = React.useState<"yes" | "no">("yes");
  const [attack, setAttack] = React.useState<"ranged" | "melee">("ranged");
  const [scrolls, setScrolls] = React.useState("100");
  const [hp, setHp] = React.useState("");
  const [mp, setMp] = React.useState("");
  const [po, setPo] = React.useState("");
  const [res, setRes] = React.useState<Record<ResistanceElement, string>>({
    neutral: "",
    earth: "",
    fire: "",
    water: "",
    air: "",
  });
  const [running, setRunning] = React.useState(false);
  const [job, setJob] = React.useState<JobView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<OptimizeResponse | null>(null);
  // Déroulé du dernier calcul (explication) : sorts lancés et cellules reçues.
  const [runSpells, setRunSpells] = React.useState<TurnSpell[]>([]);
  const [runOptions, setRunOptions] = React.useState({ attack, critical: true, ap });
  const [cells, setCells] = React.useState<CellTrace[]>([]);

  // Sorts de la classe choisie (chargés une fois par classe).
  React.useEffect(() => {
    if (breedId === null || classSpells[breedId]) return;
    apiFetch<{ spells: DofusSpell[] }>(`/dofus/classes/${breedId}/spells`)
      .then(({ spells }) => setClassSpells((m) => ({ ...m, [breedId]: spells })))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Sorts indisponibles."));
  }, [breedId, classSpells]);

  /** Grade compté par l'optimiseur (élément choisi pour les lignes « meilleur élément »). */
  const gradeOf = (s: DofusSpell) => {
    const found = spellGradeAt(s, level);
    return found ? optimizerGrade(found, pickElements[s.id] ?? "earth") : null;
  };
  const pickedAt = (s: DofusSpell) => {
    const found = spellGradeAt(s, level);
    return !!found && hasPickedLines(found);
  };
  const allSpells = breedId !== null ? (classSpells[breedId] ?? null) : null;
  const damageSpells = allSpells?.filter((s) => (gradeOf(s)?.lines.length ?? 0) > 0);
  // Paires de variantes (sort de base et sa variante), dans l'ordre de la classe.
  const spellPairs = allSpells
    ? [
        ...allSpells
          .reduce(
            (m, s) => m.set(s.variant, [...(m.get(s.variant) ?? []), s]),
            new Map<number, DofusSpell[]>(),
          )
          .values(),
      ].filter((pair) => pair.some((s) => (gradeOf(s)?.lines.length ?? 0) > 0))
    : null;
  const selected = new Set(spellIds);
  const selectedAp = (damageSpells ?? [])
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + (spellGradeAt(s, level)?.apCost ?? 0), 0);

  function chooseBreed(id: number) {
    if (id === breedId) return;
    setBreedId(id);
    setSpellIds([]);
    setPickElements({});
    setResult(null);
  }

  /** Coche un sort ; sa variante (même emplacement de sort) est décochée. */
  function toggleSpell(spell: DofusSpell) {
    if (spellIds.includes(spell.id)) {
      setSpellIds(spellIds.filter((x) => x !== spell.id));
      return;
    }
    const partner = (allSpells ?? []).find((s) => s.variant === spell.variant && s.id !== spell.id);
    const list = spellIds.filter((x) => x !== partner?.id);
    if (list.length >= OPTIMIZER_SPELLS_MAX) return;
    setSpellIds([...list, spell.id]);
    // Lignes « meilleur élément » : l'élément le plus présent parmi les sorts cochés.
    if (pickedAt(spell) && !pickElements[spell.id]) {
      const counts = new Map<PickableElement, number>();
      for (const s of (allSpells ?? []).filter((x) => list.includes(x.id))) {
        for (const l of gradeOf(s)?.lines ?? []) {
          const e = l.element as PickableElement;
          if (PICKABLE_ELEMENTS.includes(e)) counts.set(e, (counts.get(e) ?? 0) + 1);
        }
      }
      const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "earth";
      setPickElements((m) => ({ ...m, [spell.id]: best }));
    }
  }

  async function run() {
    if (breedId === null || spellIds.length === 0) return;
    setRunning(true);
    setError(null);
    setJob(null);
    setResult(null);
    setCells([]);
    const chosenSpells = (damageSpells ?? []).filter((s) => selected.has(s.id));
    setRunSpells(chosenSpells.map((spell) => ({ spell, grade: gradeOf(spell)!, limit: 1 })));
    setRunOptions({ attack, critical: critical === "yes", ap });
    const minimums: Minimums = {
      hp: numberOrUndefined(hp),
      mp: numberOrUndefined(mp),
      range: numberOrUndefined(po),
      resistances: Object.fromEntries(
        RESISTANCES.map((e) => [e, numberOrUndefined(res[e])]).filter(([, v]) => v !== undefined),
      ),
    };
    try {
      // Le calcul tourne en tâche de fond : on le lance puis on suit sa progression.
      let { job: current } = await apiFetch<{ job: JobView }>("/dofus/optimize", {
        method: "POST",
        body: {
          breedId,
          level,
          spellIds: chosenSpells.map((s) => s.id),
          ap,
          exos,
          critical: critical === "yes",
          attack,
          scrolls: Math.min(SCROLL_MAX, Math.max(0, numberOrUndefined(scrolls) ?? 0)),
          minimums,
          pickElements: Object.fromEntries(
            chosenSpells.filter(pickedAt).map((s) => [s.id, pickElements[s.id] ?? "earth"]),
          ),
          prysmaradites: itemRules.prysmaradites,
          legendaryItems: itemRules.legendaryItems,
          forcedItems: itemRules.forced.map((i) => i.id),
          bannedItems: itemRules.banned.map((i) => i.id),
          situation,
          ownedDofus,
        },
      });
      setJob(current);
      // Cellules reçues au fur et à mesure : on ne redemande que les nouvelles.
      let received = 0;
      const accept = (view: JobView) => {
        const fresh = view.cells.slice(Math.max(0, received - view.cellsFrom));
        received = view.cellsFrom + view.cells.length;
        if (fresh.length > 0) setCells((list) => [...list, ...fresh]);
      };
      accept(current);
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = (
          await apiFetch<{ job: JobView }>(`/dofus/optimize/${current.id}?since=${received}`)
        ).job;
        accept(current);
        setJob(current);
      }
      // Dernières cellules (plus de 2 000 par réponse au plus).
      while (current.cells.length > 0 && received < current.trace.cellCount) {
        current = (
          await apiFetch<{ job: JobView }>(`/dofus/optimize/${current.id}?since=${received}`)
        ).job;
        if (current.cells.length === 0) break;
        accept(current);
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
          scrolls: Object.fromEntries(CHARACTERISTICS.map((c) => [c, result.scrolls])),
          breedId: result.breed.id,
          exos: result.exos,
          specials: result.specials,
          tags: { elements: [], classes: [result.breed.id] },
        }),
      );
    } catch {
      // Stockage indisponible : le simulateur s'ouvrira simplement vide.
    }
    router.push("/dofus/simulateur");
  }

  const itemById = new Map(result?.items.map((i) => [i.id, i]));
  const explainer: ExplainerState | null = job
    ? {
        phase:
          job.status === "queued"
            ? "queued"
            : job.status === "running"
              ? job.progress.phase
              : "done",
        trace: job.trace,
        cells,
        damage: job.progress.damage,
        upper: job.progress.upper,
        proven: result?.proof.proven ?? null,
        elapsedMs: job.elapsedMs,
      }
    : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-5 rounded-xl border bg-card/70 p-4">
        {/* 1. Classe et niveau */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">1. Classe</legend>
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
                  onClick={() => chooseBreed(b.id)}
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
        <label className="grid w-fit gap-1 text-sm font-medium">
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

        {/* 2. Sorts à évaluer */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            2. Sorts à évaluer{" "}
            <span className="font-normal text-muted-foreground">
              ({spellIds.length} choisi{spellIds.length > 1 ? "s" : ""}
              {selectedAp > 0 && ` · ${selectedAp} PA au total`})
            </span>
          </legend>
          {breedId === null ? (
            <p className="text-sm text-muted-foreground">Choisissez d&apos;abord une classe.</p>
          ) : !spellPairs ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Chargement des sorts…
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                Chaque case réunit un sort et sa variante : un seul des deux peut être choisi, comme
                dans la barre de sorts.
              </p>
              <ul className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                {spellPairs.map((pair) => (
                  <li
                    key={pair[0]!.variant}
                    className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1 rounded-lg border bg-card/40 p-1"
                  >
                    {pair.map((s, i) => (
                      <React.Fragment key={s.id}>
                        {i > 0 && (
                          <span
                            className="self-center text-[0.65rem] text-muted-foreground"
                            aria-hidden="true"
                          >
                            ou
                          </span>
                        )}
                        <SpellChoice
                          spell={s}
                          grade={gradeOf(s)}
                          picked={pickedAt(s)}
                          on={selected.has(s.id)}
                          element={pickElements[s.id] ?? "earth"}
                          onToggle={() => toggleSpell(s)}
                          onElement={(e) => setPickElements((m) => ({ ...m, [s.id]: e }))}
                        />
                      </React.Fragment>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>

        {/* 3. Exigences */}
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">
            3. Exigences du stuff{" "}
            <span className="font-normal text-muted-foreground">(minimums, facultatifs)</span>
          </legend>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <span className="text-sm font-medium">PA</span>
              <div className="flex gap-1" role="radiogroup">
                {AP_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={ap === n}
                    onClick={() => setAp(n)}
                    className={cn(
                      "flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors hover:bg-accent",
                      ap === n
                        ? "border-gold/60 bg-gold-soft font-semibold text-gold"
                        : "bg-card/60",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1">
              <span className="text-sm font-medium">Exos possibles</span>
              <div className="flex gap-1">
                {EXO_CHOICES.map(({ stat, label }) => (
                  <button
                    key={stat}
                    type="button"
                    aria-pressed={exos[stat]}
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
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <NumberField
              label="PV"
              value={hp}
              onChange={setHp}
              placeholder="ex. 4000"
              icon={<StatIcon stat="vitality" className="size-4" />}
            />
            <NumberField
              label="PM"
              value={mp}
              onChange={setMp}
              placeholder="ex. 5"
              icon={<StatIcon stat="mp" className="size-4" />}
            />
            <NumberField
              label="PO"
              value={po}
              onChange={setPo}
              placeholder="ex. 6"
              icon={<StatIcon stat="range" className="size-4" />}
            />
            {RESISTANCES.map((e) => (
              <NumberField
                key={e}
                label={`% Ré ${ELEMENTS[e].label}`}
                value={res[e]}
                onChange={(v) => setRes((r) => ({ ...r, [e]: v }))}
                placeholder="ex. 30"
                icon={<StatIcon stat={RESISTANCE_STATS[e]} className="size-4" />}
              />
            ))}
          </div>
        </fieldset>

        {/* 4. Objets */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            4. Objets du stuff{" "}
            <span className="font-normal text-muted-foreground">(facultatif)</span>
          </legend>
          <OptimizerItems level={level} value={itemRules} onChange={setItemRules} />
        </fieldset>

        {/* 5. Situation de combat */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            5. Situation de combat{" "}
            <span className="font-normal text-muted-foreground">
              (bonus des Dofus, Prysmaradites et légendaires ; la légende animale s&apos;ajoute
              ensuite dans le simulateur)
            </span>
          </legend>
          <OptimizerSituationPanel
            situation={situation}
            onSituation={setSituation}
            owned={ownedDofus}
            onOwned={setOwnedDofus}
          />
        </fieldset>

        {/* 6. Calcul */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <span className="text-sm font-medium">Critiques</span>
            <Choice
              value={critical}
              onChange={setCritical}
              options={[
                { value: "yes", label: "Pondérés" },
                { value: "no", label: "Sans critique" },
              ]}
            />
          </div>
          <div className="grid gap-1">
            <span className="text-sm font-medium">Attaque</span>
            <Choice
              value={attack}
              onChange={setAttack}
              options={[
                { value: "ranged", label: "Distance" },
                { value: "melee", label: "Mêlée" },
              ]}
            />
          </div>
          <NumberField
            label="Parchotage (0 à 100)"
            value={scrolls}
            onChange={setScrolls}
            className="w-40"
          />
          <Button
            disabled={breedId === null || spellIds.length === 0 || running}
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

      {explainer && runSpells.length > 0 && (
        <OptimizerExplainer
          state={explainer}
          spells={runSpells}
          totals={result?.totals ?? null}
          attack={runOptions.attack}
          critical={runOptions.critical}
          ap={runOptions.ap}
        />
      )}

      {result && (
        <section className="space-y-4" aria-live="polite">
          {/* En-tête du résultat */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gold/40 bg-gold-soft p-4">
            <RemoteIcon src={result.breed.icon} className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl tracking-wide">
                {result.breed.name} niveau {result.level}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.spells.length} sort{result.spells.length > 1 ? "s" : ""} ·{" "}
                {result.attack === "melee" ? "mêlée" : "distance"} ·{" "}
                {result.critical ? "critiques pondérés" : "sans critique"} · parchotage{" "}
                {result.scrolls}
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-3xl font-bold tabular-nums">
                {Math.round(result.damage).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-muted-foreground">dégâts moyens, sorts choisis</p>
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

          {/* Dégâts par sort */}
          <section className="rounded-xl border bg-card/70 p-4">
            <h2 className="mb-3 font-medium">Dégâts par sort</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {result.spells.map((s) => (
                <li key={s.spellId} className="rounded-lg border bg-background/40 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <RemoteIcon src={s.icon} className="size-9 shrink-0" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.apCost} PA{result.critical && ` · ${s.criticalChance} % crit.`}
                      </p>
                    </div>
                    <p className="font-serif text-lg font-bold tabular-nums">
                      {Math.round(s.average)}
                    </p>
                  </div>
                  <ul className="mt-1.5 grid gap-0.5 text-sm">
                    {s.lines.map((line, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <StatIcon stat={ELEMENTS[line.element].damage} className="size-3.5" />
                        <span
                          className={cn("tabular-nums", statTone(ELEMENTS[line.element].damage))}
                        >
                          {range(line.normal)}
                        </span>
                        {result.critical && line.critical && (
                          <span className="ml-auto flex items-center gap-1">
                            <StatIcon stat="critical" className="size-3.5" />
                            <span
                              className={cn(
                                "tabular-nums",
                                statTone(ELEMENTS[line.element].damage),
                              )}
                            >
                              {range(line.critical)}
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {/* Exigences et caractéristiques obtenues */}
          <ul className="flex flex-wrap gap-2 text-sm">
            <Requirement stat="vitality" label="PV" value={result.hp} min={result.minimums.hp} />
            <Requirement stat="ap" label="PA" value={result.totals.ap} min={result.ap} />
            <Requirement stat="mp" label="PM" value={result.totals.mp} min={result.minimums.mp} />
            <Requirement
              stat="range"
              label="PO"
              value={result.totals.range}
              min={result.minimums.range}
            />
            {RESISTANCES.map((e) => (
              <Requirement
                key={e}
                stat={RESISTANCE_STATS[e]}
                label={`% Ré ${ELEMENTS[e].label}`}
                value={result.totals[RESISTANCE_STATS[e]]}
                min={result.minimums.resistances[e]}
              />
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            Points de caractéristique choisis :
            {CHARACTERISTICS.filter((c) => result.points[c] > 0).map((c) => (
              <span key={c} className="flex items-center gap-1 text-foreground">
                <StatIcon stat={c} className="size-3.5" />
                <span className="font-semibold tabular-nums">{result.points[c]}</span> {STATS[c]}
              </span>
            ))}
          </p>
          {result.sets.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-sm">
              {result.sets.map((s) => (
                <li key={s.id} className="rounded-md border border-gold/40 bg-gold-soft px-3 py-1">
                  {s.name} · {result.items.filter((i) => s.itemIds.includes(i.id)).length} objets
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
                conditionsMet(item.conditions, { level: result.level, totals: result.totals });
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
            Le stuff retenu fait le plus de dégâts possible sur les sorts choisis (un lancer
            chacun), en respectant toutes les exigences et les conditions des objets, bonus de
            panoplie compris. Les points de caractéristique sont répartis par l&apos;optimiseur. «
            Optimum prouvé » : un solveur d&apos;optimisation a vérifié qu&apos;aucun autre stuff ne
            fait plus, parmi {result.proof.considered.toLocaleString("fr-FR")} objets du niveau.
          </p>
        </section>
      )}
    </div>
  );
}

/** Valeur obtenue, avec l'exigence minimale si le joueur en a fixé une. */
function Requirement({
  stat,
  label,
  value,
  min,
}: {
  stat: Parameters<typeof StatIcon>[0]["stat"];
  label: string;
  value: number;
  min?: number;
}) {
  const met = min === undefined || value >= min;
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1",
        min !== undefined && (met ? "border-primary/40 bg-primary/5" : "border-destructive/50"),
        min === undefined && "bg-card/70",
      )}
    >
      <StatIcon stat={stat} className="size-3.5" />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
      {min !== undefined && (
        <span className={cn("text-xs", met ? "text-primary" : "text-destructive")}>
          (min. {min})
        </span>
      )}
    </li>
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
    text = p.damage
      ? `Preuve d'optimalité en cours : meilleur stuff ${Math.round(p.damage).toLocaleString("fr-FR")} dégâts${gap}`
      : "Recherche d'un stuff qui remplit les exigences…";
  }
  return (
    <p className="pb-2 text-sm text-muted-foreground" aria-live="polite">
      {text}
      {job && job.elapsedMs > 0 && <> · {Math.round(job.elapsedMs / 1000)} s</>}
    </p>
  );
}
