import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { getSettings } from "@/modules/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Réglages – RICHBOND" };

async function SettingsContent() {
  await requirePageAction("settings.manage");
  const settings = await getSettings();
  return <SettingsForm key={String(settings.showPurchasePriceToWarehouse)} showPurchasePrice={settings.showPurchasePriceToWarehouse} />;
}

export default function ReglagesPage() {
  return (
    <>
      <PageHeader title="Réglages" description="Options de l'application réservées au Responsable Achats." />
      <Suspense fallback={<PageSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
