"use client";

import * as React from "react";
import { Check, Inbox, Search, Send, UserMinus, UserPlus, Users, X } from "lucide-react";
import type { Friend, FriendRequest, FriendsOverview, PublicUser } from "@kenpai/shared";
import { FormField } from "@/components/auth/form-field";
import { EmptyState } from "@/components/page/empty-state";
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
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Rafraîchissement de la liste (présence et nouvelles demandes). */
const REFRESH_MS = 20 * 1000;

type Notice = { kind: "success" | "error"; text: string } | null;
type Tab = "friends" | "incoming" | "outgoing";

/** Grille de cartes, commune aux amis, aux demandes et aux squelettes. */
const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function FriendsPanel({ initial }: { initial: FriendsOverview }) {
  const [data, setData] = React.useState(initial);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toRemove, setToRemove] = React.useState<Friend | null>(null);
  const [tab, setTab] = React.useState<Tab>(
    initial.friends.length === 0 && initial.incoming.length > 0 ? "incoming" : "friends",
  );
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);

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

  const q = query.trim().toLocaleLowerCase("fr");
  const matches = (user: PublicUser) => !q || user.username.toLocaleLowerCase("fr").includes(q);
  // En ligne d'abord, puis par pseudo.
  const friends = data.friends
    .filter(matches)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  const incoming = data.incoming.filter((r) => matches(r.user));
  const outgoing = data.outgoing.filter((r) => matches(r.user));
  const online = data.friends.filter((f) => f.online).length;

  const tabs: { id: Tab; label: string; count: number; highlight?: boolean }[] = [
    { id: "friends", label: "Mes amis", count: data.friends.length },
    { id: "incoming", label: "Demandes reçues", count: data.incoming.length, highlight: true },
    { id: "outgoing", label: "Demandes envoyées", count: data.outgoing.length },
  ];

  return (
    <div className="space-y-5">
      {/* Barre d'en-tête : titre et compteur, onglets, recherche, ajout */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/70 p-3">
        <h2 className="flex items-center gap-2 pl-1 font-serif text-xl font-semibold">
          Amis
          <span className="rounded-md bg-primary px-2 py-0.5 font-sans text-sm font-semibold text-primary-foreground tabular-nums">
            {data.friends.length}
          </span>
        </h2>
        {data.friends.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            {online} en ligne
          </p>
        )}
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <span className="sr-only">Rechercher un ami</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un ami"
              className="h-9 pl-9 text-sm"
            />
          </label>
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <UserPlus aria-hidden="true" />
                Ajouter un ami
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <div>
                <DialogTitle>Ajouter un ami</DialogTitle>
                <DialogDescription className="mt-1">
                  Saisissez son pseudo : il recevra une demande d&apos;ami.
                </DialogDescription>
              </div>
              <AddFriendForm
                onAdded={async (message) => {
                  setAdding(false);
                  setNotice({ kind: "success", text: message });
                  setTab("outgoing");
                  await refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Listes">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors hover:bg-accent",
              tab === t.id
                ? "border-primary bg-primary/10 font-semibold"
                : "bg-card/60 text-muted-foreground",
            )}
          >
            {t.label}
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-xs tabular-nums",
                t.highlight && t.count > 0
                  ? "bg-destructive text-background"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

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

      {tab === "friends" &&
        (data.friends.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun ami pour l'instant"
            action={
              <Button onClick={() => setAdding(true)}>
                <UserPlus aria-hidden="true" />
                Ajouter un ami
              </Button>
            }
          >
            Invitez vos camarades avec leur pseudo pour suivre leur présence.
          </EmptyState>
        ) : friends.length === 0 ? (
          <NoMatch query={query} />
        ) : (
          <ul className={GRID}>
            {friends.map((friend) => (
              <li key={friend.id}>
                <PersonCard
                  user={friend}
                  online={friend.online}
                  detail={friend.online ? "En ligne" : "Hors ligne"}
                  sub={`Amis depuis ${since(friend.since)}`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToRemove(friend)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <UserMinus aria-hidden="true" />
                    Retirer
                  </Button>
                </PersonCard>
              </li>
            ))}
          </ul>
        ))}

      {tab === "incoming" &&
        (data.incoming.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucune demande en attente">
            Les demandes d&apos;ami que vous recevez apparaîtront ici.
          </EmptyState>
        ) : incoming.length === 0 ? (
          <NoMatch query={query} />
        ) : (
          <ul className={GRID}>
            {incoming.map((request) => (
              <li key={request.id}>
                <PersonCard user={request.user} detail={`Demande reçue ${relative(request)}`}>
                  <Button
                    size="sm"
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
                    Accepter
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
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
                    Refuser
                  </Button>
                </PersonCard>
              </li>
            ))}
          </ul>
        ))}

      {tab === "outgoing" &&
        (data.outgoing.length === 0 ? (
          <EmptyState icon={Send} title="Aucune demande envoyée">
            Utilisez « Ajouter un ami » pour inviter quelqu&apos;un avec son pseudo.
          </EmptyState>
        ) : outgoing.length === 0 ? (
          <NoMatch query={query} />
        ) : (
          <ul className={GRID}>
            {outgoing.map((request) => (
              <li key={request.id}>
                <PersonCard user={request.user} detail={`Invité ${relative(request)}`}>
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
                    <X aria-hidden="true" />
                    Annuler la demande
                  </Button>
                </PersonCard>
              </li>
            ))}
          </ul>
        ))}

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

function NoMatch({ query }: { query: string }) {
  return (
    <p className="rounded-xl border border-dashed bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
      Personne ne correspond à « {query.trim()} ».
    </p>
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
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <FormField
        name="username"
        label="Pseudo"
        autoComplete="off"
        spellCheck={false}
        maxLength={20}
        autoFocus
        error={error}
      />
      <Button type="submit" disabled={pending}>
        <Send aria-hidden="true" />
        {pending ? "Envoi…" : "Envoyer la demande"}
      </Button>
    </form>
  );
}

/**
 * Carte d'une personne : grand avatar centré (avec pastille de présence),
 * pseudo, statut, puis une barre d'actions en bas.
 */
function PersonCard({
  user,
  online,
  detail,
  sub,
  children,
}: {
  user: PublicUser;
  online?: boolean;
  detail: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card/70 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex flex-1 flex-col items-center px-4 pt-6 pb-4 text-center">
        <span className="relative">
          <span className="block rounded-full bg-gold-soft p-1.5">
            <UserAvatar avatar={user.avatar} className="size-20" />
          </span>
          {online !== undefined && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-1.5 bottom-1.5 size-4 rounded-full ring-3 ring-card",
                online ? "bg-primary" : "bg-muted-foreground/45",
              )}
            />
          )}
        </span>
        <h3 className="mt-3 w-full truncate font-semibold">{user.username}</h3>
        <p className={cn("text-sm", online ? "font-medium text-primary" : "text-muted-foreground")}>
          {detail}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children && (
        <div className="flex items-center justify-center gap-1.5 border-t bg-muted/40 px-2 py-1.5">
          {children}
        </div>
      )}
    </article>
  );
}

/** Carte vide animée, affichée pendant le chargement (annexe 3). */
export function PersonCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-xl border bg-card/70">
      <div className="flex flex-col items-center gap-2.5 px-4 pt-6 pb-4">
        <span className="size-23 animate-pulse rounded-full bg-muted" />
        <span className="mt-1 h-4 w-28 animate-pulse rounded-full bg-muted" />
        <span className="h-3 w-20 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-11 border-t bg-muted/40" />
    </div>
  );
}

/** Grille de squelettes : même mise en page que la liste d'amis. */
export function FriendsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Chargement des amis">
      <div className="flex items-center gap-3 rounded-xl border bg-card/70 p-3">
        <span className="h-6 w-24 animate-pulse rounded-full bg-muted" />
        <span className="ml-auto h-9 w-64 max-w-[50%] animate-pulse rounded-md bg-muted" />
      </div>
      <ul className={GRID}>
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <PersonCardSkeleton />
          </li>
        ))}
      </ul>
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

const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function since(date: string): string {
  return monthYear.format(new Date(date));
}
