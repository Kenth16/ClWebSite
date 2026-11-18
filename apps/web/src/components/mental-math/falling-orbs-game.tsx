"use client";

import * as React from "react";
import { Delete, Heart, Pause, Play, RotateCcw, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LIVES,
  generateProblem,
  levelConfig,
  levelFor,
  pointsFor,
  problemText,
  type Problem,
} from "./engine";

type Phase = "intro" | "playing" | "paused" | "over";

interface Orb {
  id: number;
  problem: Problem;
  /** Instant d'apparition, en temps de jeu (ms, hors pauses). */
  spawnAt: number;
  fallMs: number;
  /** Position horizontale du centre, en % de la largeur. */
  x: number;
  golden: boolean;
}

interface Stats {
  score: number;
  level: number;
  lives: number;
  correct: number;
  wrong: number;
  streak: number;
  bestStreak: number;
}

interface Effect {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: "gain" | "loss";
}

const BEST_KEY = "kenpai:calcul-mental:meilleur-score";
const SLOTS = [12, 25, 38, 50, 62, 75, 88];
const GOLDEN_CHANCE = 1 / 12;

const initialStats = (): Stats => ({
  score: 0,
  level: 1,
  lives: LIVES,
  correct: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
});

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Stockage indisponible (navigation privée…) : le record n'est pas conservé.
  }
}

const noSubscription = () => () => {};
const COARSE_QUERY = "(pointer: coarse)";
const isCoarse = () => window.matchMedia(COARSE_QUERY).matches;
function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function FallingOrbsGame() {
  const [phase, setPhase] = React.useState<Phase>("intro");
  const [orbs, setOrbs] = React.useState<Orb[]>([]);
  const [stats, setStats] = React.useState<Stats>(initialStats);
  const [effects, setEffects] = React.useState<Effect[]>([]);
  const [answer, setAnswer] = React.useState("");
  const [newRecord, setNewRecord] = React.useState(false);
  // Record local (relu à chaque rendu) et écran tactile : sources externes à React.
  const best = React.useSyncExternalStore(noSubscription, readBest, () => 0);
  const coarse = React.useSyncExternalStore(subscribeCoarse, isCoarse, () => false);

  // État mutable lu à chaque image, sans provoquer de rendu.
  const game = React.useRef({
    time: 0,
    lastSpawn: -Infinity,
    orbs: [] as Orb[],
    stats: initialStats(),
    nextId: 1,
  });
  const areaRef = React.useRef<HTMLDivElement>(null);
  const groundRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const orbEls = React.useRef(new Map<number, HTMLDivElement>());
  const fallHeight = React.useRef(400);

  // Hauteur de chute disponible : zone de jeu moins le sol et la taille d'un orbe.
  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const ground = groundRef.current?.offsetHeight ?? 40;
      const orbSize = area.offsetWidth < 640 ? 84 : 96;
      fallHeight.current = Math.max(120, area.clientHeight - ground - orbSize);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const place = React.useCallback((el: HTMLDivElement, orb: Orb) => {
    const progress = Math.min(1, (game.current.time - orb.spawnAt) / orb.fallMs);
    el.style.transform = `translate(-50%, ${progress * fallHeight.current}px)`;
    el.dataset.danger = progress > 0.75 ? "true" : "false";
  }, []);

  const addEffect = React.useCallback((effect: Omit<Effect, "id">) => {
    const id = game.current.nextId++;
    setEffects((list) => [...list, { ...effect, id }]);
    setTimeout(() => setEffects((list) => list.filter((e) => e.id !== id)), 800);
  }, []);

  const publish = React.useCallback(() => {
    setOrbs([...game.current.orbs]);
    setStats({ ...game.current.stats });
  }, []);

  const endGame = React.useCallback(() => {
    const { score } = game.current.stats;
    const previous = readBest();
    if (score > previous) {
      saveBest(score);
      setNewRecord(true);
    }
    setPhase("over");
  }, []);

  // Boucle de jeu : ne tourne que pendant une partie en cours.
  React.useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const g = game.current;
      g.time += Math.min(100, now - last); // évite un saut après un ralentissement
      last = now;
      const config = levelConfig(g.stats.level);
      let changed = false;

      // Orbes arrivés au sol.
      const landed = g.orbs.filter((o) => g.time - o.spawnAt >= o.fallMs);
      if (landed.length > 0) {
        g.orbs = g.orbs.filter((o) => !landed.includes(o));
        g.stats.lives = Math.max(0, g.stats.lives - landed.length);
        g.stats.streak = 0;
        for (const orb of landed) {
          addEffect({
            x: orb.x,
            y: fallHeight.current + 40,
            text: `${problemText(orb.problem)} = ${orb.problem.answer}`,
            kind: "loss",
          });
        }
        groundRef.current?.animate(
          [
            { backgroundColor: "color-mix(in srgb, var(--destructive) 40%, transparent)" },
            { backgroundColor: "transparent" },
          ],
          { duration: 600, easing: "ease-out" },
        );
        changed = true;
      }

      // Nouvel orbe.
      const due = g.orbs.length === 0 || g.time - g.lastSpawn >= config.spawnMs;
      if (due && g.orbs.length < config.maxOrbs && g.stats.lives > 0) {
        const busy = g.orbs.filter((o) => (g.time - o.spawnAt) / o.fallMs < 0.4).map((o) => o.x);
        const free = SLOTS.filter((x) => !busy.includes(x));
        const slots = free.length > 0 ? free : SLOTS;
        g.orbs.push({
          id: g.nextId++,
          problem: generateProblem(g.stats.level),
          spawnAt: g.time,
          fallMs: config.fallMs,
          x: slots[Math.floor(Math.random() * slots.length)] ?? 50,
          golden: g.stats.level >= 2 && Math.random() < GOLDEN_CHANCE,
        });
        g.lastSpawn = g.time;
        changed = true;
      }

      for (const orb of g.orbs) {
        const el = orbEls.current.get(orb.id);
        if (el) place(el, orb);
      }

      if (changed) publish();
      if (g.stats.lives <= 0) {
        endGame();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, place, publish, addEffect, endGame]);

  // Pause automatique quand l'onglet est masqué ; Échap met en pause / reprend.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setPhase((p) => (p === "playing" ? "paused" : p));
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (phase === "playing" && !coarse) inputRef.current?.focus();
  }, [phase, coarse]);

  function start() {
    game.current = {
      time: 0,
      lastSpawn: -Infinity,
      orbs: [],
      stats: initialStats(),
      nextId: 1,
    };
    orbEls.current.clear();
    setEffects([]);
    setAnswer("");
    setNewRecord(false);
    publish();
    setPhase("playing");
  }

  function submit(raw: string) {
    if (phase !== "playing" || raw === "") return;
    const value = Number(raw);
    setAnswer("");
    const g = game.current;
    // Si plusieurs orbes ont la même réponse, on éclate le plus bas.
    const target = g.orbs
      .filter((o) => o.problem.answer === value)
      .sort((a, b) => (g.time - b.spawnAt) / b.fallMs - (g.time - a.spawnAt) / a.fallMs)[0];

    if (!target) {
      g.stats.wrong++;
      g.stats.streak = 0;
      inputRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 280 },
      );
      publish();
      return;
    }

    const progress = Math.min(1, (g.time - target.spawnAt) / target.fallMs);
    const points = pointsFor({
      level: g.stats.level,
      progress,
      streak: g.stats.streak,
      golden: target.golden,
    });
    g.orbs = g.orbs.filter((o) => o !== target);
    g.stats.score += points;
    g.stats.correct++;
    g.stats.streak++;
    g.stats.bestStreak = Math.max(g.stats.bestStreak, g.stats.streak);
    const level = levelFor(g.stats.correct);
    if (level > g.stats.level) {
      g.stats.level = level;
      addEffect({ x: 50, y: fallHeight.current / 2, text: `Niveau ${level} !`, kind: "gain" });
    }
    addEffect({
      x: target.x,
      y: progress * fallHeight.current + 30,
      text: `+${points}`,
      kind: "gain",
    });
    publish();
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(answer);
    if (!coarse) inputRef.current?.focus();
  }

  const accuracy =
    stats.correct + stats.wrong > 0
      ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Tableau de bord */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card/70 px-4 py-3">
        <HudValue label="Score" value={stats.score.toLocaleString("fr-FR")} />
        <HudValue label="Niveau" value={stats.level} />
        <HudValue label="Série" value={stats.streak} />
        <div className="flex items-center gap-1" aria-label={`${stats.lives} vies restantes`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart
              key={i}
              aria-hidden="true"
              className={cn(
                "size-5 transition-colors",
                i < stats.lives ? "fill-destructive text-destructive" : "text-muted-foreground/40",
              )}
            />
          ))}
        </div>
        <div className="ml-auto">
          {phase === "playing" && (
            <Button variant="outline" size="sm" onClick={() => setPhase("paused")}>
              <Pause aria-hidden="true" />
              Pause
            </Button>
          )}
        </div>
      </div>

      {/* Zone de jeu */}
      <div
        ref={areaRef}
        onPointerDown={() => !coarse && phase === "playing" && inputRef.current?.focus()}
        className="frame-gilded bg-sky relative h-[min(64svh,560px)] min-h-[360px] touch-manipulation overflow-hidden rounded-2xl border select-none"
      >
        <div aria-hidden={phase !== "playing"}>
          {orbs.map((orb) => (
            <div
              key={orb.id}
              ref={(el) => {
                if (el) {
                  orbEls.current.set(orb.id, el);
                  place(el, orb);
                } else {
                  orbEls.current.delete(orb.id);
                }
              }}
              style={{ left: `${orb.x}%` }}
              className={cn(
                "group absolute top-0 flex size-[84px] items-center justify-center rounded-full font-serif text-lg font-semibold tabular-nums shadow-md will-change-transform sm:size-24 sm:text-xl",
                "ring-2 transition-[box-shadow] duration-300",
                orb.golden
                  ? "bg-[radial-gradient(circle_at_32%_28%,var(--card)_0%,color-mix(in_srgb,var(--gold)_35%,var(--card))_75%)] ring-gold"
                  : "bg-[radial-gradient(circle_at_32%_28%,var(--card)_0%,color-mix(in_srgb,var(--primary)_22%,var(--card))_75%)] ring-primary/45",
                "data-[danger=true]:ring-destructive/70",
              )}
            >
              <span className="px-1 text-center leading-tight whitespace-nowrap">
                {problemText(orb.problem)}
              </span>
            </div>
          ))}

          {effects.map((effect) => (
            <span
              key={effect.id}
              style={{ left: `${effect.x}%`, top: effect.y }}
              className={cn(
                "animate-float-away pointer-events-none absolute z-10 font-serif text-lg font-bold whitespace-nowrap",
                effect.kind === "gain" ? "text-primary" : "text-destructive",
              )}
            >
              {effect.text}
            </span>
          ))}
        </div>

        {/* Sol */}
        <div
          ref={groundRef}
          className="absolute inset-x-0 bottom-0 h-10 border-t-2 border-gold/50 bg-[repeating-linear-gradient(135deg,var(--gold-soft)_0_6px,transparent_6px_14px)]"
        />

        {phase === "intro" && (
          <Overlay>
            <h2 className="text-3xl font-semibold">Chute d&apos;orbes</h2>
            <ul className="mt-3 max-w-sm space-y-1.5 text-left text-[0.95rem] text-muted-foreground">
              <li>• Des orbes portant une opération tombent du ciel.</li>
              <li>• Tapez le résultat puis Entrée pour faire éclater l&apos;orbe.</li>
              <li>• Plus vous êtes rapide, plus vous marquez de points.</li>
              <li>• Les orbes dorés valent le triple.</li>
              <li>• Trois orbes au sol et la partie s&apos;arrête.</li>
            </ul>
            {best > 0 && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-sm">
                <Trophy className="size-4 text-gold" aria-hidden="true" />
                Meilleur score : <strong>{best.toLocaleString("fr-FR")}</strong>
              </p>
            )}
            <Button size="lg" className="mt-5" onClick={start}>
              <Play aria-hidden="true" />
              Commencer
            </Button>
            {!coarse && <p className="mt-3 text-xs text-muted-foreground">Échap : pause</p>}
          </Overlay>
        )}

        {phase === "paused" && (
          <Overlay>
            <h2 className="text-3xl font-semibold">Pause</h2>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={() => setPhase("playing")}>
                <Play aria-hidden="true" />
                Reprendre
              </Button>
              <Button size="lg" variant="outline" onClick={endGame}>
                Terminer la partie
              </Button>
            </div>
          </Overlay>
        )}

        {phase === "over" && (
          <Overlay>
            <h2 className="text-3xl font-semibold">Partie terminée</h2>
            <p className="mt-2 font-serif text-5xl font-bold text-primary tabular-nums">
              {stats.score.toLocaleString("fr-FR")}
            </p>
            {newRecord ? (
              <Badge className="mt-2">
                <Trophy className="size-3" aria-hidden="true" />
                Nouveau record !
              </Badge>
            ) : (
              best > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Record : {best.toLocaleString("fr-FR")}
                </p>
              )
            )}
            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-left text-sm sm:grid-cols-4">
              <Stat label="Bonnes réponses" value={stats.correct} />
              <Stat label="Précision" value={`${accuracy} %`} />
              <Stat label="Niveau atteint" value={stats.level} />
              <Stat label="Meilleure série" value={stats.bestStreak} />
            </dl>
            <Button size="lg" className="mt-6" onClick={start}>
              <RotateCcw aria-hidden="true" />
              Rejouer
            </Button>
          </Overlay>
        )}
      </div>

      {/* Saisie */}
      <form onSubmit={onSubmit} className="mx-auto grid max-w-md gap-3">
        <div className="flex gap-2">
          <label htmlFor="reponse" className="sr-only">
            Votre réponse
          </label>
          <input
            id="reponse"
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode={coarse ? "none" : "numeric"}
            readOnly={coarse}
            autoComplete="off"
            disabled={phase !== "playing"}
            placeholder={phase === "playing" ? "Réponse…" : ""}
            className="h-12 min-w-0 flex-1 rounded-md border border-input bg-card px-4 text-center font-serif text-2xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button type="submit" size="lg" className="h-12" disabled={phase !== "playing"}>
            Valider
          </Button>
        </div>
        {coarse && (
          <Keypad
            disabled={phase !== "playing"}
            onDigit={(d) => setAnswer((a) => (a + d).slice(0, 4))}
            onErase={() => setAnswer((a) => a.slice(0, -1))}
          />
        )}
      </form>
    </div>
  );
}

function HudValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="leading-tight">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-serif text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-serif text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-[2px] animate-in fade-in-0 duration-200">
      {children}
    </div>
  );
}

function Keypad({
  disabled,
  onDigit,
  onErase,
}: {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onErase: () => void;
}) {
  const key =
    "h-12 rounded-md border border-input bg-card/80 font-serif text-xl font-semibold active:bg-accent disabled:opacity-50";
  return (
    <div className="grid grid-cols-5 gap-2" aria-label="Pavé numérique">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
        <button
          key={d}
          type="button"
          className={key}
          disabled={disabled}
          onClick={() => onDigit(d)}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        className={cn(key, "col-span-5 flex items-center justify-center gap-2 text-base")}
        disabled={disabled}
        onClick={onErase}
        aria-label="Effacer le dernier chiffre"
      >
        <Delete className="size-5" aria-hidden="true" />
        Effacer
      </button>
    </div>
  );
}
