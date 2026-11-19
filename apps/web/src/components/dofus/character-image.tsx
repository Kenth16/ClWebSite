"use client";

import * as React from "react";
import { ImagePlus, Loader2, Trash2, UserRound } from "lucide-react";
import { BUILD_IMAGE_MAX_CHARS, BUILD_IMAGE_SIZE } from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/**
 * Réduit une image dans le navigateur (côté maximal BUILD_IMAGE_SIZE) et la
 * renvoie en data URL WebP (ou JPEG si WebP n'est pas pris en charge).
 */
async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, BUILD_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= BUILD_IMAGE_MAX_CHARS) return url;
  }
  throw new Error("Image trop lourde, même réduite.");
}

/** Image du personnage au centre du simulateur : ajout, remplacement, retrait. */
export function CharacterImage({
  image,
  onChange,
  className,
}: {
  image: string | null;
  onChange: (image: string | null) => void;
  className?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Format accepté : PNG, JPEG ou WebP.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await resizeImage(file));
    } catch {
      setError("Impossible de lire cette image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("group relative flex flex-col items-center", className)}>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- image locale (data URL) */}
          <img
            src={image}
            alt="Personnage"
            className="max-h-56 w-auto max-w-full object-contain drop-shadow-lg"
            draggable={false}
          />
          <div className="mt-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              Changer
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Retirer l'image"
              title="Retirer l'image"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex h-44 w-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/40 bg-background/40 px-3 text-center text-sm text-muted-foreground transition-colors hover:border-gold/70 hover:bg-accent hover:text-foreground"
        >
          {busy ? (
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          ) : (
            <UserRound className="size-10 text-gold/70" aria-hidden="true" />
          )}
          <span className="font-medium">Ajouter une image du personnage</span>
          <span className="text-xs">PNG, JPEG ou WebP</span>
        </button>
      )}
      {error && <p className="mt-1.5 text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
