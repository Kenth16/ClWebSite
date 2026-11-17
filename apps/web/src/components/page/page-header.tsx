import type { IconKey } from "@kenpai/content";
import { CatalogIcon } from "@/components/icons";

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: IconKey;
}) {
  return (
    <header className="flex items-start gap-4">
      {icon && (
        <span className="frame-gilded mt-1 hidden size-12 shrink-0 items-center justify-center rounded-xl bg-card text-primary sm:flex">
          <CatalogIcon name={icon} className="size-6" />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="rune" aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}

/** Titre de section avec un filet doré. */
export function SectionTitle({
  id,
  children,
  action,
}: {
  id?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 id={id} className="flex items-center gap-3 text-2xl font-semibold">
        {children}
      </h2>
      {action}
    </div>
  );
}
