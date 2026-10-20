import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Package, PackageMinus, RefreshCw, type LucideIcon } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can, type Action } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Stock – RICHBOND" };

const ENTRIES: { href: string; title: string; text: string; icon: LucideIcon; action: Action; testId: string }[] = [
  { href: "/stock/articles", title: "Articles et stock", text: "Quantités, coût moyen, couverture en jours et date de rupture prévue.", icon: Package, action: "item.view", testId: "stk-hub-articles" },
  { href: "/stock/mouvements", title: "Mouvements", text: "Journal des entrées, sorties, transferts et ajustements.", icon: ArrowLeftRight, action: "stock.view", testId: "stk-hub-mouvements" },
  { href: "/stock/sorties", title: "Sorties", text: "Bons de sortie remis aux services, avec la machine concernée.", icon: PackageMinus, action: "stock.view", testId: "stk-hub-sorties" },
  { href: "/stock/reappro", title: "Réapprovisionnement", text: "Articles sous le point de commande et création des demandes d'achat.", icon: RefreshCw, action: "stock.reorder", testId: "stk-hub-reappro" },
];

async function StockHub() {
  const user = await requirePageAction("stock.view");
  const entries = ENTRIES.filter((e) => can(user, e.action));
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="stk-hub">
      {entries.map(({ href, title, text, icon: Icon, testId }) => (
        <li key={href}>
          <Link
            href={href}
            data-testid={testId}
            className="flex min-h-24 items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-input hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Stock" description="Niveaux de stock, mouvements, sorties et réapprovisionnement." />
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <StockHub />
      </Suspense>
    </>
  );
}
