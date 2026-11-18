import type { IconKey } from "@kenpai/content";
import {
  Amphora,
  Calculator,
  Castle,
  Crown,
  Egg,
  Earth,
  Feather,
  Flag,
  House,
  Landmark,
  Map as MapIcon,
  MapPinned,
  PenLine,
  Puzzle,
  Pyramid,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  ThumbsDown,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Association entre les clés d'icônes du catalogue et les icônes affichées. */
export const icons: Record<IconKey, LucideIcon> = {
  home: House,
  geography: MapIcon,
  countries: Earth,
  capitals: Landmark,
  flags: Flag,
  departments: MapPinned,
  history: ScrollText,
  france: Crown,
  greece: Amphora,
  egypt: Pyramid,
  rome: Swords,
  medieval: Castle,
  french: Feather,
  dictation: PenLine,
  games: Puzzle,
  math: Calculator,
  quiz: Trophy,
  general: Sparkles,
  friends: Users,
  reviews: ThumbsDown,
  dofus: Egg,
  equipment: Shield,
  profile: UserRound,
};

export function CatalogIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" />;
}
