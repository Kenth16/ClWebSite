import { AVATARS, type AvatarKey } from "@kenpai/shared";
import { cn } from "@/lib/utils";

const labels = Object.fromEntries(AVATARS.map((a) => [a.key, a.label])) as Record<
  AvatarKey,
  string
>;

/** Avatar circulaire d'un utilisateur. `alt` vide quand le nom est déjà affiché à côté. */
export function UserAvatar({
  avatar,
  alt = "",
  className,
}: {
  avatar: AvatarKey;
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- petites images SVG locales, aucune optimisation utile
    <img
      src={`/avatars/${avatar}.svg`}
      alt={alt}
      title={alt || undefined}
      width={64}
      height={64}
      draggable={false}
      className={cn("size-8 shrink-0 rounded-full ring-1 ring-gold/35 select-none", className)}
    />
  );
}

export function avatarLabel(avatar: AvatarKey) {
  return labels[avatar];
}
