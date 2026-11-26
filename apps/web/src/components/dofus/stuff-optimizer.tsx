"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Gem,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Swords,
  UserRound,
  type LucideIcon,
  CircleOff,
  Crosshair,
  Hand,
  Percent,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
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
  STAT_CAPS,
  clampLevel,
  hasPickedLines,
  optimizerGrade,
  spellGradeAt,
  type DofusBreed,
  type DofusElement,
  type DofusSpell,
  type ExoStat,
  type Exos,
  type OptimizerCritMode,
  type OptimizerSituation,
  type PickableElement,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";
import { DEFAULT_ITEM_RULES, OptimizerItems, type ItemRules } from "./optimizer-items";
import { OptimizerBoard, type BoardStuff, type Minimums } from "./optimizer-board";
import { Segmented } from "./segmented";
import { STUFF_STORAGE_KEY } from "./storage";
import { RemoteIcon, useBreeds } from "./tags";
import { ProofChart, type JobTrace } from "./optimizer-progress";
import { TargetCard, targetResistances, type ChosenTarget } from "./optimizer-target";

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
  cellsFrom: number;
}

interface OptimizeResponse extends BoardStuff {
  breed: DofusBreed;
  level: number;
  ap: number;
  exos: Exos;
  critical: boolean;
  critMode?: OptimizerCritMode;
  attack: "ranged" | "melee";
  scrolls: number;
  minimums: Minimums;
  /** Meilleurs stuffs trouvés : le premier est le stuff ci-dessus. */
  stuffs?: BoardStuff[];
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

/** Bloc d'une partie des conditions : cadre façon interface du jeu, titre et icône. */
function Block({
  title,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  icon: LucideIcon;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="frame-dofus bg-card/70 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-gold" aria-hidden="true" />
        {title}
        {aside && <span className="ml-auto font-normal">{aside}</span>}
      </h3>
      {children}
    </section>
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
  // Popup des conditions : ouvert à l'arrivée, partie affichée.
  const [wizardOpen, setWizardOpen] = React.useState(true);
  const [step, setStep] = React.useState(0);
  // Minimums de % résistance : repliés tant qu'on n'en a pas besoin.
  const [showRes, setShowRes] = React.useState(false);
  const [ap, setAp] = React.useState<number>(STAT_CAPS.ap);
  const [exos, setExos] = React.useState<Exos>({ ap: false, mp: false, range: false });
  const [critical, setCritical] = React.useState<OptimizerCritMode>("weighted");
  const [attack, setAttack] = React.useState<"ranged" | "melee">("ranged");
  // Parchemins : 100 partout (oui) ou aucun.
  const [scrolled, setScrolled] = React.useState(true);
  // Cible des sorts : un monstre du jeu, ou null pour un Poutch sans résistance.
  const [target, setTarget] = React.useState<ChosenTarget | null>(null);
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
  // Stuff affiché sur le plateau (0 : le meilleur).
  const [shown, setShown] = React.useState(0);
  // Déroulé du dernier calcul (explication) : sorts lancés et cellules reçues.

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

  /** Exigences saisies (vides : pas d'exigence). */
  function currentMinimums(): Minimums {
    return {
      hp: numberOrUndefined(hp),
      mp: numberOrUndefined(mp),
      range: numberOrUndefined(po),
      resistances: Object.fromEntries(
        RESISTANCES.map((e) => [e, numberOrUndefined(res[e])]).filter(([, v]) => v !== undefined),
      ),
    };
  }
  const chosenSpells = (damageSpells ?? []).filter((s) => selected.has(s.id));
  // Éléments des sorts choisis : leurs caractéristiques sont résumées sur le plateau.
  const boardElements = [
    ...new Set(chosenSpells.flatMap((sp) => gradeOf(sp)?.lines.map((l) => l.element) ?? [])),
  ];

  async function run() {
    if (breedId === null || spellIds.length === 0) return;
    setRunning(true);
    setError(null);
    setJob(null);
    setResult(null);
    setShown(0);
    const minimums = currentMinimums();
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
          critical,
          attack,
          scrolls: scrolled ? SCROLL_MAX : 0,
          minimums,
          pickElements: Object.fromEntries(
            chosenSpells.filter(pickedAt).map((s) => [s.id, pickElements[s.id] ?? "earth"]),
          ),
          excludedCategories: itemRules.excluded,
          legendaryItems: itemRules.legendaryItems,
          forcedItems: Object.values(itemRules.forced).map((i) => i.id),
          bannedItems: itemRules.banned.map((i) => i.id),
          situation,
          target: targetResistances(target),
        },
      });
      setJob(current);
      // Suivi du calcul (sans le détail des cellules : seule la courbe est affichée).
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = (
          await apiFetch<{ job: JobView }>(
            `/dofus/optimize/${current.id}?since=${Number.MAX_SAFE_INTEGER}`,
          )
        ).job;
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

  function openInSimulator(index: number) {
    if (!result) return;
    const stuff = result.stuffs?.[index] ?? result;
    try {
      localStorage.setItem(
        STUFF_STORAGE_KEY,
        JSON.stringify({
          name: `${result.breed.name} ${result.level} (optimiseur${index > 0 ? ` n° ${index + 1}` : ""})`.slice(
            0,
            40,
          ),
          level: result.level,
          slots: stuff.slots,
          base: stuff.points,
          scrolls: Object.fromEntries(CHARACTERISTICS.map((c) => [c, result.scrolls])),
          breedId: result.breed.id,
          exos: result.exos,
          specials: stuff.specials,
          tags: { elements: [], classes: [result.breed.id] },
        }),
      );
    } catch {
      // Stockage indisponible : le simulateur s'ouvrira simplement vide.
    }
    router.push("/dofus/simulateur");
  }

  const breed = breeds?.find((b) => b.id === breedId) ?? null;
  // Conditions de l'optimiseur, posées une partie après l'autre dans un popup.
  const excludedCount = itemRules.excluded.length + (itemRules.legendaryItems ? 0 : 1);
  const CRIT_SHORT: Record<OptimizerCritMode, string> = {
    always: "100 % crit.",
    weighted: "crit. pondérés",
    never: "sans crit.",
  };
  const combatValue = situation.fight === "long" ? "long" : situation.turn;
  const wizardSteps: {
    title: string;
    short: string;
    recap: string;
    ready: boolean;
    body: React.ReactNode;
  }[] = [
    {
      title: "Classe et niveau",
      short: "Classe",
      recap: breedId !== null ? `${breed?.name ?? "Classe"} · niv. ${level}` : "À choisir",
      ready: breedId !== null,
      body: (
        <>
          <Block title="Classe" icon={UserRound}>
            {breedsError ? (
              <p className="text-sm text-destructive">{breedsError}</p>
            ) : !breeds ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Chargement des classes…
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-10 ">
                {breeds.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => chooseBreed(b.id)}
                    aria-pressed={b.id === breedId}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[0.7rem] transition-colors hover:bg-accent",
                      b.id === breedId
                        ? "frame-dofus-active border-gold/70 bg-gold-soft font-semibold text-gold"
                        : "bg-card/60",
                    )}
                  >
                    <RemoteIcon src={b.icon} className="size-9" />
                    <span className="w-full truncate text-center">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </Block>
          <Block title="Niveau" icon={Star}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={LEVEL_MAX}
              value={level}
              onChange={(e) => setLevel(clampLevel(Number(e.target.value)))}
              className={cn("w-24 tabular-nums", NO_SPIN)}
            />
          </Block>
        </>
      ),
    },
    {
      title: "Sorts visés",
      short: "Sorts",
      recap:
        spellIds.length > 0
          ? `${spellIds.length} sort${spellIds.length > 1 ? "s" : ""} · ${selectedAp} PA`
          : "À choisir",
      ready: spellIds.length > 0,
      body: (
        <Block
          title="Sorts à évaluer"
          icon={Swords}
          aside={
            spellIds.length > 0
              ? `${spellIds.length} choisi${spellIds.length > 1 ? "s" : ""} · ${selectedAp} PA`
              : undefined
          }
        >
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
        </Block>
      ),
    },
    {
      title: "Contraintes du stuff",
      short: "Contraintes",
      recap: `${ap} PA · ${CRIT_SHORT[critical]}`,
      ready: true,
      body: (
        <>
          <Block title="Points d'action" icon={Star}>
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
          </Block>
          <Block title="Minimums" icon={ShieldCheck} aside="facultatif">
            <div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
              <NumberField
                label="PV"
                value={hp}
                onChange={setHp}
                placeholder="4000"
                icon={<StatIcon stat="vitality" className="size-4" />}
                className="w-full"
              />
              <NumberField
                label="PM"
                value={mp}
                onChange={setMp}
                placeholder="5"
                icon={<StatIcon stat="mp" className="size-4" />}
                className="w-full"
              />
              <NumberField
                label="PO"
                value={po}
                onChange={setPo}
                placeholder="6"
                icon={<StatIcon stat="range" className="size-4" />}
                className="w-full"
              />
              <Button
                variant="outline"
                className="border-dashed"
                aria-expanded={showRes}
                onClick={() => setShowRes((v) => !v)}
              >
                {showRes ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}% Rés.
              </Button>
            </div>
            {showRes && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {RESISTANCES.map((e) => (
                  <NumberField
                    key={e}
                    label={`% Ré ${ELEMENTS[e].label}`}
                    value={res[e]}
                    onChange={(v) => setRes((r) => ({ ...r, [e]: v }))}
                    placeholder="30"
                    icon={<StatIcon stat={RESISTANCE_STATS[e]} className="size-4" />}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </Block>
          <Block title="Combat" icon={Swords}>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Segmented
                label="Critiques"
                value={critical}
                onChange={setCritical}
                options={[
                  {
                    value: "always",
                    label: "100 %",
                    icon: <Target className="size-3.5" aria-hidden="true" />,
                    help: "Toujours critique, sans aléatoire",
                  },
                  {
                    value: "weighted",
                    label: "Pondérés",
                    icon: <Percent className="size-3.5" aria-hidden="true" />,
                    help: "Selon la chance de critique",
                  },
                  {
                    value: "never",
                    label: "Sans critique",
                    icon: <CircleOff className="size-3.5" aria-hidden="true" />,
                    help: "Focus sur les dommages de l'élément",
                  },
                ]}
              />
              <Segmented
                label="Attaque"
                value={attack}
                onChange={setAttack}
                options={[
                  {
                    value: "ranged",
                    label: "Distance",
                    icon: <Crosshair className="size-3.5" aria-hidden="true" />,
                  },
                  {
                    value: "melee",
                    label: "Mêlée",
                    icon: <Hand className="size-3.5" aria-hidden="true" />,
                  },
                ]}
              />
              <Segmented
                label="Parchemins 100"
                value={scrolled ? "yes" : "no"}
                onChange={(v) => setScrolled(v === "yes")}
                options={[
                  { value: "yes", label: "Oui", help: "100 dans chaque caractéristique" },
                  { value: "no", label: "Non", help: "Aucun parchemin" },
                ]}
              />
              <Segmented
                label="Combat"
                value={combatValue}
                onChange={(v) =>
                  setSituation(
                    v === "long" ? { ...situation, fight: "long" } : { fight: "short", turn: v },
                  )
                }
                options={[
                  {
                    value: "odd",
                    label: "Court · T1",
                    help: "Tour 1 : Nébuleux +20 %, Surpryz +100 %",
                  },
                  { value: "even", label: "T2", help: "Tour 2 : Nébuleux −10 %, Surpryz +35 %" },
                  { value: "average", label: "Moy.", help: "Moitié du tour 1, moitié du tour 2" },
                  { value: "long", label: "Long", help: "Combat long : cumuls au maximum" },
                ]}
              />
            </div>
          </Block>
        </>
      ),
    },
    {
      title: "Objets autorisés",
      short: "Objets",
      recap:
        excludedCount > 0
          ? `${excludedCount} catégorie${excludedCount > 1 ? "s" : ""} écartée${excludedCount > 1 ? "s" : ""}`
          : "Tout autorisé",
      ready: true,
      body: (
        <Block title="Catégories d'objets" icon={Gem}>
          <OptimizerItems value={itemRules} onChange={setItemRules} />
        </Block>
      ),
    },
  ];
  const canRun = breedId !== null && spellIds.length > 0 && !running;
  const CRIT_LABELS: Record<OptimizerCritMode, string> = {
    always: "100 % critique",
    weighted: "critiques pondérés",
    never: "sans critique",
  };
  const current = wizardSteps[step]!;
  const last = step === wizardSteps.length - 1;

  return (
    <div className="space-y-6">
      {/* Conditions : popup en plusieurs parties, ouvert à l'arrivée sur la page. */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent
          className="frame-dofus max-w-5xl gap-0 overflow-hidden rounded-xl p-0"
          // Pas de focus automatique sur la première partie : pas d'anneau de focus parasite.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="grid max-h-[calc(100svh-2rem)] md:grid-cols-[13rem_minmax(0,1fr)]">
            {/* Sommaire : les parties et ce qui a été choisi. */}
            <nav
              aria-label="Parties"
              className="border-b border-gold/25 bg-muted/40 p-3 md:border-r md:border-b-0"
            >
              <p className="mb-2 px-1 font-display text-sm tracking-wide text-gold">Conditions</p>
              <ol className="flex gap-1 overflow-x-auto md:grid md:overflow-visible">
                {wizardSteps.map((w, i) => {
                  const done = i < step && w.ready;
                  const locked = wizardSteps.slice(0, i).some((x) => !x.ready);
                  return (
                    <li key={w.title} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setStep(i)}
                        disabled={locked}
                        aria-current={i === step ? "step" : undefined}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                          i === step && "frame-dofus-active bg-card",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold",
                            done
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : i === step
                                ? "border-gold bg-gold-soft text-gold"
                                : "text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span
                            className={cn(
                              "block text-sm",
                              i === step ? "font-semibold" : !done && "text-muted-foreground",
                            )}
                          >
                            {w.short}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {i === step ? "En cours" : w.recap}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
              <div className="flex items-baseline gap-3 pr-8">
                <DialogTitle className="font-display text-lg tracking-wide">
                  {current.title}
                </DialogTitle>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  Partie {step + 1} sur {wizardSteps.length}
                </span>
              </div>
              <DialogDescription className="sr-only">
                Choisissez votre classe, vos sorts, les contraintes du stuff et les objets
                autorisés.
              </DialogDescription>
              <div className="-mx-1 grid min-h-0 gap-3 overflow-y-auto px-1 md:max-h-[58svh]">
                {current.body}
              </div>
              <div className="flex items-center gap-2 border-t border-gold/20 pt-3">
                <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
                  <ChevronLeft aria-hidden="true" />
                  Précédent
                </Button>
                <div
                  className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Avancement"
                  aria-valuemin={1}
                  aria-valuemax={wizardSteps.length}
                  aria-valuenow={step + 1}
                >
                  <div
                    className="h-full rounded-full bg-gold transition-[width]"
                    style={{ width: `${((step + 1) / wizardSteps.length) * 100}%` }}
                  />
                </div>
                {!current.ready && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {step === 0 ? "Choisissez une classe." : "Choisissez au moins un sort."}
                  </span>
                )}
                {/* Les parties suivantes ont des valeurs par défaut : on peut lancer dès que possible. */}
                {!last && canRun && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWizardOpen(false);
                      void run();
                    }}
                  >
                    <WandSparkles aria-hidden="true" />
                    Lancer
                  </Button>
                )}
                {last ? (
                  <Button
                    disabled={!canRun}
                    onClick={() => {
                      setWizardOpen(false);
                      void run();
                    }}
                  >
                    <WandSparkles aria-hidden="true" />
                    Lancer l&apos;optimisation
                  </Button>
                ) : (
                  <Button disabled={!current.ready} onClick={() => setStep(step + 1)}>
                    Suivant
                    <ChevronRight aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OptimizerBoard
        settings={{
          level,
          breed: breeds?.find((b) => b.id === breedId) ?? null,
          ap,
          attack,
          critMode: critical,
          elements: boardElements,
          minimums: currentMinimums(),
          spells: chosenSpells.map((sp) => ({
            id: sp.id,
            name: sp.name,
            icon: sp.icon,
            apCost: spellGradeAt(sp, level)?.apCost ?? 0,
          })),
        }}
        controls={
          // Réglages et relance du calcul (un tiers), courbe du calcul (deux tiers), puis la cible.
          <>
            <div className="grid gap-4 @min-[30rem]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <section className="grid content-start gap-2.5 rounded-xl border bg-card/70 p-3">
                <div className="flex items-center gap-2">
                  {breed ? (
                    <RemoteIcon src={breed.icon} className="size-9 shrink-0" />
                  ) : (
                    <span className="size-9 shrink-0 rounded-md bg-muted" aria-hidden="true" />
                  )}
                  <p className="min-w-0 text-sm leading-tight font-medium">
                    {breed ? (
                      <>
                        {breed.name}
                        <span className="block text-xs font-normal text-muted-foreground">
                          niveau {level}
                        </span>
                      </>
                    ) : (
                      "Aucune classe"
                    )}
                  </p>
                </div>
                <p className="text-xs leading-snug text-muted-foreground">
                  {spellIds.length} sort{spellIds.length > 1 ? "s" : ""} · {ap} PA ·{" "}
                  {CRIT_LABELS[critical]} · {attack === "melee" ? "mêlée" : "distance"} · combat{" "}
                  {situation.fight === "long" ? "long" : "court"}
                </p>
                <Button disabled={!canRun} onClick={() => void run()}>
                  {running ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <WandSparkles aria-hidden="true" />
                  )}
                  {running ? "Calcul…" : "Optimiser"}
                </Button>
                <Button
                  variant="outline"
                  title="Modifier les conditions"
                  onClick={() => {
                    setStep(0);
                    setWizardOpen(true);
                  }}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  Conditions
                </Button>
              </section>
              <section
                aria-label="Courbe du calcul"
                className="grid content-start gap-2 rounded-xl border bg-card/70 p-3"
              >
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {running ? (
                    <JobProgress job={job} />
                  ) : result ? (
                    result.proof.proven ? (
                      <>Optimum prouvé en {(result.proof.ms / 1000).toFixed(1)} s.</>
                    ) : (
                      <>
                        Arrêt au bout de {Math.round(result.proof.ms / 1000)} s : au plus{" "}
                        {Math.max(
                          0,
                          Math.ceil(
                            ((result.proof.upper - result.proof.damage) / result.proof.damage) *
                              100,
                          ),
                        )}{" "}
                        % de mieux possible.
                      </>
                    )
                  ) : (
                    "Lancez l'optimisation : la courbe du calcul s'affichera ici."
                  )}
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {job && <ProofChart history={job.trace.history} />}
              </section>
            </div>
            <TargetCard value={target} onChange={setTarget} />
          </>
        }
        rules={itemRules}
        onRules={setItemRules}
        stuffs={result ? (result.stuffs ?? [result]) : null}
        selected={shown}
        onSelect={setShown}
        proof={result?.proof ?? null}
        running={running}
        onOpenInSimulator={openInSimulator}
      />
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
    text = p.damage
      ? `Preuve d'optimalité en cours : meilleur stuff ${Math.round(p.damage).toLocaleString("fr-FR")} dégâts${gap}`
      : "Recherche d'un stuff qui remplit les exigences…";
  }
  return (
    <span>
      {text}
      {job && job.elapsedMs > 0 && <> · {Math.round(job.elapsedMs / 1000)} s</>}
    </span>
  );
}
