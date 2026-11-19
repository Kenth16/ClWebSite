"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";

/** Caractéristiques proposées, regroupées comme dans le simulateur. */
const GROUPS: { label: string; stats: StatKey[] }[] = [
  {
    label: "Caractéristiques",
    stats: ["vitality", "wisdom", "strength", "intelligence", "chance", "agility", "power"],
  },
  {
    label: "Résumé",
    stats: ["ap", "mp", "range", "initiative", "critical", "summons", "heals", "prospecting"],
  },
  {
    label: "Secondaires",
    stats: ["dodge", "lock", "apParry", "apReduction", "mpParry", "mpReduction", "pods"],
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

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Contenu de l'encadré Forgemagie : exos PA/PM/PO et caractéristiques ajoutées à la main. */
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
  const [adding, setAdding] = React.useState(false);
  const [stat, setStat] = React.useState<StatKey>("vitality");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const activeExos = EXO_STATS.filter((k) => exos[k]);

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const n = Math.trunc(Number(value));
    if (!value.trim() || !Number.isFinite(n) || n === 0) {
      setError("Saisissez une valeur (négative pour un malus).");
      return;
    }
    if (Math.abs(n) > FORGEMAGIC_VALUE_MAX) {
      setError(`La valeur doit rester entre −${FORGEMAGIC_VALUE_MAX} et ${FORGEMAGIC_VALUE_MAX}.`);
      return;
    }
    // Une même caractéristique ajoutée deux fois : les valeurs se cumulent.
    const existing = lines.find((l) => l.stat === stat);
    const next = existing
      ? lines
          .map((l) => (l.stat === stat ? { ...l, value: l.value + n } : l))
          .filter((l) => l.value !== 0)
      : [...lines, { stat, value: n }];
    onLinesChange(next);
    setValue("");
    setError(null);
    setAdding(false);
  }

  return (
    <div className="grid gap-3">
      {activeExos.length === 0 && lines.length === 0 && !adding && (
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

      {adding ? (
        <form onSubmit={add} className="grid gap-2 rounded-lg border bg-background/40 p-2.5">
          <label className="grid gap-1 text-xs font-medium">
            Caractéristique
            <select
              value={stat}
              onChange={(e) => setStat(e.target.value as StatKey)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.stats.map((k) => (
                    <option key={k} value={k}>
                      {STATS[k]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Valeur
            <Input
              autoFocus
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ex. 30 ou -10"
              aria-invalid={error ? true : undefined}
              className={cn("h-9 tabular-nums", NO_SPIN)}
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="flex-1">
              Ajouter
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={lines.length >= FORGEMAGIC_LINES_MAX}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" />
          Ajouter
        </Button>
      )}
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
