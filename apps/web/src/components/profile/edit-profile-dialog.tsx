"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import {
  AVATARS,
  USERNAME_MAX,
  USERNAME_MIN,
  type AvatarKey,
  type SessionUser,
  type UpdateProfileInput,
} from "@kenpai/shared";
import { FormAlert, FormField } from "@/components/auth/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function EditProfileDialog({ user, onSaved }: { user: SessionUser; onSaved?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [avatar, setAvatar] = React.useState<AvatarKey>(user.avatar);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Repart toujours des valeurs actuelles à l'ouverture.
      setAvatar(user.avatar);
      setError(null);
      setFields({});
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = String(new FormData(event.currentTarget).get("username") ?? "").trim();
    const changes: UpdateProfileInput = {};
    if (username !== user.username) changes.username = username;
    if (avatar !== user.avatar) changes.avatar = avatar;
    if (Object.keys(changes).length === 0) {
      setOpen(false);
      return;
    }

    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch<{ user: SessionUser }>("/users/me", { method: "PATCH", body: changes });
      setOpen(false);
      router.refresh();
      onSaved?.();
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError(0, "Une erreur inattendue est survenue.");
      setError(Object.keys(err.fields).length > 0 && !err.fields.avatar ? null : err.message);
      setFields(err.fields);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden="true" />
          Modifier le profil
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div>
          <DialogTitle>Modifier le profil</DialogTitle>
          <DialogDescription className="mt-1">
            Changez votre pseudo et votre avatar.
          </DialogDescription>
        </div>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          {error && <FormAlert>{error}</FormAlert>}
          <FormField
            name="username"
            label="Pseudo"
            defaultValue={user.username}
            autoComplete="username"
            required
            minLength={USERNAME_MIN}
            maxLength={USERNAME_MAX}
            hint={`${USERNAME_MIN} à ${USERNAME_MAX} caractères : lettres, chiffres, « _ », « - » ou « . ».`}
            error={fields.username}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Avatar</legend>
            <div className="grid grid-cols-5 gap-2.5">
              {AVATARS.map((option) => {
                const selected = option.key === avatar;
                return (
                  <label
                    key={option.key}
                    className={cn(
                      "relative mx-auto flex w-fit cursor-pointer justify-center rounded-full p-1 transition-[box-shadow,transform] duration-150",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      selected ? "ring-2 ring-primary" : "hover:scale-105",
                    )}
                  >
                    <input
                      type="radio"
                      name="avatar"
                      value={option.key}
                      checked={selected}
                      onChange={() => setAvatar(option.key)}
                      className="sr-only"
                    />
                    <UserAvatar avatar={option.key} alt={option.label} className="size-14 ring-0" />
                    {selected && (
                      <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {fields.avatar && <p className="text-sm text-destructive">{fields.avatar}</p>}
          </fieldset>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
