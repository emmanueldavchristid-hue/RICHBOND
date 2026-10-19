import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { APP_TZ } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { dayKey, listCurrencies } from "@/modules/currencies";
import { CurrenciesManager, type CurrencyView } from "./currencies-manager";

export const metadata: Metadata = { title: "Devises et taux – RICHBOND" };

async function CurrenciesContent() {
  const user = await requirePageAction(null);
  const canManageCurrencies = can(user, "settings.manage");
  const canEnterRates = can(user, "exchangeRate.manage");
  // Responsable : devises et taux ; Acheteurs : saisie des taux (l'import en a besoin chaque jour).
  if (!canManageCurrencies && !canEnterRates) redirect("/acces-refuse");

  const t = (await getNow()).now;
  const today = dayKey(t);
  const list = await listCurrencies({ at: t });
  const currencies: CurrencyView[] = list.map((c) => ({
    ...c,
    ageDays: c.latestRate ? Math.round((today.getTime() - dayKey(c.latestRate.date).getTime()) / 86_400_000) : null,
  }));
  return (
    <CurrenciesManager
      currencies={currencies}
      today={formatInTimeZone(t, APP_TZ, "yyyy-MM-dd")}
      canManageCurrencies={canManageCurrencies}
      canEnterRates={canEnterRates}
    />
  );
}

export default function DevisesPage() {
  return (
    <>
      <PageHeader
        title="Devises et taux de change"
        description="Le FCFA (XOF) est la devise de base. Les taux se saisissent par date : chaque opération utilise le dernier taux connu à sa date."
      />
      <Suspense fallback={<PageSkeleton />}>
        <CurrenciesContent />
      </Suspense>
    </>
  );
}
