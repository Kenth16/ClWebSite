"use client";

import * as React from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import {
  LINE_CONDITION_LABELS,
  STATS,
  buffValue,
  spellGradeAt,
  type DofusBreed,
  type DofusSpell,
  type SpellBuffLine,
  type StatKey,
  type StatTotals,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";
import { RemoteIcon } from "./tags";

/** Boost ajouté au calcul : un sort, avec ses lignes comptées ou non. */
export interface ActiveBuff {
  spellId: number;
  name: string;
  icon: string | null;
  breed: string;
  lines: { line: SpellBuffLine; on: boolean }[];
}

/** Les caractéristiques du stuff avec les boosts comptés ajoutés. */
export function withBuffs(totals: StatTotals, buffs: readonly ActiveBuff[]): StatTotals {
  if (buffs.length === 0) return totals;
  const next = { ...totals };
  for (const b of buffs) {
    for (const { line, on } of b.lines) if (on) next[line.stat] += buffValue(line);
  }
  return next;
}

const duration = (turns: number) =>
  turns < 0 ? "tout le combat" : `${turns} tour${turns > 1 ? "s" : ""}`;

function lineLabel(line: SpellBuffLine) {
  const range = line.min === line.max ? `${line.min}` : `${line.min} à ${line.max}`;
  return `+${range} ${STATS[line.stat]}`;
}

function BuffLineChip({
  line,
  on,
  onToggle,
}: {
  line: SpellBuffLine;
  on?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <StatIcon stat={line.stat as StatKey} className="size-3.5" />
      <span className="tabular-nums">{lineLabel(line)}</span>
      {line.min !== line.max && (
        <span className="text-muted-foreground">(compté {buffValue(line)})</span>
      )}
      {line.condition && (
        <span
          className="rounded border px-1 text-[0.6rem] text-muted-foreground"
          title={LINE_CONDITION_LABELS[line.condition].help}
        >
          {LINE_CONDITION_LABELS[line.condition].label}
        </span>
      )}
    </>
  );
  if (!onToggle) {
    return <span className="flex items-center gap-1 text-xs">{content}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={
        on ? "Compté dans le calcul : cliquer pour l'ignorer" : "Ignoré : cliquer pour le compter"
      }
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent",
        on ? "border-primary/60 bg-primary/10" : "line-through opacity-50",
      )}
    >
      {content}
    </button>
  );
}

/**
 * Boosts en combat : sorts de sa classe ou d'un allié (Puissance, Mot
 * Galvanisant…) ajoutés aux caractéristiques du calcul. Les lignes sous
 * condition sont ajoutées sans être comptées : le joueur les active.
 */
export function CombatBuffs({
  value,
  onChange,
  level,
  breeds,
  breedId,
  spells,
  requestSpells,
}: {
  value: ActiveBuff[];
  onChange: (value: ActiveBuff[]) => void;
  level: number;
  breeds: DofusBreed[] | null;
  /** Classe du personnage : proposée en premier. */
  breedId: number | null;
  spells: Record<number, DofusSpell[]>;
  requestSpells: (breedId: number) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  const [from, setFrom] = React.useState<number | null>(breedId);
  const source = from ?? breedId;
  React.useEffect(() => {
    if (picking && source !== null) requestSpells(source);
  }, [picking, source, requestSpells]);

  const candidates = source !== null ? spells[source] : undefined;
  const buffSpells = candidates
    ?.map((spell) => ({ spell, grade: spellGradeAt(spell, level) }))
    .filter(({ grade }) => (grade?.buffs?.length ?? 0) > 0);
  const sourceBreed = breeds?.find((b) => b.id === source);

  function add(spell: DofusSpell, lines: SpellBuffLine[]) {
    if (value.some((b) => b.spellId === spell.id)) return;
    onChange([
      ...value,
      {
        spellId: spell.id,
        name: spell.name,
        icon: spell.icon,
        breed: sourceBreed?.name ?? "",
        lines: lines.map((line) => ({ line, on: !line.condition })),
      },
    ]);
  }
  function toggle(spellId: number, index: number) {
    onChange(
      value.map((b) =>
        b.spellId === spellId
          ? { ...b, lines: b.lines.map((l, i) => (i === index ? { ...l, on: !l.on } : l)) }
          : b,
      ),
    );
  }

  return (
    <section aria-label="Boosts en combat" className="grid gap-2 rounded-lg border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-gold" aria-hidden="true" />
        <span className="text-sm font-medium">Boosts en combat</span>
        <span className="text-xs text-muted-foreground">
          sorts de votre classe ou d&apos;un allié, ajoutés aux caractéristiques
        </span>
        <div className="ml-auto flex gap-1">
          {value.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange([])}
            >
              Tout retirer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setFrom(breedId);
              setPicking(true);
            }}
          >
            <Plus aria-hidden="true" />
            Ajouter
          </Button>
        </div>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun : les dégâts sont calculés avec le stuff seul.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {value.map((b) => (
            <li
              key={b.spellId}
              className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background/60 p-1.5"
            >
              <RemoteIcon src={b.icon} className="size-6 shrink-0" />
              <span className="text-sm font-medium">{b.name}</span>
              {b.breed && <span className="text-xs text-muted-foreground">{b.breed}</span>}
              {b.lines.map(({ line, on }, i) => (
                <BuffLineChip key={i} line={line} on={on} onToggle={() => toggle(b.spellId, i)} />
              ))}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.spellId !== b.spellId))}
                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Retirer ${b.name}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-3xl gap-3">
          <DialogTitle>Ajouter un boost</DialogTitle>
          <DialogDescription>
            Sorts qui donnent des caractéristiques au lanceur ou à un allié, au grade du niveau{" "}
            {level}. Les lignes sous condition sont ajoutées sans être comptées.
          </DialogDescription>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Classe">
            {breeds?.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={b.id === source}
                title={b.name}
                onClick={() => setFrom(b.id)}
                className={cn(
                  "rounded-md border p-0.5 transition-colors hover:bg-accent",
                  b.id === source ? "border-primary bg-primary/10" : "bg-card/60",
                )}
              >
                <RemoteIcon src={b.icon} className="size-7" />
                <span className="sr-only">{b.name}</span>
              </button>
            ))}
          </div>
          <div className="max-h-[55svh] overflow-y-auto">
            {source === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Choisissez une classe.
              </p>
            ) : !buffSpells ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Chargement des sorts…
              </p>
            ) : buffSpells.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucun sort de boost pour cette classe à ce niveau.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {buffSpells.map(({ spell, grade }) => {
                  const lines = grade!.buffs!;
                  const added = value.some((b) => b.spellId === spell.id);
                  const turns = [...new Set(lines.map((l) => l.duration))];
                  return (
                    <li
                      key={spell.id}
                      className="flex items-center gap-2 rounded-md border bg-card/70 p-2"
                    >
                      <RemoteIcon src={spell.icon} className="size-8 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {spell.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {grade!.apCost} PA · {turns.map(duration).join(" / ")}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {lines.map((line, i) => (
                            <BuffLineChip key={i} line={line} />
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={added ? "outline" : "default"}
                        disabled={added}
                        onClick={() => add(spell, lines)}
                      >
                        {added ? "Ajouté" : "Ajouter"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
