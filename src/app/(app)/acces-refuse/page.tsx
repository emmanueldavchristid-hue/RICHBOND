import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Accès refusé – RICHBOND" };

export default function AccesRefusePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center" data-testid="acces-refuse">
      <ShieldAlert className="size-12 text-red-600" />
      <h1 className="text-2xl font-semibold">Accès refusé</h1>
      <p className="text-muted-foreground">Vous n&apos;avez pas les droits pour cette page.</p>
      <Link href="/accueil" className={cn(buttonVariants(), "h-11 px-5 text-base")} data-testid="retour-accueil">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
