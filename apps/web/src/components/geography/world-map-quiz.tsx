"use client";

import * as React from "react";
import { Loader2, Minus, Plus, RotateCcw, SkipForward, Target } from "lucide-react";
import { UN_MEMBERS } from "@kenpai/content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MapCountry {
  id: string;
  d: string;
  cx: number;
  cy: number;
  /** Trop petit pour être cliqué : un rond est ajouté par-dessus. */
  small: boolean;
}

interface WorldMap {
  width: number;
  height: number;
  countries: MapCountry[];
  /** Territoires non membres de l'ONU : affichés, mais pas cliquables. */
  others: string[];
}

type Status = "found" | "missed";
type Box = { x: number; y: number; w: number; h: number };

/** Après ce nombre d'erreurs sur un même pays, il est montré puis on passe au suivant. */
const TRIES = 3;
const NAME = new Map(UN_MEMBERS.map((m) => [m.id, m.name]));

function shuffle<T>(list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Carte du monde interactive : un pays est annoncé, il faut cliquer dessus.
 * Molette ou boutons pour zoomer, glisser pour se déplacer.
 */
export function WorldMapQuiz() {
  const [map, setMap] = React.useState<WorldMap | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [queue, setQueue] = React.useState<string[]>(() => shuffle(UN_MEMBERS.map((m) => m.id)));
  const [status, setStatus] = React.useState<Record<string, Status>>({});
  const [errors, setErrors] = React.useState(0);
  const [tries, setTries] = React.useState(0);
  const [flash, setFlash] = React.useState<{ id: string; ok: boolean } | null>(null);
  const [reveal, setReveal] = React.useState<string | null>(null);
  const [box, setBox] = React.useState<Box | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);

  React.useEffect(() => {
    fetch("/geo/world.json")
      .then((r) => (r.ok ? (r.json() as Promise<WorldMap>) : Promise.reject(new Error())))
      .then((data) => {
        setMap(data);
        setBox({ x: 0, y: 0, w: data.width, h: data.height });
      })
      .catch(() => setLoadError(true));
  }, []);

  const restart = React.useCallback(() => {
    setQueue(shuffle(UN_MEMBERS.map((m) => m.id)));
    setStatus({});
    setErrors(0);
    setTries(0);
    setFlash(null);
    setReveal(null);
  }, []);

  const target = queue[0] ?? null;
  const done = Object.keys(status).length;
  const found = Object.values(status).filter((s) => s === "found").length;
  const finished = map !== null && queue.length === 0 && done > 0;

  /** Passe au pays suivant ; le pays courant est marqué trouvé ou manqué. */
  const next = (result: Status) => {
    if (!target) return;
    setStatus((s) => ({ ...s, [target]: result }));
    setQueue((q) => q.slice(1));
    setTries(0);
  };

  const showAndSkip = () => {
    if (!target || reveal) return;
    setReveal(target);
    window.setTimeout(() => {
      setReveal(null);
      next("missed");
    }, 1400);
  };

  function onCountryClick(id: string) {
    if (drag.current?.moved || !target || reveal || status[id]) return;
    if (id === target) {
      setFlash({ id, ok: true });
      next("found");
    } else {
      setFlash({ id, ok: false });
      setErrors((e) => e + 1);
      const t = tries + 1;
      setTries(t);
      if (t >= TRIES) showAndSkip();
    }
    window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 600);
  }

  // ── Zoom et déplacement ───────────────────────────────────────────────
  const zoom = React.useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      if (!map) return;
      setBox((b) => {
        if (!b) return b;
        const w = Math.min(map.width, Math.max(map.width / 40, b.w / factor));
        const h = (w / map.width) * map.height;
        const px = at?.x ?? b.x + b.w / 2;
        const py = at?.y ?? b.y + b.h / 2;
        const x = px - ((px - b.x) / b.w) * w;
        const y = py - ((py - b.y) / b.h) * h;
        return clampBox({ x, y, w, h }, map);
      });
    },
    [map],
  );

  /** Coordonnées de la carte sous le pointeur. */
  const toMap = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || !box) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: box.x + ((clientX - r.left) / r.width) * box.w,
      y: box.y + ((clientY - r.top) / r.height) * box.h,
    };
  };

  // La molette zoome sur la carte sans faire défiler la page.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      setBox((b) => {
        if (!b || !map) return b;
        const at = {
          x: b.x + ((e.clientX - r.left) / r.width) * b.w,
          y: b.y + ((e.clientY - r.top) / r.height) * b.h,
        };
        const factor = e.deltaY < 0 ? 1.25 : 0.8;
        const w = Math.min(map.width, Math.max(map.width / 40, b.w / factor));
        const h = (w / map.width) * map.height;
        return clampBox(
          { x: at.x - ((at.x - b.x) / b.w) * w, y: at.y - ((at.y - b.y) / b.h) * h, w, h },
          map,
        );
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [map]);

  if (loadError) {
    return <p className="text-sm text-destructive">La carte n&apos;a pas pu être chargée.</p>;
  }
  if (!map || !box) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement de la carte…
      </p>
    );
  }

  const scale = box.w / map.width; // < 1 quand on zoome
  const fillOf = (id: string) => {
    if (reveal === id) return "fill-gold animate-pulse";
    if (flash?.id === id) return flash.ok ? "fill-primary" : "fill-destructive";
    if (status[id] === "found") return "fill-primary/70";
    if (status[id] === "missed") return "fill-destructive/45";
    return "fill-card hover:fill-accent";
  };

  return (
    <div className="grid gap-3">
      {/* Encadré : pays à trouver et score */}
      <div className="frame-gilded sticky top-16 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-popover/95 p-4 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1" aria-live="polite">
          {finished ? (
            <p className="font-serif text-2xl font-semibold">
              Terminé : {found} / {UN_MEMBERS.length} pays trouvés
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Target className="size-4" aria-hidden="true" />
                Cliquez sur
              </p>
              <p className="font-serif text-3xl font-semibold">{target ? NAME.get(target) : "…"}</p>
            </>
          )}
        </div>
        <dl className="flex gap-5 text-sm tabular-nums">
          <div>
            <dt className="text-muted-foreground">Trouvés</dt>
            <dd className="text-lg font-semibold text-primary">{found}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Erreurs</dt>
            <dd className="text-lg font-semibold text-destructive">{errors}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pays</dt>
            <dd className="text-lg font-semibold">
              {done} / {UN_MEMBERS.length}
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          {!finished && (
            <Button variant="outline" size="sm" onClick={showAndSkip} disabled={!!reveal}>
              <SkipForward aria-hidden="true" />
              Passer
            </Button>
          )}
          <Button variant={finished ? "default" : "ghost"} size="sm" onClick={restart}>
            <RotateCcw aria-hidden="true" />
            Recommencer
          </Button>
        </div>
        {!finished && tries > 0 && (
          <p className="w-full text-xs text-muted-foreground">
            Raté ({tries} / {TRIES}) : au bout de {TRIES} erreurs, le pays est montré.
          </p>
        )}
      </div>

      {/* Carte */}
      <div className="relative overflow-hidden rounded-xl border bg-[color-mix(in_oklab,var(--el-water)_14%,var(--background))]">
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className="block aspect-[1000/520] w-full touch-none select-none"
          role="img"
          aria-label="Carte du monde"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, box, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || e.buttons === 0) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 5) return;
            if (!d.moved) {
              d.moved = true;
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            }
            const r = e.currentTarget.getBoundingClientRect();
            setBox(
              clampBox(
                {
                  ...d.box,
                  x: d.box.x - (dx / r.width) * d.box.w,
                  y: d.box.y - (dy / r.height) * d.box.h,
                },
                map,
              ),
            );
          }}
          onPointerUp={() => {
            // Le clic qui termine un glissement ne compte pas comme une réponse.
            window.setTimeout(() => (drag.current = null), 0);
          }}
          onDoubleClick={(e) => zoom(2, toMap(e.clientX, e.clientY))}
        >
          <g className="stroke-border" strokeWidth={0.4 * scale} strokeLinejoin="round">
            {map.others.map((d, i) => (
              <path key={i} d={d} className="fill-muted" />
            ))}
            {map.countries.map((c) => (
              <path
                key={c.id}
                d={c.d}
                className={cn("cursor-pointer transition-colors", fillOf(c.id))}
                onClick={() => onCountryClick(c.id)}
              >
                {status[c.id] && <title>{NAME.get(c.id)}</title>}
              </path>
            ))}
            {map.countries
              .filter((c) => c.small)
              .map((c) => (
                <circle
                  key={`dot-${c.id}`}
                  cx={c.cx}
                  cy={c.cy}
                  r={Math.max(1.2, 4 * scale)}
                  strokeWidth={0.6 * scale}
                  className={cn(
                    "cursor-pointer stroke-foreground/60 transition-colors",
                    fillOf(c.id),
                  )}
                  onClick={() => onCountryClick(c.id)}
                >
                  {status[c.id] && <title>{NAME.get(c.id)}</title>}
                </circle>
              ))}
          </g>
        </svg>
        <div className="absolute right-2 bottom-2 flex flex-col gap-1">
          <Button size="icon" variant="outline" aria-label="Zoomer" onClick={() => zoom(1.6)}>
            <Plus aria-hidden="true" />
          </Button>
          <Button size="icon" variant="outline" aria-label="Dézoomer" onClick={() => zoom(1 / 1.6)}>
            <Minus aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Vue complète"
            onClick={() => setBox({ x: 0, y: 0, w: map.width, h: map.height })}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Molette, double-clic ou boutons pour zoomer ; glisser pour se déplacer. Les petits pays
        (îles, micro-États) sont marqués d&apos;un rond. Les territoires en gris ne sont pas membres
        de l&apos;ONU. Fond de carte : Natural Earth.
      </p>
    </div>
  );
}

/** Garde la vue à l'intérieur de la carte. */
function clampBox(b: Box, map: WorldMap): Box {
  return {
    ...b,
    x: Math.min(Math.max(0, b.x), map.width - b.w),
    y: Math.min(Math.max(0, b.y), map.height - b.h),
  };
}
