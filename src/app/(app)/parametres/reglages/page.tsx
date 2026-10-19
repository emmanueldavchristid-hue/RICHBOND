import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { getSettings, readLogo } from "@/modules/settings";
import { CompanyForm, LogoForm, OrderRulesForm } from "./order-settings-forms";
import { ApprovalThresholdForm, SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Réglages – RICHBOND" };

async function SettingsContent() {
  await requirePageAction("settings.manage");
  const [settings, logo] = await Promise.all([getSettings(), readLogo()]);
  const company = {
    name: settings.company.name,
    address: settings.company.address,
    phone: settings.company.phone,
    email: settings.company.email,
    legalIds: settings.company.legalIds,
    pdfFooter: settings.purchaseOrderPdfFooter,
    pdfConditions: settings.purchaseOrderPdfConditions,
  };
  const rules = {
    approvalThreshold: settings.purchaseOrderApprovalThreshold,
    defaultVatRate: settings.purchaseOrderDefaultVatRate,
    priceAlertPct: settings.purchaseOrderPriceAlertPct,
    reminderAfterDays: settings.purchaseOrderReminderAfterDays,
  };
  return (
    <div className="space-y-6">
      <SettingsForm
        key={String(settings.showPurchasePriceToWarehouse)}
        showPurchasePrice={settings.showPurchasePriceToWarehouse}
      />
      <ApprovalThresholdForm key={settings.purchaseRequestApprovalThreshold} approvalThreshold={settings.purchaseRequestApprovalThreshold} />
      <OrderRulesForm key={JSON.stringify(rules)} initial={rules} />
      <CompanyForm key={JSON.stringify(company)} initial={company} />
      <LogoForm key={logo ? `${logo.ext}-${logo.bytes.length}` : "none"} hasLogo={logo !== null} version={logo?.bytes.length ?? 0} />
    </div>
  );
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
