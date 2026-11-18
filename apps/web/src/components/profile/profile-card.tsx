"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import type { SessionUser } from "@kenpai/shared";
import { UserAvatar } from "@/components/user-avatar";
import { EditProfileDialog } from "./edit-profile-dialog";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function ProfileCard({ user }: { user: SessionUser }) {
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  return (
    <section
      aria-labelledby="profil-pseudo"
      className="frame-gilded relative overflow-hidden rounded-2xl border bg-card/70 p-6 sm:p-8"
    >
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <UserAvatar avatar={user.avatar} className="size-24 ring-2 ring-gold/50" />
        <div className="min-w-0 flex-1">
          <h1 id="profil-pseudo" className="truncate text-3xl font-semibold sm:text-4xl">
            {user.username}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Membre depuis le {dateFormat.format(new Date(user.createdAt))}
          </p>
        </div>
        <EditProfileDialog user={user} onSaved={() => setSaved(true)} />
      </div>
      <p role="status" className="min-h-0 text-sm">
        {saved && (
          <span className="mt-4 flex items-center justify-center gap-1.5 text-primary sm:justify-start">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Profil mis à jour.
          </span>
        )}
      </p>
    </section>
  );
}
