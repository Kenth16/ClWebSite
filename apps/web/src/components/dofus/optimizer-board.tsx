"use client";

import * as React from "react";
import {
  Ban,
  BadgeCheck,
  Check,
  ExternalLink,
  Heart,
  Loader2,
  Lock,
  ScrollText,
  ShieldCheck,
  Swords,
  type LucideIcon,
} from "lucide-react";
import {
  CHARACTERISTICS,
  ELEMENTS,
  RESISTANCE_STATS,
  SLOTS,
  STATS,
  conditionsText,
  type Characteristic,
  type DofusBreed,
  type DofusElement,
  type DofusItem,
  type DofusSet,
  type LineDamage,
  type OptimizerCritMode,
  type SlotFamily,
  type SlotId,
  type StatKey,
  type StatTotals,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ItemIcon, ItemPicker } from "./item-picker";
import { BannedItems, banItem, forceItem, type ItemRules } from "./optimizer-items";
import { EffectRow, StatIcon, statTone } from "./stat-icon";
import { RemoteIcon } from "./tags";

export interface SpellResult {
  spellId: number;
  name: string;
  icon: string | null;
  apCost: number;
  average: number;
  lines: LineDamage[];
  criticalChance: number;
}

/** Un stuff rendu par l'optimiseur. */
export interface BoardStuff {
  slots: Partial<Record<SlotId, number>>;
  points: Record<Characteristic, number>;
  specials: Record<string, string>;
  damage: number;
  spells: SpellResult[];
  hp: number;
  totals: StatTotals;
  items: DofusItem[];
  sets: DofusSet[];
}

type ResistanceElement = keyof typeof RESISTANCE_STATS;
export interface Minimums {
  hp?: number;
  mp?: number;
  range?: number;
  resistances: Partial<Record<ResistanceElement, number>>;
}

/** Réglages du calcul utiles à l'affichage (avant comme après le calcul). */
export interface BoardSettings {
  level: number;
  breed: DofusBreed | null;
  ap: number;
  attack: "ranged" | "melee";
  critMode: OptimizerCritMode;
  /** Éléments des sorts choisis : leurs caractéristiques sont résumées. */
  elements: DofusElement[];
  minimums: Minimums;
  /** Sorts choisis (avant tout calcul, on les montre sans dégâts). */
  spells: { id: number; name: string; icon: string | null; apCost: number }[];
}

export interface BoardProof {
  proven: boolean;
  damage: number;
  upper: number;
  ms: number;
  considered: number;
}

const RESISTANCES = Object.keys(RESISTANCE_STATS) as ResistanceElement[];
const LEFT: SlotId[] = ["amulet", "shield", "ring1", "belt", "boots"];
const RIGHT: SlotId[] = ["hat", "weapon", "ring2", "cloak", "pet"];
const BOTTOM: SlotId[] = ["dofus1", "dofus2", "dofus3", "dofus4", "dofus5", "dofus6"];

const range = (r: { min: number; max: number }) =>
  r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

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

/** Caractéristiques qui comptent dans les dégâts des sorts choisis. */
function damageStats(settings: BoardSettings): StatKey[] {
  const keys: StatKey[] = [];
  for (const e of settings.elements) {
    const stat = ELEMENTS[e].stat;
    if (!keys.includes(stat)) keys.push(stat);
  }
  keys.push("power", "damage");
  for (const e of settings.elements) {
    const dmg = ELEMENTS[e].damage;
    if (!keys.includes(dmg)) keys.push(dmg);
  }
  if (settings.critMode !== "never") keys.push("critical", "criticalDamage");
  keys.push(
    "spellDamagePct",
    settings.attack === "melee" ? "meleeDamagePct" : "rangedDamagePct",
    "finalDamagePct",
  );
  return keys;
}

function StatLine({ stat, value }: { stat: StatKey; value: number | null }) {
  return (
    <div
      title={value === null ? STATS[stat] : `${STATS[stat]} : ${value}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-[0.82rem]",
        value ? "bg-muted/50" : "",
      )}
    >
      <StatIcon stat={stat} />
      <dd
        className={cn(
          "min-w-7 shrink-0 text-right font-semibold tabular-nums",
          value !== null && value < 0 && "text-destructive",
          !value && "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </dd>
      <dt className={cn("truncate", !value && "text-muted-foreground")}>{STATS[stat]}</dt>
    </div>
  );
}

/** Exigence du joueur : valeur obtenue et minimum demandé. */
function Requirement({
  stat,
  label,
  value,
  min,
}: {
  stat: StatKey;
  label: string;
  value: number | null;
  min: number;
}) {
  const met = value !== null && value >= min;
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.82rem]",
        value === null
          ? "bg-background/40"
          : met
            ? "border-primary/40 bg-primary/5"
            : "border-destructive/50",
      )}
    >
      <StatIcon stat={stat} className="size-3.5" />
      <span className="font-semibold tabular-nums">{value ?? "—"}</span>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "ml-auto shrink-0 text-xs",
          value === null ? "text-muted-foreground" : met ? "text-primary" : "text-destructive",
        )}
      >
        min. {min}
      </span>
    </li>
  );
}

/**
 * Plateau de l'optimiseur : un stuff vierge où le joueur pose ses objets
 * imposés (Ctrl + clic : interdire), le résumé des caractéristiques utiles à
 * gauche, les objets interdits à droite, les sorts choisis dessous, et les
 * meilleurs stuffs trouvés (1 à 5) une fois le calcul terminé.
 */
export function OptimizerBoard({
  settings,
  rules,
  onRules,
  stuffs,
  selected,
  onSelect,
  proof,
  running,
  onOpenInSimulator,
  controls,
}: {
  settings: BoardSettings;
  rules: ItemRules;
  onRules: (rules: ItemRules) => void;
  stuffs: BoardStuff[] | null;
  selected: number;
  onSelect: (index: number) => void;
  proof: BoardProof | null;
  running: boolean;
  onOpenInSimulator: (index: number) => void;
  /** Réglages retenus et boutons du calcul, en haut de la colonne de droite. */
  controls?: React.ReactNode;
}) {
  const [picking, setPicking] = React.useState<SlotId | null>(null);
  const stuff = stuffs?.[selected] ?? null;
  const itemById = new Map(stuff?.items.map((i) => [i.id, i]));
  const totals = stuff?.totals ?? null;
  const t = (k: StatKey) => (totals ? totals[k] : null);
  const level = settings.level;

  const bannedIds = new Set(rules.banned.map((i) => i.id));
  const slotItem = (slot: SlotId): { item: DofusItem | null; forced: boolean } => {
    const forced = rules.forced[slot];
    if (forced) return { item: forced, forced: true };
    const id = stuff?.slots[slot];
    // Objet interdit (Ctrl + clic) : il quitte aussitôt sa case, même dans un stuff trouvé.
    if (id === undefined || bannedIds.has(id)) return { item: null, forced: false };
    return { item: itemById.get(id) ?? null, forced: false };
  };
  const forcedCount = Object.keys(rules.forced).length;

  const renderSlot = (slotId: SlotId, side: "left" | "right" | "top") => {
    const slot = SLOTS.find((s) => s.id === slotId)!;
    const { item, forced } = slotItem(slotId);
    const button = (
      <button
        key={slotId}
        type="button"
        onClick={(e) => {
          // Ctrl + clic (Cmd + clic sur Mac) : l'objet est interdit et quitte le stuff.
          if (item && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onRules(banItem(rules, item));
            return;
          }
          setPicking(slotId);
        }}
        aria-label={
          item ? `${slot.label} : ${item.name}${forced ? " (imposé)" : ""}` : `${slot.label} : vide`
        }
        className={cn(
          "group relative flex aspect-square w-full items-center justify-center rounded-lg border bg-background/50 transition-colors hover:border-gold/60 hover:bg-accent",
          item && "border-gold/40 bg-card",
          forced && "border-2 border-gold shadow-[inset_0_0_0_1px_var(--gold)]",
        )}
      >
        {item ? (
          <ItemIcon item={item} className="size-[78%]" />
        ) : (
          <span className="px-1 text-center text-[0.7rem] leading-tight text-muted-foreground">
            {slot.label}
          </span>
        )}
        {forced && (
          <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-gold bg-card text-gold">
            <Lock className="size-2.5" aria-hidden="true" />
          </span>
        )}
      </button>
    );
    if (!item) return button;
    return (
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
            <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              Conditions : {conditionsText(item.conditions)}
            </p>
          )}
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            {forced ? "Imposé : toujours dans le stuff. " : "Trouvé par le solveur. "}
            Clic : {forced ? "changer ou retirer" : "imposer un autre objet"} · Ctrl + clic :
            interdire
          </p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const pickingSlot = SLOTS.find((s) => s.id === picking) ?? null;
  const required = [
    settings.minimums.hp !== undefined && {
      stat: "vitality" as StatKey,
      label: "PV",
      value: stuff ? stuff.hp : null,
      min: settings.minimums.hp,
    },
    settings.minimums.mp !== undefined && {
      stat: "mp" as StatKey,
      label: "PM",
      value: t("mp"),
      min: settings.minimums.mp,
    },
    settings.minimums.range !== undefined && {
      stat: "range" as StatKey,
      label: "PO",
      value: t("range"),
      min: settings.minimums.range,
    },
    ...RESISTANCES.map(
      (e) =>
        settings.minimums.resistances[e] !== undefined && {
          stat: RESISTANCE_STATS[e],
          label: `% Ré ${ELEMENTS[e].label}`,
          value: t(RESISTANCE_STATS[e]),
          min: settings.minimums.resistances[e]!,
        },
    ),
  ].filter((r): r is { stat: StatKey; label: string; value: number | null; min: number } => !!r);
  const pointsChosen = stuff ? CHARACTERISTICS.filter((c) => stuff.points[c] > 0) : [];
  // Panoplies au bonus actif seulement : un objet seul n'apporte aucun bonus.
  const activeSets = (stuff?.sets ?? [])
    .map((set) => ({ set, worn: stuff!.items.filter((i) => set.itemIds.includes(i.id)) }))
    .filter(({ worn }) => worn.length >= 2);

  return (
    <div className="@container">
      <div className="grid gap-4 @min-[64rem]:grid-cols-[18rem_minmax(0,31.5rem)_minmax(13rem,1fr)]">
        {/* Gauche : caractéristiques utiles aux dégâts, puis exigences du joueur. */}
        <div className="order-2 space-y-4 @min-[64rem]:order-1">
          <Panel title="Résumé" icon={ScrollText}>
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-el-life/10 px-3 py-[5px]">
              <Heart className="size-7 fill-el-life text-el-life" aria-hidden="true" />
              <p className="leading-tight">
                <span className="font-serif text-2xl font-bold tabular-nums">
                  {stuff ? stuff.hp : "—"}
                </span>
                <span className="block text-xs text-muted-foreground">Points de vie</span>
              </p>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(["ap", "mp", "range"] as const).map((k) => (
                <div
                  key={k}
                  className={cn(
                    "flex flex-col items-center rounded-lg border bg-background/50 py-1.5",
                    k === "ap" && "border-gold/60 bg-gold-soft",
                  )}
                  title={k === "ap" ? `${settings.ap} PA visés` : STATS[k]}
                >
                  <span className="flex items-center gap-1.5">
                    <StatIcon stat={k} className={cn("size-4", k !== "range" && "fill-current")} />
                    <span className="font-serif text-lg leading-none font-bold tabular-nums">
                      {t(k) ?? (k === "ap" ? settings.ap : "—")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{STATS[k]}</span>
                </div>
              ))}
            </div>
            <dl className="grid gap-y-0.5">
              {damageStats(settings).map((k) => (
                <StatLine key={k} stat={k} value={t(k)} />
              ))}
            </dl>
            {pointsChosen.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                Points :
                {pointsChosen.map((c) => (
                  <span key={c} className="flex items-center gap-1 text-foreground">
                    <StatIcon stat={c} className="size-3" />
                    <span className="font-semibold tabular-nums">{stuff!.points[c]}</span>
                  </span>
                ))}
              </p>
            )}
            {required.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-gold" aria-hidden="true" />
                  Exigences
                </p>
                <ul className="grid gap-1.5">
                  {required.map((r) => (
                    <Requirement key={r.label} {...r} />
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        {/* Centre : le stuff. */}
        <div className="order-1 space-y-3 @min-[64rem]:order-2">
          <section
            aria-label="Stuff"
            className="frame-gilded bg-sky mx-auto w-full max-w-[31.5rem] rounded-2xl border p-4 @min-[64rem]:mx-0"
          >
            <div className="grid grid-cols-6 gap-2.5">
              <div className="grid content-start gap-2.5">
                {LEFT.map((id) => renderSlot(id, "right"))}
              </div>
              <div className="relative col-span-4 min-h-0 rounded-xl border border-dashed border-gold/30 bg-card/40 text-sm">
                <div className="absolute inset-0 flex flex-col gap-2 overflow-y-auto p-3">
                  {stuff ? (
                    <div className="text-center">
                      <p className="font-serif text-3xl font-bold tabular-nums">
                        {fmt(stuff.damage)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        dégâts moyens · stuff n° {selected + 1}
                      </p>
                      {selected === 0 && proof ? (
                        proof.proven ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            <BadgeCheck className="size-3.5" aria-hidden="true" />
                            Optimum prouvé
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-destructive">
                            Non prouvé : au plus{" "}
                            {Math.max(
                              0,
                              Math.ceil(((proof.upper - proof.damage) / proof.damage) * 100),
                            )}{" "}
                            % de mieux possible
                          </p>
                        )
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Autre stuff rencontré pendant la recherche
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      {running ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          Calcul en cours…
                        </span>
                      ) : (
                        <>
                          Posez les objets que vous voulez absolument : ils seront imposés.
                          <br />
                          Ctrl + clic sur un objet : l&apos;interdire.
                        </>
                      )}
                    </p>
                  )}
                  {forcedCount > 0 && (
                    <p className="flex items-center justify-center gap-1 text-xs text-gold">
                      <Lock className="size-3" aria-hidden="true" />
                      {forcedCount} objet{forcedCount > 1 ? "s" : ""} imposé
                      {forcedCount > 1 ? "s" : ""}
                    </p>
                  )}
                  {stuff && (
                    <Button
                      size="sm"
                      className="mx-auto"
                      onClick={() => onOpenInSimulator(selected)}
                    >
                      <ExternalLink aria-hidden="true" />
                      Ouvrir dans le simulateur
                    </Button>
                  )}
                  {activeSets.length > 0 && (
                    <ul className="mt-1 grid gap-1.5">
                      {activeSets.map(({ set, worn }) => {
                        return (
                          <li
                            key={set.id}
                            className="flex min-w-0 items-center gap-2.5 rounded-lg border border-gold/40 bg-gold-soft py-1.5 pr-2 pl-3"
                          >
                            <div className="flex shrink-0 -space-x-2">
                              {worn.map((item) => (
                                <span
                                  key={item.id}
                                  title={item.name}
                                  className="flex size-7 items-center justify-center rounded-full border border-gold/40 bg-card"
                                >
                                  <ItemIcon item={item} className="size-5" />
                                </span>
                              ))}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <p className="truncate text-[0.8rem] font-medium">{set.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {worn.length} / {set.itemIds.length} objets
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <div className="grid content-start gap-2.5">
                {RIGHT.map((id) => renderSlot(id, "left"))}
              </div>
              {BOTTOM.map((id) => renderSlot(id, "top"))}
            </div>
          </section>

          {/* Stuffs trouvés : 1 = le meilleur (prouvé si possible), puis les suivants. */}
          {stuffs && stuffs.length > 0 && (
            <div className="mx-auto flex w-full max-w-[31.5rem] items-center gap-1.5 rounded-xl border bg-card/70 px-3 py-2 @min-[64rem]:mx-0">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Stuffs trouvés</span>
              {stuffs.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={selected === i}
                  onClick={() => onSelect(i)}
                  title={`Stuff n° ${i + 1} : ${fmt(s.damage)} dégâts`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md border font-serif text-base font-bold tabular-nums transition-colors",
                    selected === i
                      ? "border-gold/70 bg-gold-soft text-gold"
                      : "bg-background/50 text-muted-foreground hover:border-gold/40 hover:text-foreground",
                  )}
                >
                  {i + 1}
                </button>
              ))}
              {stuff && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {fmt(stuff.damage)} dégâts
                </span>
              )}
            </div>
          )}

          {/* Sorts choisis : dégâts avec le stuff affiché. */}
          <section
            aria-label="Sorts choisis"
            className="mx-auto w-full max-w-[31.5rem] rounded-xl border bg-card/70 p-3 @min-[64rem]:mx-0"
          >
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Swords className="size-3.5 text-gold" aria-hidden="true" />
              Sorts choisis
            </h2>
            {settings.spells.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Choisissez vos sorts dans les conditions (partie 2) : leurs dégâts
                s&apos;afficheront ici.
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {settings.spells.map((spell) => {
                  const r = stuff?.spells.find((x) => x.spellId === spell.id);
                  const line = r?.lines[0];
                  return (
                    <li
                      key={spell.id}
                      className="flex min-w-0 items-center gap-2 rounded-lg border bg-background/40 px-2 py-1.5"
                      title={
                        r
                          ? r.lines
                              .map(
                                (l) =>
                                  `${ELEMENTS[l.element].label} ${range(l.normal)}${l.critical && settings.critMode !== "never" ? ` (crit. ${range(l.critical)})` : ""}`,
                              )
                              .join(" · ")
                          : spell.name
                      }
                    >
                      <RemoteIcon src={spell.icon} className="size-7 shrink-0" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[0.8rem] font-medium">{spell.name}</p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          {spell.apCost} PA
                          {line && (
                            <>
                              {" · "}
                              <span className={statTone(ELEMENTS[line.element].damage)}>
                                {range(line.normal)}
                              </span>
                              {settings.critMode !== "never" && line.critical && (
                                <> / {range(line.critical)}</>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <p className="font-serif text-base font-bold tabular-nums">
                        {r ? Math.round(r.average) : "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Droite : réglages et relance du calcul, puis objets interdits (en tête sur mobile). */}
        <div className="@container order-first space-y-4 @min-[64rem]:order-3">
          {controls}
          <Panel title="Objets interdits" icon={Ban}>
            <BannedItems level={level} value={rules} onChange={onRules} />
          </Panel>
        </div>
      </div>

      {pickingSlot && (
        <ItemPicker
          key={pickingSlot.id}
          open
          onOpenChange={(open) => !open && setPicking(null)}
          slotLabel={`Imposer : ${pickingSlot.label}`}
          description="Cet objet sera toujours dans le stuff : le solveur optimise le reste autour."
          family={pickingSlot.family as SlotFamily}
          level={level}
          current={rules.forced[pickingSlot.id] ?? null}
          onPick={(item) => {
            onRules(forceItem(rules, pickingSlot.id, item));
            setPicking(null);
          }}
          onRemove={() => {
            onRules(forceItem(rules, pickingSlot.id, null));
            setPicking(null);
          }}
        />
      )}
      {proof && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Le stuff n° 1 fait le plus de dégâts possible sur les sorts choisis (un lancer chacun), en
          respectant les exigences et les conditions des objets, panoplies comprises ; « Optimum
          prouvé » : aucun autre stuff ne fait plus, parmi{" "}
          {proof.considered.toLocaleString("fr-FR")} objets du niveau (
          {(proof.ms / 1000).toFixed(1)} s). Les stuffs 2 à 5 sont les meilleurs autres stuffs
          rencontrés pendant la recherche, sans garantie de rang.
        </p>
      )}
    </div>
  );
}
