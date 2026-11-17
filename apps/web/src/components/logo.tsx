import { cn } from "@/lib/utils";

/**
 * Emblème de Kenpai : une étoile à quatre branches dans un anneau,
 * comme un sceau de grimoire. Dessin original.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-5", className)}>
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.55"
      />
      <circle
        cx="16"
        cy="16"
        r="9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.35"
      />
      <path
        d="M16 4.5 L18.1 13.9 L27.5 16 L18.1 18.1 L16 27.5 L13.9 18.1 L4.5 16 L13.9 13.9 Z"
        fill="currentColor"
      />
      <circle cx="16" cy="16" r="1.6" fill="#1b1e29" />
    </svg>
  );
}
