import { Suspense, type ReactNode } from "react";
import { AchatsSubnav, type SubnavItem } from "@/components/layout/achats-subnav";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";

/** Sous-navigation Achats : les bons de commande n'apparaissent qu'à qui y a accès (jamais au Magasinier). */
async function Subnav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const items: SubnavItem[] = [];
  if (can(user, "purchaseOrder.view")) {
    items.push({ label: "Demandes", href: "/achats/demandes", id: "demandes" });
    if (can(user, "purchaseOrder.create")) items.push({ label: "À commander", href: "/achats/commandes/a-commander", id: "a-commander" });
    items.push({ label: "Commandes", href: "/achats/commandes", id: "commandes" });
  }
  if (can(user, "invoice.view")) items.push({ label: "Factures", href: "/achats/factures", id: "factures" });
  if (items.length === 0) return null;
  return <AchatsSubnav items={items} />;
}

export default function AchatsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <Subnav />
      </Suspense>
      {children}
    </>
  );
}
