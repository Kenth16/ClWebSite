import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser, safeRedirect } from "@/lib/session";

export const metadata: Metadata = { title: "Inscription" };

type Props = { searchParams: Promise<{ redirect?: string | string[] }> };

export default async function RegisterPage({ searchParams }: Props) {
  const redirectTo = safeRedirect((await searchParams).redirect);
  if (await getCurrentUser()) redirect(redirectTo);

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-semibold">Rejoindre l&apos;académie</h1>
        <p className="mt-1.5 text-muted-foreground">Créez votre compte en quelques secondes.</p>
      </div>
      <RegisterForm redirectTo={redirectTo} />
    </>
  );
}
