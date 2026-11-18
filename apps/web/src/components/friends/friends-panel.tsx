"use client";

import * as React from "react";
import { Check, Inbox, Send, UserMinus, UserPlus, Users, X } from "lucide-react";
import type { Friend, FriendRequest, FriendsOverview, PublicUser } from "@kenpai/shared";
import { FormField } from "@/components/auth/form-field";
import { EmptyState } from "@/components/page/empty-state";
import { SectionTitle } from "@/components/page/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Rafraîchissement de la liste (présence et nouvelles demandes). */
const REFRESH_MS = 20 * 1000;

type Notice = { kind: "success" | "error"; text: string } | null;

export function FriendsPanel({ initial }: { initial: FriendsOverview }) {
  const [data, setData] = React.useState(initial);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toRemove, setToRemove] = React.useState<Friend | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setData(await apiFetch<FriendsOverview>("/friends"));
    } catch {
      // Hors ligne ou session expirée : on garde la dernière liste connue.
    }
  }, []);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Exécute une action, affiche son résultat, puis recharge la liste. */
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", text: success });
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof ApiError ? e.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const online = data.friends.filter((f) => f.online).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="order-2 space-y-8 lg:order-1">
        <section aria-labelledby="amis-liste">
          <SectionTitle
            id="amis-liste"
            action={
              data.friends.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {online} en ligne sur {data.friends.length}
                </p>
              )
            }
          >
            Mes amis
          </SectionTitle>
          {data.friends.length === 0 ? (
            <EmptyState icon={Users} title="Aucun ami pour l'instant">
              Invitez vos camarades avec leur pseudo pour suivre leur présence.
            </EmptyState>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {data.friends.map((friend) => (
                <li key={friend.id}>
                  <PersonRow user={friend} online={friend.online}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Retirer ${friend.username} de mes amis`}
                      title="Retirer de mes amis"
                      onClick={() => setToRemove(friend)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <UserMinus aria-hidden="true" />
                    </Button>
                  </PersonRow>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.outgoing.length > 0 && (
          <section aria-labelledby="amis-envoyees">
            <SectionTitle id="amis-envoyees">Demandes envoyées</SectionTitle>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {data.outgoing.map((request) => (
                <li key={request.id}>
                  <PersonRow user={request.user} detail={`Invité ${relative(request)}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === request.id}
                      onClick={() =>
                        run(
                          request.id,
                          () => apiFetch(`/friends/requests/${request.id}`, { method: "DELETE" }),
                          `Demande à ${request.user.username} annulée.`,
                        )
                      }
                    >
                      Annuler
                    </Button>
                  </PersonRow>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="order-1 space-y-8 lg:order-2">
        <AddFriendForm
          onAdded={async (message) => {
            setNotice({ kind: "success", text: message });
            await refresh();
          }}
        />

        <section aria-labelledby="amis-recues">
          <SectionTitle
            id="amis-recues"
            action={data.incoming.length > 0 && <Badge>{data.incoming.length}</Badge>}
          >
            Demandes reçues
          </SectionTitle>
          {data.incoming.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-gold/35 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              <Inbox className="size-4 shrink-0" aria-hidden="true" />
              Aucune demande en attente.
            </p>
          ) : (
            <ul className="grid gap-2.5">
              {data.incoming.map((request) => (
                <li key={request.id}>
                  <PersonRow user={request.user} detail={`Reçue ${relative(request)}`}>
                    <Button
                      size="icon"
                      aria-label={`Accepter la demande de ${request.user.username}`}
                      title="Accepter"
                      disabled={busy === request.id}
                      onClick={() =>
                        run(
                          request.id,
                          () =>
                            apiFetch(`/friends/requests/${request.id}/accept`, { method: "POST" }),
                          `${request.user.username} fait maintenant partie de vos amis.`,
                        )
                      }
                    >
                      <Check aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Refuser la demande de ${request.user.username}`}
                      title="Refuser"
                      disabled={busy === request.id}
                      onClick={() =>
                        run(
                          request.id,
                          () =>
                            apiFetch(`/friends/requests/${request.id}/decline`, {
                              method: "POST",
                            }),
                          `Demande de ${request.user.username} refusée.`,
                        )
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </PersonRow>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p role="status" aria-live="polite" className="empty:hidden">
          {notice && (
            <span
              className={cn(
                "block rounded-md border px-3 py-2 text-sm",
                notice.kind === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {notice.text}
            </span>
          )}
        </p>
      </aside>

      <Dialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <DialogContent className="max-w-md">
          <div>
            <DialogTitle>Retirer {toRemove?.username} ?</DialogTitle>
            <DialogDescription className="mt-1">
              Vous ne verrez plus sa présence en ligne. Vous pourrez lui renvoyer une demande plus
              tard.
            </DialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button
              className="bg-destructive text-background hover:bg-destructive/90"
              disabled={busy !== null}
              onClick={async () => {
                const friend = toRemove;
                if (!friend) return;
                setToRemove(null);
                await run(
                  friend.id,
                  () => apiFetch(`/friends/${friend.id}`, { method: "DELETE" }),
                  `${friend.username} a été retiré de vos amis.`,
                );
              }}
            >
              <UserMinus aria-hidden="true" />
              Retirer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddFriendForm({ onAdded }: { onAdded: (message: string) => Promise<void> }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = String(new FormData(form).get("username") ?? "").trim();
    if (!username) {
      setError("Saisissez le pseudo de votre ami.");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const { status } = await apiFetch<{ status: "pending" | "accepted" }>("/friends/requests", {
        method: "POST",
        body: { username },
      });
      form.reset();
      await onAdded(
        status === "accepted"
          ? `${username} vous avait déjà invité : vous êtes maintenant amis !`
          : `Demande envoyée à ${username}.`,
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields.username ?? e.message)
          : "Une erreur inattendue est survenue.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="amis-ajouter"
      className="frame-gilded rounded-xl border bg-card/70 p-5"
    >
      <h2 id="amis-ajouter" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <UserPlus className="size-5 text-primary" aria-hidden="true" />
        Ajouter un ami
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-3">
        <FormField
          name="username"
          label="Pseudo"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          error={error}
        />
        <Button type="submit" disabled={pending}>
          <Send aria-hidden="true" />
          {pending ? "Envoi…" : "Envoyer la demande"}
        </Button>
      </form>
    </section>
  );
}

/** Ligne d'une personne : avatar (avec pastille de présence), pseudo, actions. */
function PersonRow({
  user,
  online,
  detail,
  children,
}: {
  user: PublicUser;
  online?: boolean;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/70 p-3">
      <span className="relative shrink-0">
        <UserAvatar avatar={user.avatar} className="size-11" />
        {online !== undefined && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-card",
              online ? "bg-primary" : "bg-muted-foreground/45",
            )}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.username}</p>
        <p
          className={cn(
            "truncate text-sm",
            online ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          {online !== undefined ? (online ? "En ligne" : "Hors ligne") : detail}
        </p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

function relative({ createdAt }: FriendRequest): string {
  const minutes = Math.round((new Date(createdAt).getTime() - Date.now()) / 60000);
  if (minutes > -1) return "à l'instant";
  if (minutes > -60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}
