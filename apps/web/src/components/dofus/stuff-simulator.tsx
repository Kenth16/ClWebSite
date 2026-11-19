"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Copy,
  LogIn,
  Save,
  Dumbbell,
  Heart,
  Layers,
  NotebookPen,
  RotateCcw,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import {
  CHARACTERISTICS,
  LEVEL_MAX,
  SCROLL_MAX,
  SLOTS,
  STATS,
  clampLevel,
  computeCharacter,
  conditionsMet,
  conditionsText,
  type Characteristic,
  type DofusBuild,
  type DofusBuildData,
  type DofusBuildSummary,
  type DofusItem,
  type DofusSet,
  type SlotId,
  type StatKey,
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
import { CharacterImage } from "./character-image";
import { SavedBuildsDialog } from "./saved-builds";
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
}

const STORAGE_KEY = "kenpai:dofus:stuff";
const NOTES_MAX = 255;
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
});

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

const MAIN: StatKey[] = ["ap", "mp", "range"];
const SUMMARY: StatKey[] = ["initiative", "critical", "summons", "heals", "prospecting"];
const SECONDARY: StatKey[] = [
  "dodge",
  "lock",
  "apParry",
  "apReduction",
  "mpParry",
  "mpReduction",
  "pods",
];
const DAMAGE: StatKey[] = [
  "damage",
  "neutralDamage",
  "earthDamage",
  "fireDamage",
  "waterDamage",
  "airDamage",
  "criticalDamage",
  "pushbackDamage",
  "weaponDamagePct",
  "spellDamagePct",
  "meleeDamagePct",
  "rangedDamagePct",
];
const RESISTANCE: StatKey[] = [
  "neutralRes",
  "earthRes",
  "fireRes",
  "waterRes",
  "airRes",
  "criticalRes",
  "pushbackRes",
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

function StatGrid({ keys, totals }: { keys: StatKey[]; totals: Record<StatKey, number> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
      {keys.map((k) => (
        <div
          key={k}
          className={cn(
            "flex items-center gap-2 rounded-md px-1.5 py-1",
            totals[k] !== 0 && "bg-muted/50",
          )}
        >
          <StatIcon stat={k} />
          <dd
            className={cn(
              "min-w-8 shrink-0 text-right font-semibold tabular-nums",
              totals[k] < 0 && "text-destructive",
              totals[k] === 0 && "text-muted-foreground",
            )}
          >
            {totals[k]}
          </dd>
          <dt className={cn("truncate", totals[k] === 0 && "text-muted-foreground")}>{STATS[k]}</dt>
        </div>
      ))}
    </dl>
  );
}

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
      className="h-8 w-[4.5rem] px-2 text-right tabular-nums"
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
  const requested = React.useRef(new Set<string>());

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stuff));
    } catch {
      // Navigation privée ou stockage plein : le stuff n'est simplement pas conservé.
    }
  }, [stuff]);

  const update = (patch: Partial<Stuff>) => setStuff((s) => ({ ...s, ...patch }));

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
          body: asCopy ? { ...data, name: `${data.name} (copie)`.slice(0, 40) } : data,
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
  const result = computeCharacter({
    level,
    base: stuff.base,
    scrolls: stuff.scrolls,
    items: equipped.map((e) => e.item),
    sets: setIds.map((id) => sets[id]).filter((s): s is DofusSet => !!s),
  });
  const { totals } = result;

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

  // Alertes : niveau, conditions, objets en double.
  const warnings: string[] = [];
  for (const { item } of equipped) {
    if (item.level > level) warnings.push(`${item.name} demande le niveau ${item.level}.`);
    if (!conditionsMet(item.conditions, { level, totals })) {
      warnings.push(`${item.name} : conditions non remplies (${conditionsText(item.conditions)}).`);
    }
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
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            Cliquer pour changer ou retirer
          </p>
        </TooltipContent>
      </Tooltip>
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
            className="w-24 tabular-nums"
          />
        </label>
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

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        {/* Colonne gauche : caractéristiques */}
        <div className="order-2 space-y-4 xl:order-1">
          <Panel title="Résumé" icon={ScrollText}>
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-el-life/10 px-3 py-2">
              <Heart className="size-7 fill-el-life text-el-life" aria-hidden="true" />
              <p className="leading-tight">
                <span className="font-serif text-2xl font-bold tabular-nums">{result.hp}</span>
                <span className="block text-xs text-muted-foreground">Points de vie</span>
              </p>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {MAIN.map((k) => (
                <div
                  key={k}
                  className="flex flex-col items-center rounded-lg border bg-background/50 py-2"
                >
                  <StatIcon stat={k} className={cn("size-5", k !== "range" && "fill-current")} />
                  <span className="mt-0.5 font-serif text-xl font-bold tabular-nums">
                    {totals[k]}
                  </span>
                  <span className="text-xs text-muted-foreground">{STATS[k]}</span>
                </div>
              ))}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-1 text-left font-normal">Total</th>
                  <th className="pb-1 text-left font-normal" />
                  <th className="pb-1 font-normal">Base</th>
                  <th className="pb-1 font-normal">Parcho</th>
                </tr>
              </thead>
              <tbody>
                {CHARACTERISTICS.map((c) => (
                  <tr key={c}>
                    <td className={cn("py-0.5 pr-2 font-semibold tabular-nums", statTone(c))}>
                      {totals[c]}
                    </td>
                    <td className="py-0.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <StatIcon stat={c} />
                        {STATS[c]}
                      </span>
                    </td>
                    <td className="py-0.5 pr-1">
                      <NumberCell
                        label={`${STATS[c]} : points de base`}
                        value={stuff.base[c]}
                        max={995}
                        onChange={(n) => update({ base: { ...stuff.base, [c]: n } })}
                      />
                    </td>
                    <td className="py-0.5">
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
                  <td className={cn("py-0.5 pr-2 font-semibold tabular-nums", statTone("power"))}>
                    {totals.power}
                  </td>
                  <td className="py-0.5" colSpan={2}>
                    <span className="flex items-center gap-1.5">
                      <StatIcon stat="power" />
                      {STATS.power}
                    </span>
                  </td>
                  <td className="py-0.5">
                    <div
                      className="flex w-[4.5rem] gap-1"
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
                          className="h-7 flex-1 rounded-md border border-input bg-background/60 text-xs font-semibold tabular-nums transition-colors hover:bg-accent"
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
              Coût : 1 point jusqu&apos;à 100, puis 2, 3 et 4 au-delà de 300 · Vitalité 1 · Sagesse
              3.
            </p>
          </Panel>

          <Panel title="Secondaires" icon={Sparkles}>
            <StatGrid keys={SECONDARY} totals={totals} />
          </Panel>
        </div>

        {/* Centre : équipement */}
        <div className="order-1 space-y-4 xl:order-2">
          <section aria-label="Équipement" className="frame-gilded bg-sky rounded-2xl border p-4">
            {/* Grille de 6 colonnes égales : tous les emplacements ont la même taille. */}
            <div className="grid grid-cols-6 gap-2.5">
              <div className="grid gap-2.5">
                {(["amulet", "shield", "ring1", "belt", "boots"] as const).map((id) =>
                  renderSlot(id, "right"),
                )}
              </div>
              <div className="col-span-4 flex min-w-0 flex-col gap-2 rounded-xl border border-dashed border-gold/30 bg-card/40 p-3 text-sm">
                <p className="font-display text-center text-base tracking-wide">
                  {stuff.name || "Sans nom"}
                </p>
                <CharacterImage
                  image={stuff.image}
                  onChange={(image) => update({ image })}
                  className="my-1"
                />
                <p className="text-center text-muted-foreground">
                  Niveau {level} · {equipped.length} / {SLOTS.length} objets
                </p>
                {setGroups.length > 0 && (
                  <ul className="mt-1 flex flex-wrap justify-center gap-1.5">
                    {setGroups.map(({ set, items: setItems, active }) => (
                      <li
                        key={set.id}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                          active ? "border-gold/50 bg-gold-soft" : "text-muted-foreground",
                        )}
                      >
                        <Layers className="size-3 text-gold" aria-hidden="true" />
                        {set.name}
                        <span className="tabular-nums">
                          {setItems.length}/{set.itemIds.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {warnings.length > 0 && (
                  <ul className="mt-1 grid gap-1 text-xs text-destructive">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
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
              <div className="grid gap-2.5">
                {(["hat", "weapon", "ring2", "cloak", "pet"] as const).map((id) =>
                  renderSlot(id, "left"),
                )}
              </div>
              {(["dofus1", "dofus2", "dofus3", "dofus4", "dofus5", "dofus6"] as const).map((id) =>
                renderSlot(id, "top"),
              )}
            </div>
          </section>

          <Panel title="Notes" icon={NotebookPen}>
            <textarea
              value={stuff.notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Quelques notes ou informations sur ce stuff…"
              aria-label="Notes sur le stuff"
              className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
            <p className="text-right text-xs text-muted-foreground">
              {stuff.notes.length} / {NOTES_MAX}
            </p>
          </Panel>
        </div>

        {/* Colonne droite : dommages et résistances */}
        <div className="order-3 space-y-4">
          <Panel title="Dommages" icon={Swords}>
            <StatGrid keys={DAMAGE} totals={totals} />
          </Panel>
          <Panel title="Résistances" icon={Shield}>
            <StatGrid keys={RESISTANCE} totals={totals} />
          </Panel>
        </div>
      </div>

      {/* Panoplies : sur toute la largeur, sous les trois colonnes. */}
      {setGroups.length > 0 && (
        <Panel title="Panoplies" icon={Layers}>
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {setGroups.map(({ set, items: setItems, active }) => (
              <li
                key={set.id}
                className={cn(
                  "rounded-lg border p-3",
                  active ? "border-gold/40 bg-gold-soft/60" : "bg-background/40",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex -space-x-2">
                    {setItems.map((item) => (
                      <span
                        key={item.id}
                        title={item.name}
                        className="flex size-10 items-center justify-center rounded-full border border-gold/40 bg-card"
                      >
                        <ItemIcon item={item} className="size-8" />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{set.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {setItems.length} / {set.itemIds.length} objets équipés
                    </p>
                  </div>
                </div>
                {active ? (
                  <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    {active.effects.map((e, i) => (
                      <EffectRow key={i} effect={e} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Équipez un objet de plus pour activer les bonus.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

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
          }}
          onRemove={() => {
            const slots = { ...stuff.slots };
            delete slots[pickingSlot.id];
            update({ slots });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
