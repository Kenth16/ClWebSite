import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, safeRedirect } from "@/lib/session";

export const metadata: Metadata = { title: "Connexion" };

type Props = { searchParams: Promise<{ redirect?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const redirectTo = safeRedirect((await searchParams).redirect);
  if (await getCurrentUser()) redirect(redirectTo);

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Bon retour parmi nous</h1>
        <p className="mt-1 text-muted-foreground">
          Connectez-vous pour reprendre votre progression.
        </p>
      </div>
      <LoginForm redirectTo={redirectTo} />
    </>
  );
}
