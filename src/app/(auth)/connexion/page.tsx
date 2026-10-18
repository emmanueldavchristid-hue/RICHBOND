import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion – RICHBOND" };

async function LoginContent({ searchParams }: { searchParams: PageProps<"/connexion">["searchParams"] }) {
  const { retour } = await searchParams;
  return <LoginForm retour={typeof retour === "string" ? retour : undefined} />;
}

export default function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-md" />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
