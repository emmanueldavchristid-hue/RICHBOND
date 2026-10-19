import { Suspense, type ReactNode } from "react";
import { AchatsSubnav, type SubnavItem } from "@/components/layout/achats-subnav";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";

/** Sous-navigation Achats : les bons de commande n'apparaissent qu'à qui y a accès (jamais au Magasinier). */
async function Subnav() {
  const user = await getCurrentUser();
  if (!user || !can(user, "purchaseOrder.view")) return null;
  const items: SubnavItem[] = [{ label: "Demandes", href: "/achats/demandes", id: "demandes" }];
  if (can(user, "purchaseOrder.create")) items.push({ label: "À commander", href: "/achats/commandes/a-commander", id: "a-commander" });
  items.push({ label: "Commandes", href: "/achats/commandes", id: "commandes" });
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
