import {
  Anchor,
  ArrowRightFromLine,
  BowArrow,
  CircleDot,
  CircleMinus,
  Crosshair,
  Droplet,
  Flame,
  Percent,
  Footprints,
  Ghost,
  Hand,
  Heart,
  HeartPulse,
  Moon,
  Mountain,
  Rabbit,
  Search,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Star,
  Sword,
  Swords,
  Target,
  Timer,
  WandSparkles,
  Weight,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { STATS, type DofusEffect, type StatKey } from "@kenpai/shared";
import { cn } from "@/lib/utils";

const tone = {
  neutral: "text-el-neutral",
  earth: "text-el-earth",
  fire: "text-el-fire",
  water: "text-el-water",
  air: "text-el-air",
  life: "text-el-life",
  wisdom: "text-el-wisdom",
  ap: "text-el-ap",
  mp: "text-el-mp",
  power: "text-el-power",
  muted: "text-muted-foreground",
} as const;

/** Icône et couleur de chaque caractéristique. */
const STAT_ICONS: Record<StatKey, { icon: LucideIcon; tone: keyof typeof tone }> = {
  vitality: { icon: Heart, tone: "life" },
  wisdom: { icon: Moon, tone: "wisdom" },
  strength: { icon: Mountain, tone: "earth" },
  intelligence: { icon: Flame, tone: "fire" },
  chance: { icon: Droplet, tone: "water" },
  agility: { icon: Wind, tone: "air" },
  power: { icon: Zap, tone: "power" },
  ap: { icon: Star, tone: "ap" },
  mp: { icon: Footprints, tone: "mp" },
  range: { icon: Crosshair, tone: "air" },
  summons: { icon: Ghost, tone: "wisdom" },
  critical: { icon: Target, tone: "fire" },
  heals: { icon: HeartPulse, tone: "life" },
  initiative: { icon: Timer, tone: "wisdom" },
  prospecting: { icon: Search, tone: "water" },
  pods: { icon: Weight, tone: "muted" },
  lock: { icon: Anchor, tone: "air" },
  dodge: { icon: Rabbit, tone: "air" },
  apParry: { icon: ShieldCheck, tone: "ap" },
  mpParry: { icon: ShieldCheck, tone: "mp" },
  apReduction: { icon: CircleMinus, tone: "ap" },
  mpReduction: { icon: CircleMinus, tone: "mp" },
  damage: { icon: Swords, tone: "power" },
  neutralDamage: { icon: CircleDot, tone: "neutral" },
  earthDamage: { icon: Mountain, tone: "earth" },
  fireDamage: { icon: Flame, tone: "fire" },
  waterDamage: { icon: Droplet, tone: "water" },
  airDamage: { icon: Wind, tone: "air" },
  criticalDamage: { icon: Target, tone: "fire" },
  pushbackDamage: { icon: ArrowRightFromLine, tone: "earth" },
  weaponDamagePct: { icon: Sword, tone: "power" },
  spellDamagePct: { icon: WandSparkles, tone: "wisdom" },
  meleeDamagePct: { icon: Hand, tone: "earth" },
  rangedDamagePct: { icon: BowArrow, tone: "air" },
  finalDamagePct: { icon: Percent, tone: "power" },
  neutralRes: { icon: Shield, tone: "neutral" },
  earthRes: { icon: Shield, tone: "earth" },
  fireRes: { icon: Shield, tone: "fire" },
  waterRes: { icon: Shield, tone: "water" },
  airRes: { icon: Shield, tone: "air" },
  criticalRes: { icon: Shield, tone: "life" },
  pushbackRes: { icon: Shield, tone: "muted" },
  neutralResPct: { icon: ShieldHalf, tone: "neutral" },
  earthResPct: { icon: ShieldHalf, tone: "earth" },
  fireResPct: { icon: ShieldHalf, tone: "fire" },
  waterResPct: { icon: ShieldHalf, tone: "water" },
  airResPct: { icon: ShieldHalf, tone: "air" },
  meleeResPct: { icon: Hand, tone: "muted" },
  rangedResPct: { icon: BowArrow, tone: "muted" },
  weaponResPct: { icon: Sword, tone: "muted" },
  spellResPct: { icon: WandSparkles, tone: "muted" },
};

export function StatIcon({ stat, className }: { stat: StatKey; className?: string }) {
  const { icon: Icon, tone: t } = STAT_ICONS[stat];
  return <Icon className={cn("size-4 shrink-0", tone[t], className)} aria-hidden="true" />;
}

/** Couleur de texte associée à une caractéristique. */
export function statTone(stat: StatKey) {
  return tone[STAT_ICONS[stat].tone];
}

/** Ligne d'effet avec son icône (bonus de panoplie, effets d'objet). */
export function EffectRow({ effect, className }: { effect: DofusEffect; className?: string }) {
  if (!effect.stat) {
    return (
      <li className={cn("whitespace-pre-line text-muted-foreground italic", className)}>
        {effect.text}
      </li>
    );
  }
  return (
    <li className={cn("flex items-center gap-1.5", className)}>
      <StatIcon stat={effect.stat} className="size-3.5" />
      <span className={cn("font-semibold tabular-nums", effect.value < 0 && "text-destructive")}>
        {effect.value > 0 ? `+${effect.value}` : effect.value}
      </span>
      <span className="truncate">{STATS[effect.stat]}</span>
    </li>
  );
}
