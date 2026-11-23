"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Hammer,
  Copy,
  LogIn,
  Save,
  Dumbbell,
  Heart,
  Layers,
  RotateCcw,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  type LucideIcon,
  Gem,
} from "lucide-react";
import {
  CHARACTERISTICS,
  EXO_STATS,
  STAT_CAPS,
  LEVEL_MAX,
  SCROLL_MAX,
  SLOTS,
  STATS,
  clampLevel,
  computeCharacter,
  conditionsMet,
  conditionsText,
  placeItems,
  type Characteristic,
  type DofusBuild,
  type DofusBuildData,
  type DofusBuildSummary,
  type DofusItem,
  type DofusSet,
  type ExoStat,
  type ForgemagicLine,
  type BuildTags,
  type Exos,
  type SlotId,
  type StatKey,
  canBeLegendary,
  legendaryBuffs,
  legendaryPower,
  specialBuffs,
  specialEffectOf,
  type SpecialChoices,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ItemIcon, ItemPicker } from "./item-picker";
import { DamageCalculator } from "./damage-calculator";
import { Forgemagic } from "./forgemagic";
import { SavedBuildsDialog } from "./saved-builds";
import { BuildTagsEditor } from "./tags";
import { SetPicker } from "./set-picker";
import { STUFF_STORAGE_KEY } from "./storage";
import { LegendaryPowerDialog, SpecialEffectDialog, SpecialEffectsPanel } from "./special-effects";
import { EffectRow, StatIcon, statTone } from "./stat-icon";

// ─── Stuff enregistré dans le navigateur ───────────────────────────────────

interface Stuff {
  /** Identifiant du stuff enregistré sur le compte, s'il l'a été. */
  buildId?: string;
  name: string;
  level: number;
  base: Record<Characteristic, number>;
  scrolls: Record<Characteristic, number>;
  slots: Partial<Record<SlotId, number>>;
  notes: string;
  /** Image du personnage (data URL réduite), ou null. */
  image: string | null;
  /** Classe choisie pour le calcul des dégâts. */
  breedId: number | null;
  /** Exos de forgemagie PA, PM, PO. */
  exos: Exos;
  /** Caractéristiques ajoutées librement par forgemagie. */
  forgemagic: ForgemagicLine[];
  /** Tags (éléments, classes) pour retrouver le stuff. */
  tags: BuildTags;
  /** Effets spéciaux des Dofus : situation choisie pour chacun. */
  specials: SpecialChoices;
  /** Pouvoir légendaire du familier ou montilier (clé), ou null. */
  legendary: string | null;
}

const STORAGE_KEY = STUFF_STORAGE_KEY;
const zeros = () =>
  Object.fromEntries(CHARACTERISTICS.map((c) => [c, 0])) as Record<Characteristic, number>;
const newStuff = (): Stuff => ({
  name: "Mon personnage",
  level: LEVEL_MAX,
  base: zeros(),
  scrolls: zeros(),
  slots: {},
  notes: "",
  image: null,
  breedId: null,
  exos: { ap: false, mp: false, range: false },
  forgemagic: [],
  tags: { elements: [], classes: [] },
  specials: {},
  legendary: null,
});

/** Additionne des bonus de combat. */
function mergeBuffs(...all: Partial<Record<StatKey, number>>[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const buffs of all) {
    for (const [k, v] of Object.entries(buffs) as [StatKey, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Contenu envoyé à l'API pour enregistrer le stuff. */
function toBuildData(stuff: Stuff): DofusBuildData {
  return {
    name: stuff.name.trim() || "Sans nom",
    level: clampLevel(stuff.level),
    base: stuff.base,
    scrolls: stuff.scrolls,
    slots: stuff.slots,
    notes: stuff.notes,
    image: stuff.image,
    breedId: stuff.breedId,
    exos: stuff.exos,
    forgemagic: stuff.forgemagic,
    tags: stuff.tags,
    specials: stuff.specials,
    legendary: stuff.legendary,
  };
}

function loadStuff(): Stuff {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...newStuff(), ...(JSON.parse(raw) as Partial<Stuff>) };
  } catch {
    // Stockage indisponible ou contenu illisible : on repart d'un stuff vide.
  }
  return newStuff();
}

// ─── Présentation des caractéristiques ─────────────────────────────────────

const SUMMARY: StatKey[] = ["initiative", "critical", "summons", "prospecting"];
/** Caractéristiques élémentaires : affichées avec la Puissance incluse. */
const ELEMENTAL: StatKey[] = ["strength", "intelligence", "chance", "agility"];
const SECONDARY: StatKey[] = [
  "dodge",
  "lock",
  "apParry",
  "apReduction",
  "mpParry",
  "mpReduction",
  "pods",
  "heals",
];
/** Dommages fixes et élémentaires, puis les autres (critiques, poussée, %). */
const DAMAGE_FIXED: StatKey[] = [
  "damage",
  "neutralDamage",
  "earthDamage",
  "fireDamage",
  "waterDamage",
  "airDamage",
];
const DAMAGE_OTHER: StatKey[] = [
  "criticalDamage",
  "pushbackDamage",
  "weaponDamagePct",
  "spellDamagePct",
  "meleeDamagePct",
  "rangedDamagePct",
  "finalDamagePct",
];
/** Résistances fixes, puis résistances en %. */
const RESISTANCE_FIXED: StatKey[] = [
  "neutralRes",
  "earthRes",
  "fireRes",
  "waterRes",
  "airRes",
  "criticalRes",
  "pushbackRes",
];
const RESISTANCE_PCT: StatKey[] = [
  "neutralResPct",
  "earthResPct",
  "fireResPct",
  "waterResPct",
  "airResPct",
  "meleeResPct",
  "rangedResPct",
  "weaponResPct",
  "spellResPct",
];

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card/70 p-4", className)}>
      <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
        {Icon && <Icon className="size-4 text-gold" aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatGrid({
  keys,
  totals,
  plus,
}: {
  keys: StatKey[];
  totals: Record<StatKey, number>;
  /** Valeur ajoutée à l'affichage de certaines lignes (ex. Dommages dans chaque Do élémentaire). */
  plus?: { stat: StatKey; to: readonly StatKey[] };
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[0.82rem]">
      {keys.map((k) => {
        const added = plus && plus.to.includes(k) ? totals[plus.stat] : 0;
        const value = totals[k] + added;
        return (
          <div
            key={k}
            title={
              added
                ? `${STATS[k]} : ${value} (${totals[k]} + ${added} ${STATS[plus!.stat]})`
                : `${STATS[k]} : ${value}`
            }
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1",
              value !== 0 && "bg-muted/50",
            )}
          >
            <StatIcon stat={k} />
            <dd
              className={cn(
                "min-w-7 shrink-0 text-right font-semibold tabular-nums",
                value < 0 && "text-destructive",
                value === 0 && "text-muted-foreground",
              )}
            >
              {value}
            </dd>
            <dt className={cn("truncate", value === 0 && "text-muted-foreground")}>{STATS[k]}</dt>
          </div>
        );
      })}
    </dl>
  );
}

/** Dommages élémentaires : affichés avec les Dommages (qui s'appliquent à tous les éléments). */
const ELEMENT_DAMAGE: StatKey[] = [
  "neutralDamage",
  "earthDamage",
  "fireDamage",
  "waterDamage",
  "airDamage",
];

/** Champ numérique sans les flèches d'incrément du navigateur. */
const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function NumberCell({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  label: string;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) =>
        onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value)) || 0)))
      }
      className={cn("h-7 w-14 px-2 text-right tabular-nums", NO_SPIN)}
    />
  );
}

// ─── Simulateur ────────────────────────────────────────────────────────────

export function StuffSimulator({
  loggedIn,
  initialBuildId,
}: {
  loggedIn: boolean;
  /** Stuff enregistré à ouvrir (lien depuis le profil). */
  initialBuildId?: string;
}) {
  const [stuff, setStuff] = React.useState<Stuff>(loadStuff);
  // Dernier contenu enregistré, pour signaler les modifications non sauvegardées.
  const [savedJson, setSavedJson] = React.useState<string | null>(() => {
    const initial = loadStuff();
    return initial.buildId ? JSON.stringify(toBuildData(initial)) : null;
  });
  const [saveState, setSaveState] = React.useState<{
    status: "idle" | "saving" | "saved" | "error";
    message?: string;
  }>({ status: "idle" });
  const [items, setItems] = React.useState<Record<number, DofusItem>>({});
  const [sets, setSets] = React.useState<Record<number, DofusSet>>({});
  const [loadError, setLoadError] = React.useState(false);
  const [picking, setPicking] = React.useState<SlotId | null>(null);
  /** Effet spécial dont le choix est ouvert (clé de l'effet). */
  const [asking, setAsking] = React.useState<string | null>(null);
  /** Choix du pouvoir légendaire ouvert. */
  const [pickingLegend, setPickingLegend] = React.useState(false);
  const requested = React.useRef(new Set<string>());

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stuff));
    } catch {
      // Navigation privée ou stockage plein : le stuff n'est simplement pas conservé.
    }
  }, [stuff]);

  const update = (patch: Partial<Stuff>) => setStuff((s) => ({ ...s, ...patch }));
  const toggleExo = (k: ExoStat) =>
    setStuff((s) => ({ ...s, exos: { ...s.exos, [k]: !s.exos[k] } }));

  /** Remplace le stuff affiché par un stuff enregistré. */
  const openBuild = React.useCallback((build: DofusBuild) => {
    const next: Stuff = { ...newStuff(), ...build.data, buildId: build.id };
    setStuff(next);
    setSavedJson(JSON.stringify(toBuildData(next)));
    setSaveState({ status: "idle" });
  }, []);

  // Ouverture depuis le profil : /dofus/simulateur?stuff=<id>
  React.useEffect(() => {
    if (!loggedIn || !initialBuildId) return;
    apiFetch<{ build: DofusBuild }>(`/dofus/builds/${initialBuildId}`)
      .then(({ build }) => openBuild(build))
      .catch(() =>
        setSaveState({ status: "error", message: "Ce stuff enregistré est introuvable." }),
      );
  }, [loggedIn, initialBuildId, openBuild]);

  const currentJson = JSON.stringify(toBuildData(stuff));
  const unsaved = stuff.buildId !== undefined && savedJson !== currentJson;

  async function save(asCopy = false) {
    setSaveState({ status: "saving" });
    const data = toBuildData(stuff);
    try {
      const existing = stuff.buildId && !asCopy;
      const { build } = await apiFetch<{ build: DofusBuildSummary }>(
        existing ? `/dofus/builds/${stuff.buildId}` : "/dofus/builds",
        {
          method: existing ? "PUT" : "POST",
          body: asCopy
            ? { ...data, name: `${data.name.replace(/( \(copie\))+$/, "")} (copie)`.slice(0, 40) }
            : data,
        },
      );
      const next = { ...stuff, buildId: build.id, name: build.name };
      setStuff(next);
      setSavedJson(JSON.stringify(toBuildData(next)));
      setSaveState({ status: "saved", message: "Stuff enregistré sur votre profil." });
    } catch (e) {
      setSaveState({
        status: "error",
        message: e instanceof ApiError ? e.message : "L'enregistrement a échoué.",
      });
    }
  }

  // Charge les objets équipés (au retour sur la page) et leurs panoplies.
  const equippedIds = Object.values(stuff.slots).filter((id): id is number => id !== undefined);
  const setIds = [
    ...new Set(equippedIds.map((id) => items[id]?.set?.id).filter((id): id is number => !!id)),
  ];
  const wantedKey = [...equippedIds.map((id) => `i${id}`), ...setIds.map((id) => `s${id}`)].join(
    ",",
  );

  React.useEffect(() => {
    for (const key of wantedKey.split(",").filter(Boolean)) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const id = Number(key.slice(1));
      if (key.startsWith("i")) {
        apiFetch<{ item: DofusItem }>(`/dofus/items/${id}`)
          .then(({ item }) => setItems((m) => ({ ...m, [id]: item })))
          .catch(() => {
            requested.current.delete(key);
            setLoadError(true);
          });
      } else {
        apiFetch<{ set: DofusSet }>(`/dofus/sets/${id}`)
          .then(({ set }) => setSets((m) => ({ ...m, [id]: set })))
          .catch(() => requested.current.delete(key));
      }
    }
  }, [wantedKey]);

  const level = clampLevel(stuff.level);
  const equipped = SLOTS.flatMap((slot) => {
    const id = stuff.slots[slot.id];
    const item = id !== undefined ? items[id] : undefined;
    return item ? [{ slot, item }] : [];
  });
  // Pouvoir légendaire : seulement si un familier ou montilier est équipé.
  const petItem = equipped.find((e) => e.slot.id === "pet")?.item ?? null;
  const legendPower = petItem && canBeLegendary(petItem) ? legendaryPower(stuff.legendary) : null;
  const legend = petItem && legendPower ? { item: petItem, power: legendPower } : null;
  const result = computeCharacter({
    level,
    base: stuff.base,
    scrolls: stuff.scrolls,
    items: equipped.map((e) => e.item),
    sets: setIds.map((id) => sets[id]).filter((s): s is DofusSet => !!s),
    exos: stuff.exos,
    forgemagic: stuff.forgemagic,
    buffs: mergeBuffs(
      specialBuffs(
        equipped.map((e) => e.item),
        stuff.specials,
      ),
      legend ? legendaryBuffs(legend.power.key, stuff.specials) : {},
    ),
  });
  const { totals } = result;

  // Effets spéciaux des objets équipés (un par effet, même si l'objet est en double).
  const specialEntries = [
    ...new Map(
      equipped.flatMap(({ item }) => {
        const effect = specialEffectOf(item);
        return effect ? [[effect.key, { item, effect }] as const] : [];
      }),
    ).values(),
  ];
  const effectEntries = [
    ...specialEntries,
    ...(legend ? [{ item: legend.item, effect: legend.power }] : []),
  ];
  const askingEntry = effectEntries.find((e) => e.effect.key === asking) ?? null;

  // Panoplies représentées dans l'équipement, actives (2 objets ou plus) ou non.
  const setGroups = setIds.flatMap((id) => {
    const set = sets[id];
    if (!set) return [];
    const setItems = [
      ...new Map(
        equipped.filter((e) => e.item.set?.id === id).map((e) => [e.item.id, e.item]),
      ).values(),
    ];
    const active = result.activeSets.find((a) => a.set.id === id) ?? null;
    return [{ set, items: setItems, active }];
  });
  const activeGroups = setGroups.filter((g) => g.active);

  // Alertes : niveau, conditions, objets en double.
  const warnings: string[] = [];
  for (const { item } of equipped) {
    if (item.level > level) warnings.push(`${item.name} demande le niveau ${item.level}.`);
    if (!conditionsMet(item.conditions, { level, totals })) {
      warnings.push(`${item.name} : conditions non remplies (${conditionsText(item.conditions)}).`);
    }
  }
  // Une seule Prysmaradite par stuff : toutes celles équipées passent en rouge.
  const prysmas = equipped.filter(({ item }) => /prysmaradite/i.test(item.type));
  const prysmaConflict = new Set(prysmas.length > 1 ? prysmas.map((e) => e.slot.id) : []);
  if (prysmas.length > 1) {
    warnings.push(
      `Une seule Prysmaradite par stuff : ${prysmas.map((e) => e.item.name).join(" et ")}.`,
    );
  }
  const seen = new Set<number>();
  for (const { slot, item } of equipped) {
    if ((slot.family === "dofus" || slot.family === "ring") && seen.has(item.id)) {
      warnings.push(`${item.name} est équipé deux fois : ce n'est pas possible en jeu.`);
    }
    seen.add(item.id);
  }
  if (result.pointsLeft < 0) {
    warnings.push(
      `${-result.pointsLeft} points de caractéristique de trop pour le niveau ${level}.`,
    );
  }

  const pickingSlot = SLOTS.find((s) => s.id === picking) ?? null;
  const pickingItem = pickingSlot ? (items[stuff.slots[pickingSlot.id] ?? -1] ?? null) : null;

  const renderSlot = (slotId: SlotId, side: "left" | "right" | "top") => {
    const slot = SLOTS.find((s) => s.id === slotId)!;
    const id = stuff.slots[slotId];
    const item = id !== undefined ? (items[id] ?? null) : null;
    const loading = id !== undefined && !item;
    const tooLow = item ? item.level > level : false;
    const unmet = item ? !conditionsMet(item.conditions, { level, totals }) : false;
    const conflict = prysmaConflict.has(slotId);
    const button = (
      <button
        key={slotId}
        type="button"
        onClick={() => setPicking(slotId)}
        title={item ? undefined : slot.label}
        aria-label={item ? `${slot.label} : ${item.name}` : `${slot.label} : vide`}
        className={cn(
          "group relative flex aspect-square w-full items-center justify-center rounded-lg border bg-background/50 transition-colors hover:border-gold/60 hover:bg-accent",
          item && "border-gold/40 bg-card",
          (tooLow || unmet) && "border-destructive/70",
          conflict && "border-2 border-destructive bg-destructive/15",
        )}
      >
        {item ? (
          <ItemIcon item={item} className="size-[78%]" />
        ) : (
          <span className="px-1 text-center text-[0.7rem] leading-tight text-muted-foreground">
            {loading ? "…" : slot.label}
          </span>
        )}
      </button>
    );
    if (!item) return button;

    // Au survol (ou au focus clavier) : les statistiques de l'objet.
    const withTooltip = (
      <Tooltip key={slotId}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className="w-72 max-w-[calc(100vw-2rem)] border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="flex items-center gap-3">
            <ItemIcon item={item} className="size-11" />
            <div className="min-w-0">
              <p className="font-serif text-base leading-tight font-semibold">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.type} · niveau {item.level}
              </p>
              {item.set && <p className="text-xs text-gold">{item.set.name}</p>}
            </div>
          </div>
          <ul className="mt-2.5 grid gap-1 border-t pt-2.5 text-sm">
            {item.effects.map((e, i) => (
              <EffectRow key={i} effect={e} />
            ))}
          </ul>
          {item.conditions && (
            <p
              className={cn(
                "mt-2 border-t pt-2 text-xs",
                unmet ? "text-destructive" : "text-muted-foreground",
              )}
            >
              Conditions : {conditionsText(item.conditions)}
            </p>
          )}
          {tooLow && (
            <p className="mt-1 text-xs text-destructive">Demande le niveau {item.level}.</p>
          )}
          {conflict && (
            <p className="mt-1 text-xs text-destructive">
              Une seule Prysmaradite par stuff : retirez-en une.
            </p>
          )}
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            Cliquer pour changer ou retirer
          </p>
        </TooltipContent>
      </Tooltip>
    );
    if (slotId !== "pet" || !canBeLegendary(item)) return withTooltip;
    // Familier ou montilier : petit bouton rond pour choisir une légende animale.
    return (
      <div key={slotId} className="relative">
        {withTooltip}
        <button
          type="button"
          onClick={() => setPickingLegend(true)}
          aria-label={
            legend ? `Légende animale : ${legend.power.creature}` : "Ajouter une légende animale"
          }
          title={legend ? `Légende animale : ${legend.power.spell}` : "Ajouter une légende animale"}
          className={cn(
            "absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border text-[0.7rem] leading-none font-bold shadow-sm transition-colors",
            legend
              ? "border-gold bg-gold text-background"
              : "border-gold/60 bg-card text-gold hover:bg-gold-soft",
          )}
        >
          {legend ? "★" : "+"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* En-tête du stuff */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/70 p-4">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">
          Nom du stuff
          <Input
            value={stuff.name}
            maxLength={40}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Niveau
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={LEVEL_MAX}
            value={stuff.level}
            onChange={(e) => update({ level: clampLevel(Number(e.target.value)) })}
            className={cn("w-24 tabular-nums", NO_SPIN)}
          />
        </label>
        <div className="grid gap-1 text-sm font-medium">
          Tags
          <BuildTagsEditor tags={stuff.tags} onChange={(tags) => update({ tags })} />
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          Niveau du stuff : <strong className="text-foreground">{result.gearLevel || "—"}</strong>
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {loggedIn ? (
            <>
              <SavedBuildsDialog
                currentId={stuff.buildId}
                onOpen={openBuild}
                onDeleted={(id) => {
                  if (id !== stuff.buildId) return;
                  update({ buildId: undefined });
                  setSavedJson(null);
                }}
              />
              {stuff.buildId && (
                <Button
                  variant="outline"
                  disabled={saveState.status === "saving"}
                  onClick={() => void save(true)}
                >
                  <Copy aria-hidden="true" />
                  Copie
                </Button>
              )}
              <Button
                disabled={
                  saveState.status === "saving" || (stuff.buildId !== undefined && !unsaved)
                }
                onClick={() => void save()}
              >
                <Save aria-hidden="true" />
                {saveState.status === "saving"
                  ? "Enregistrement…"
                  : stuff.buildId && !unsaved
                    ? "Enregistré"
                    : "Enregistrer"}
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href="/connexion?redirect=/dofus/simulateur">
                <LogIn aria-hidden="true" />
                Se connecter pour enregistrer
              </Link>
            </Button>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <RotateCcw aria-hidden="true" />
                Nouveau
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <div>
                <DialogTitle>Repartir de zéro ?</DialogTitle>
                <DialogDescription className="mt-1">
                  Le simulateur repart d&apos;un stuff vide. Les stuffs déjà enregistrés sur votre
                  profil ne sont pas supprimés.
                </DialogDescription>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button variant="ghost">Annuler</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    onClick={() => {
                      setStuff(newStuff());
                      setSavedJson(null);
                      setSaveState({ status: "idle" });
                    }}
                  >
                    Effacer
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {(saveState.message || unsaved) && (
          <p
            role="status"
            className={cn(
              "w-full text-sm",
              saveState.status === "error"
                ? "text-destructive"
                : unsaved
                  ? "text-gold"
                  : "text-primary",
            )}
          >
            {saveState.status === "error" || !unsaved
              ? saveState.message
              : "Modifications non enregistrées."}
          </p>
        )}
      </div>

      {loadError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Certains objets n&apos;ont pas pu être chargés. Rechargez la page pour réessayer.
        </p>
      )}

      {/*
        Trois colonnes, puis quatre quand la zone est assez large : les effets
        spéciaux et la forgemagie passent alors à droite des dommages.
        Largeur mesurée sur la zone elle-même (requête de conteneur).
      */}
      <div className="@container">
        <div className="grid gap-4 @min-[64rem]:grid-cols-[18rem_minmax(0,1fr)_18rem] @min-[85rem]:grid-cols-[17rem_minmax(0,1fr)_34rem]">
          {/* Colonne gauche : caractéristiques */}
          <div className="order-2 space-y-4 @min-[64rem]:order-1">
            <Panel title="Résumé" icon={ScrollText}>
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-el-life/10 px-3 py-[5px]">
                <Heart className="size-7 fill-el-life text-el-life" aria-hidden="true" />
                <p className="leading-tight">
                  <span className="font-serif text-2xl font-bold tabular-nums">{result.hp}</span>
                  <span className="block text-xs text-muted-foreground">Points de vie</span>
                </p>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {EXO_STATS.map((k) => {
                  const exo = stuff.exos[k];
                  const atCap = !exo && totals[k] >= STAT_CAPS[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleExo(k)}
                      disabled={atCap}
                      aria-pressed={exo}
                      title={
                        exo
                          ? `Retirer l'exo ${STATS[k]}`
                          : atCap
                            ? `Maximum atteint (${STAT_CAPS[k]} ${STATS[k]})`
                            : `Ajouter un exo ${STATS[k]} (+1)`
                      }
                      className={cn(
                        "relative flex flex-col items-center rounded-lg border py-1.5 transition-colors",
                        exo
                          ? "border-gold bg-gold-soft text-gold shadow-[inset_0_0_0_1px_var(--gold)]"
                          : "bg-background/50 hover:border-gold/60 hover:bg-accent",
                        atCap && "cursor-not-allowed opacity-70",
                      )}
                    >
                      {exo && (
                        <span className="absolute top-0.5 right-1.5 text-[0.5rem] leading-none font-bold">
                          EXO
                        </span>
                      )}
                      {/* Icône et valeur sur une ligne, libellé dessous : deux lignes au lieu de trois. */}
                      <span className="flex items-center gap-1.5">
                        <StatIcon
                          stat={k}
                          className={cn(
                            "size-4",
                            k !== "range" && "fill-current",
                            exo && "text-gold",
                          )}
                        />
                        <span className="font-serif text-lg leading-none font-bold tabular-nums">
                          {totals[k]}
                        </span>
                      </span>
                      <span className={cn("text-xs", exo ? "text-gold" : "text-muted-foreground")}>
                        {STATS[k]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <StatGrid keys={SUMMARY} totals={totals} />
            </Panel>

            <Panel title="Caractéristiques" icon={Dumbbell}>
              <p
                className={cn(
                  "mb-3 text-sm",
                  result.pointsLeft < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Points restants :{" "}
                <strong className={result.pointsLeft >= 0 ? "text-primary" : undefined}>
                  {result.pointsLeft}
                </strong>
              </p>
              <table className="w-full table-fixed text-[0.82rem]">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="w-10 pb-1 text-left font-normal">Total</th>
                    <th className="pb-1 text-left font-normal" />
                    <th className="w-[3.75rem] pb-1 text-left font-normal">Base</th>
                    <th className="w-14 pb-1 text-left font-normal">Parcho</th>
                  </tr>
                </thead>
                <tbody>
                  {CHARACTERISTICS.map((c) => (
                    <tr key={c}>
                      <td className={cn("py-px pr-2 font-semibold tabular-nums", statTone(c))}>
                        {ELEMENTAL.includes(c) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                className="cursor-help border-b border-dotted border-current outline-none"
                              >
                                {totals[c] + totals.power}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                              {totals[c]} {STATS[c]} + {totals.power} {STATS.power} ={" "}
                              <strong>{totals[c] + totals.power}</strong>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          totals[c]
                        )}
                      </td>
                      <td className="py-px pr-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <StatIcon stat={c} />
                          <span className="truncate">{STATS[c]}</span>
                        </span>
                      </td>
                      <td className="py-px pr-1">
                        <NumberCell
                          label={`${STATS[c]} : points de base`}
                          value={stuff.base[c]}
                          max={995}
                          onChange={(n) => update({ base: { ...stuff.base, [c]: n } })}
                        />
                      </td>
                      <td className="py-px">
                        <NumberCell
                          label={`${STATS[c]} : parchemins`}
                          value={stuff.scrolls[c]}
                          max={SCROLL_MAX}
                          onChange={(n) => update({ scrolls: { ...stuff.scrolls, [c]: n } })}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className={cn("py-px pr-2 font-semibold tabular-nums", statTone("power"))}>
                      {totals.power}
                    </td>
                    <td className="py-px" colSpan={2}>
                      <span className="flex items-center gap-1.5">
                        <StatIcon stat="power" />
                        {STATS.power}
                      </span>
                    </td>
                    <td className="py-px">
                      <div
                        className="flex w-14 gap-1"
                        role="group"
                        aria-label="Tous les parchemins"
                      >
                        {[0, SCROLL_MAX].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              update({
                                scrolls: Object.fromEntries(
                                  CHARACTERISTICS.map((c) => [c, value]),
                                ) as Stuff["scrolls"],
                              })
                            }
                            title={`Mettre tous les parchemins à ${value}`}
                            className="h-7 flex-1 rounded-md border border-input bg-background/60 text-[0.65rem] font-semibold tabular-nums transition-colors hover:bg-accent"
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Coût : 1 point jusqu&apos;à 100, puis 2, 3 et 4 au-delà de 300 · Vitalité 1 ·
                Sagesse 3.
              </p>
            </Panel>

            <Panel title="Secondaires" icon={Sparkles}>
              <StatGrid keys={SECONDARY} totals={totals} />
            </Panel>
          </div>

          {/* Centre : équipement */}
          <div className="order-1 space-y-4 @min-[64rem]:order-2">
            <section
              aria-label="Équipement"
              className="frame-gilded bg-sky mx-auto w-full max-w-[31.5rem] rounded-2xl border p-4"
            >
              {/* Grille de 6 colonnes égales : tous les emplacements ont la même taille. */}
              <div className="grid grid-cols-6 gap-2.5">
                <div className="grid content-start gap-2.5">
                  {(["amulet", "shield", "ring1", "belt", "boots"] as const).map((id) =>
                    renderSlot(id, "right"),
                  )}
                </div>
                {/* La hauteur est donnée par les emplacements : le contenu défile si besoin. */}
                <div className="relative col-span-4 min-h-0 rounded-xl border border-dashed border-gold/30 bg-card/40 text-sm">
                  <div className="absolute inset-0 flex flex-col gap-2 overflow-y-auto p-3">
                    <p className="font-display truncate text-center text-base tracking-wide">
                      {stuff.name || "Sans nom"}
                    </p>
                    <p className="text-center text-muted-foreground">
                      Niveau {level} · {equipped.length} / {SLOTS.length} objets
                    </p>
                    <div className="mx-auto w-full max-w-60">
                      <DamageCalculator
                        totals={totals}
                        level={level}
                        breedId={stuff.breedId}
                        onBreedChange={(breedId) => update({ breedId })}
                        elementTags={stuff.tags.elements}
                        weapon={equipped.find((e) => e.slot.id === "weapon")?.item ?? null}
                      />
                      <div className="mt-1.5">
                        <SetPicker
                          level={level}
                          equippedIds={equippedIds}
                          onEquip={(set, picked) => {
                            setItems((m) => ({
                              ...m,
                              ...Object.fromEntries(picked.map((i) => [i.id, i])),
                            }));
                            setSets((m) => ({ ...m, [set.id]: set }));
                            setStuff((s) => ({ ...s, slots: placeItems(s.slots, picked) }));
                          }}
                        />
                      </div>
                    </div>
                    {activeGroups.length > 0 && (
                      <ul className="mt-1 grid gap-1.5">
                        {activeGroups.map(({ set, items: setItems }) => (
                          <li
                            key={set.id}
                            className="flex min-w-0 items-center gap-2.5 rounded-lg border border-gold/40 bg-gold-soft py-1.5 pr-2 pl-3"
                          >
                            <div className="flex shrink-0 -space-x-2">
                              {setItems.map((item) => (
                                <span
                                  key={item.id}
                                  title={item.name}
                                  className="flex size-8 items-center justify-center rounded-full border border-gold/40 bg-card"
                                >
                                  <ItemIcon item={item} className="size-6" />
                                </span>
                              ))}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <p className="truncate font-medium">{set.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {setItems.length} / {set.itemIds.length} objets équipés
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {setGroups.length > activeGroups.length && (
                      <p className="text-center text-xs text-muted-foreground">
                        {setGroups.length - activeGroups.length === 1
                          ? "1 panoplie incomplète"
                          : `${setGroups.length - activeGroups.length} panoplies incomplètes`}{" "}
                        · détail plus bas
                      </p>
                    )}
                    {warnings.length > 0 && (
                      <ul className="mt-1 grid gap-1 text-xs text-destructive">
                        {warnings.map((w, i) => (
                          <li key={i} className="flex gap-1.5">
                            <AlertTriangle
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                    {equipped.length === 0 && (
                      <p className="m-auto text-center text-muted-foreground">
                        Cliquez sur un emplacement pour choisir un objet.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid content-start gap-2.5">
                  {(["hat", "weapon", "ring2", "cloak", "pet"] as const).map((id) =>
                    renderSlot(id, "left"),
                  )}
                </div>
                {(["dofus1", "dofus2", "dofus3", "dofus4", "dofus5", "dofus6"] as const).map((id) =>
                  renderSlot(id, "top"),
                )}
              </div>
            </section>
            {/* Panoplies : sous l'équipement, dans la colonne du centre. */}
            {setGroups.length > 0 && (
              <Panel title="Panoplies" icon={Layers} className="@container">
                <ul className="grid gap-2 @min-[30rem]:grid-cols-2">
                  {setGroups.map(({ set, items: setItems, active }) => (
                    <li
                      key={set.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-2",
                        active ? "border-gold/40 bg-gold-soft/60" : "bg-background/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 -space-x-1.5">
                          {setItems.map((item) => (
                            <span
                              key={item.id}
                              title={item.name}
                              className="flex size-7 items-center justify-center rounded-full border border-gold/40 bg-card"
                            >
                              <ItemIcon item={item} className="size-5" />
                            </span>
                          ))}
                        </div>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-sm font-medium" title={set.name}>
                            {set.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {setItems.length} / {set.itemIds.length} objets équipés
                          </p>
                        </div>
                      </div>
                      {active ? (
                        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          {active.effects.map((e, i) => (
                            <EffectRow key={i} effect={e} className="min-w-0" />
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Équipez un objet de plus pour activer les bonus.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          {/* Colonnes droites : dommages et résistances, puis effets spéciaux et forgemagie */}
          <div className="order-3 grid content-start items-start gap-4 @min-[85rem]:grid-cols-2">
            <div className="space-y-4">
              <Panel title="Dommages" icon={Swords}>
                <StatGrid
                  keys={DAMAGE_FIXED}
                  totals={totals}
                  plus={{ stat: "damage", to: ELEMENT_DAMAGE }}
                />
                <hr className="my-2 border-border" />
                <StatGrid keys={DAMAGE_OTHER} totals={totals} />
              </Panel>
              <Panel title="Résistances" icon={Shield}>
                <StatGrid keys={RESISTANCE_FIXED} totals={totals} />
                <hr className="my-2 border-border" />
                <StatGrid keys={RESISTANCE_PCT} totals={totals} />
              </Panel>
            </div>
            <div className="space-y-4">
              {effectEntries.length > 0 && (
                <Panel title="Effets spéciaux" icon={Gem}>
                  <SpecialEffectsPanel
                    entries={effectEntries}
                    choices={stuff.specials}
                    onEdit={setAsking}
                  />
                </Panel>
              )}
              <Panel title="Forgemagie" icon={Hammer}>
                <Forgemagic
                  exos={stuff.exos}
                  onToggleExo={toggleExo}
                  lines={stuff.forgemagic}
                  onLinesChange={(forgemagic) => update({ forgemagic })}
                />
              </Panel>
            </div>
          </div>
        </div>
      </div>

      {pickingSlot && (
        <ItemPicker
          key={pickingSlot.id}
          open
          onOpenChange={(open) => !open && setPicking(null)}
          slotLabel={pickingSlot.label}
          family={pickingSlot.family}
          level={level}
          current={pickingItem}
          onPick={(item) => {
            setItems((m) => ({ ...m, [item.id]: item }));
            update({ slots: { ...stuff.slots, [pickingSlot.id]: item.id } });
            setPicking(null);
            // Objet à effet spécial : on demande tout de suite la situation à simuler.
            const effect = specialEffectOf(item);
            if (effect) setAsking(effect.key);
          }}
          onRemove={() => {
            const slots = { ...stuff.slots };
            delete slots[pickingSlot.id];
            update({ slots });
            setPicking(null);
          }}
        />
      )}
      {pickingLegend && petItem && (
        <LegendaryPowerDialog
          item={petItem}
          value={stuff.legendary}
          onChoose={(power) => {
            update({ legendary: power?.key ?? null });
            setPickingLegend(false);
            // Pouvoir à situations : on demande tout de suite laquelle simuler.
            if (power && power.choices.length > 0) setAsking(power.key);
          }}
          onClose={() => setPickingLegend(false)}
        />
      )}
      {askingEntry && (
        <SpecialEffectDialog
          key={askingEntry.effect.key}
          item={askingEntry.item}
          effect={askingEntry.effect}
          value={stuff.specials[askingEntry.effect.key]}
          onChoose={(choiceId) => {
            update({ specials: { ...stuff.specials, [askingEntry.effect.key]: choiceId } });
            setAsking(null);
          }}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
