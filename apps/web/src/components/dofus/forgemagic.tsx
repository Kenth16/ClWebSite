"use client";

import * as React from "react";
import { Pencil, Plus, X } from "lucide-react";
import {
  EXO_STATS,
  FORGEMAGIC_LINES_MAX,
  FORGEMAGIC_VALUE_MAX,
  STATS,
  type ExoStat,
  type Exos,
  type ForgemagicLine,
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
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";

/** Caractéristiques proposées dans la fenêtre, regroupées comme en jeu. */
const GROUPS: { label: string; stats: StatKey[] }[] = [
  {
    label: "Caractéristiques",
    stats: [
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
      "initiative",
      "critical",
      "summons",
      "heals",
      "prospecting",
      "dodge",
      "lock",
    ],
  },
  {
    label: "Secondaires",
    stats: ["apParry", "apReduction", "mpParry", "mpReduction", "pods"],
  },
  {
    label: "Dommages",
    stats: [
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
    ],
  },
  {
    label: "Résistances",
    stats: [
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
    ],
  },
];
const ORDER = GROUPS.flatMap((g) => g.stats);

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type Draft = Partial<Record<StatKey, string>>;

const toDraft = (lines: ForgemagicLine[]): Draft =>
  Object.fromEntries(lines.map((l) => [l.stat, String(l.value)]));

/** Fenêtre de forgemagie : une case par caractéristique, comme en jeu. */
function ForgemagicDialog({
  lines,
  onLinesChange,
}: {
  lines: ForgemagicLine[];
  onLinesChange: (lines: ForgemagicLine[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({});
  const [error, setError] = React.useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (next) {
      setDraft(toDraft(lines));
      setError(null);
    }
    setOpen(next);
  }

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: ForgemagicLine[] = [];
    for (const stat of ORDER) {
      const raw = draft[stat]?.trim();
      if (!raw) continue;
      const value = Math.trunc(Number(raw));
      if (!Number.isFinite(value)) {
        setError(`Valeur invalide pour ${STATS[stat]}.`);
        return;
      }
      if (Math.abs(value) > FORGEMAGIC_VALUE_MAX) {
        setError(
          `${STATS[stat]} : la valeur doit rester entre −${FORGEMAGIC_VALUE_MAX} et ${FORGEMAGIC_VALUE_MAX}.`,
        );
        return;
      }
      if (value !== 0) next.push({ stat, value });
    }
    if (next.length > FORGEMAGIC_LINES_MAX) {
      setError(`Au plus ${FORGEMAGIC_LINES_MAX} caractéristiques différentes.`);
      return;
    }
    onLinesChange(next);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {lines.length > 0 ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {lines.length > 0 ? "Modifier" : "Ajouter"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl gap-4">
        <div>
          <DialogTitle>Forgemagie</DialogTitle>
          <DialogDescription className="mt-1">
            Indiquez de combien améliorer chaque caractéristique (négatif pour un malus).
          </DialogDescription>
        </div>
        <form onSubmit={apply} className="grid gap-4">
          <div className="-mx-2 grid max-h-[60svh] gap-4 overflow-y-auto px-2">
            {GROUPS.map((group) => (
              <fieldset key={group.label}>
                <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
                  {group.label}
                </legend>
                <div
                  style={{ "--rows": Math.ceil(group.stats.length / 2) } as React.CSSProperties}
                  className="grid gap-x-6 gap-y-1 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[repeat(var(--rows),auto)]"
                >
                  {group.stats.map((stat) => {
                    const value = Number(draft[stat] || 0);
                    return (
                      <label key={stat} className="flex items-center gap-2 text-sm">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={draft[stat] ?? ""}
                          placeholder="0"
                          onChange={(e) => setDraft((d) => ({ ...d, [stat]: e.target.value }))}
                          className={cn(
                            "h-7 w-16 shrink-0 px-2 text-right tabular-nums",
                            NO_SPIN,
                            value > 0 && "text-primary",
                            value < 0 && "text-destructive",
                          )}
                        />
                        <StatIcon stat={stat} />
                        <span className="truncate">{STATS[stat]}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setDraft({})}>
              Tout remettre à 0
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit">Valider</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Contenu de l'encadré Forgemagie : exos PA/PM/PO et caractéristiques ajoutées. */
export function Forgemagic({
  exos,
  onToggleExo,
  lines,
  onLinesChange,
}: {
  exos: Exos;
  onToggleExo: (stat: ExoStat) => void;
  lines: ForgemagicLine[];
  onLinesChange: (lines: ForgemagicLine[]) => void;
}) {
  const activeExos = EXO_STATS.filter((k) => exos[k]);

  return (
    <div className="grid gap-3">
      {activeExos.length === 0 && lines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun bonus. Cliquez sur PA, PM ou PO dans le Résumé pour un exo, ou ajoutez des
          caractéristiques.
        </p>
      )}

      {(activeExos.length > 0 || lines.length > 0) && (
        <ul className="grid gap-1.5 text-sm">
          {activeExos.map((k) => (
            <li
              key={`exo-${k}`}
              className="flex items-center gap-2 rounded-md border border-gold/40 bg-gold-soft px-2 py-1.5"
            >
              <StatIcon stat={k} className={cn(k !== "range" && "fill-current")} />
              <span className="flex-1">
                Exo {STATS[k]} <span className="font-semibold text-gold">+1</span>
              </span>
              <RemoveButton label={`Retirer l'exo ${STATS[k]}`} onClick={() => onToggleExo(k)} />
            </li>
          ))}
          {lines.map((line) => (
            <li
              key={line.stat}
              className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5"
            >
              <StatIcon stat={line.stat} />
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  line.value < 0 ? "text-destructive" : "text-primary",
                )}
              >
                {line.value > 0 ? `+${line.value}` : line.value}
              </span>
              <span className="min-w-0 flex-1 truncate">{STATS[line.stat]}</span>
              <RemoveButton
                label={`Retirer ${STATS[line.stat]}`}
                onClick={() => onLinesChange(lines.filter((l) => l.stat !== line.stat))}
              />
            </li>
          ))}
        </ul>
      )}

      <ForgemagicDialog lines={lines} onLinesChange={onLinesChange} />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Retirer"
      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
