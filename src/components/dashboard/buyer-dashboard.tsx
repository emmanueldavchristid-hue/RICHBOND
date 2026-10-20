import type { BuyerDashboard } from "@/modules/reporting/types";
import { ActionTiles } from "./action-tile";
import { MyRequestsList, OrdersList } from "./buyer-lists";

/** Tableau de l'Acheteur : ses DA assignées, ses BC à envoyer, en retard et à relancer. */
export function BuyerBoard({ data }: { data: BuyerDashboard }) {
  const href = (key: string, fallback: string) => data.cards.find((c) => c.key === key)?.href ?? fallback;
  return (
    <div className="space-y-5" data-testid="dash-acheteur">
      <ActionTiles cards={data.cards} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MyRequestsList total={data.myRequests.total} rows={data.myRequests.rows} href={href("mes-da", "/achats/demandes?onglet=assignees")} />
        <OrdersList
          kind="send"
          title="Bons de commande à envoyer"
          description="Validés par le Responsable, prêts à partir chez le fournisseur."
          total={data.ordersToSend.total}
          rows={data.ordersToSend.rows}
          href={href("mes-bc-a-envoyer", "/achats/commandes?onglet=en-cours&statut=VALIDE")}
          testId="dash-orders-send"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <OrdersList
          kind="late"
          title="Bons de commande en retard"
          description="La date de livraison promise est dépassée."
          total={data.lateOrders.total}
          rows={data.lateOrders.rows}
          href={href("mes-bc-en-retard", "/achats/commandes?onglet=en-retard")}
          testId="dash-orders-late"
        />
        <OrdersList
          kind="remind"
          title="Bons de commande à relancer"
          description="Envoyés sans confirmation depuis plusieurs jours ouvrés."
          total={data.ordersToRemind.total}
          rows={data.ordersToRemind.rows}
          href={href("mes-bc-a-relancer", "/achats/commandes?onglet=en-cours&relance=1")}
          testId="dash-orders-remind"
        />
      </div>
    </div>
  );
}
