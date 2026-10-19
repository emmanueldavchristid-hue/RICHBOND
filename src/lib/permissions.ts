import { BusinessError } from "./errors";

/** Fichier pur (sans Prisma) : importable côté client pour filtrer le menu. */

export type RoleCode = "SUPER_ADMIN" | "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER";
export type ScopeCode = "LOCAL" | "IMPORT" | "ALL";

export const ALL_ACTIONS = [
  "purchaseRequest.view",
  "purchaseRequest.create",
  "purchaseRequest.createReplenishment",
  "purchaseRequest.approve",
  "purchaseRequest.cancel",
  "rfq.view",
  "rfq.manage",
  "purchaseOrder.view",
  "purchaseOrder.create",
  "purchaseOrder.send",
  "purchaseOrder.remind",
  "purchaseOrder.approve",
  "purchaseOrder.cancel",
  "importFile.view",
  "importFile.manage",
  "invoice.view",
  "invoice.manage",
  "invoice.approvePayment",
  "supplier.view",
  "supplier.manage",
  "supplier.evaluate",
  "item.view",
  "item.manage",
  "stock.view",
  "stock.receive",
  "stock.issue",
  "stock.adjust",
  "inventory.count",
  "inventory.validate",
  "price.viewPurchase",
  "price.viewPmp",
  "report.purchasing",
  "report.stock",
  "report.all",
  "users.manage",
  "audit.view",
  "settings.manage",
  "exchangeRate.manage",
  "license.manage",
  "maintenance.run",
  "sage.sync",
] as const;

export type Action = (typeof ALL_ACTIONS)[number];

export interface PermissionUser {
  role: RoleCode;
  purchaseScope?: ScopeCode | null;
}

export interface PermissionResource {
  scope?: "LOCAL" | "IMPORT";
}

const READ_ACTIONS: Action[] = ALL_ACTIONS.filter(
  (a) => a.endsWith(".view") || a.startsWith("report."),
);

/** Actions qui modifient des données métier : interdites au SUPER_ADMIN. */
export const SUPER_ADMIN_ACTIONS: readonly Action[] = [
  ...READ_ACTIONS,
  "price.viewPurchase",
  "price.viewPmp",
  "users.manage",
  "audit.view",
  "license.manage",
  "maintenance.run",
  "sage.sync",
];

const RESPONSABLE: Action[] = ALL_ACTIONS.filter(
  (a) => a !== "license.manage" && a !== "maintenance.run",
);

const ACHETEUR: Action[] = [
  "purchaseRequest.view",
  "purchaseRequest.create",
  "purchaseRequest.cancel",
  "rfq.view",
  "rfq.manage",
  "purchaseOrder.view",
  "purchaseOrder.create",
  "purchaseOrder.send",
  "purchaseOrder.remind",
  "importFile.view",
  "importFile.manage",
  "invoice.view",
  "invoice.manage",
  "supplier.view",
  "supplier.manage",
  "item.view",
  "item.manage",
  "stock.view",
  "price.viewPurchase",
  "price.viewPmp",
  "report.purchasing",
  "exchangeRate.manage",
];

const MAGASINIER: Action[] = [
  "purchaseRequest.view",
  "purchaseRequest.createReplenishment",
  "purchaseRequest.cancel",
  "stock.view",
  "stock.receive",
  "stock.issue",
  "inventory.count",
  "item.view",
  // Réglage « prix d'achat visible » prévu en LOT-03 (H13) ; défaut : PMP seul.
  "price.viewPmp",
  "report.stock",
];

export const PERMISSIONS: Record<RoleCode, ReadonlySet<Action>> = {
  SUPER_ADMIN: new Set(SUPER_ADMIN_ACTIONS),
  RESPONSABLE_ACHATS: new Set(RESPONSABLE),
  ACHETEUR: new Set(ACHETEUR),
  MAGASINIER: new Set(MAGASINIER),
};

export function can(user: PermissionUser, action: Action, resource?: PermissionResource): boolean {
  if (!PERMISSIONS[user.role]?.has(action)) return false;
  if (user.role === "ACHETEUR" && resource?.scope) {
    const scope = user.purchaseScope;
    if (!scope) return false;
    if (scope !== "ALL" && scope !== resource.scope) return false;
  }
  return true;
}

export function requireAction(
  user: PermissionUser,
  action: Action,
  resource?: PermissionResource,
): void {
  if (!can(user, action, resource)) {
    throw new BusinessError("FORBIDDEN", "Vous n'avez pas les droits pour cette action.");
  }
}

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: "Super-administrateur",
  RESPONSABLE_ACHATS: "Responsable Achats",
  ACHETEUR: "Acheteur",
  MAGASINIER: "Magasinier",
};

export const SCOPE_LABELS: Record<ScopeCode, string> = {
  LOCAL: "local",
  IMPORT: "import",
  ALL: "local et import",
};

/** « Acheteur (local) », « Responsable Achats »… */
export function roleLabel(user: PermissionUser): string {
  if (user.role === "ACHETEUR" && user.purchaseScope) {
    return `${ROLE_LABELS.ACHETEUR} (${SCOPE_LABELS[user.purchaseScope]})`;
  }
  return ROLE_LABELS[user.role];
}

export interface NavEntry {
  label: string;
  href: string;
  icon: string;
  anyOf: Action[];
  /** Périmètre exigé de l'Acheteur pour voir la rubrique (ex. Import). */
  scope?: "LOCAL" | "IMPORT";
}

/** Config unique du menu (icône = nom lucide). Filtrée par `visibleNav`. */
export const NAV_ITEMS: NavEntry[] = [
  { label: "Accueil", href: "/accueil", icon: "Home", anyOf: [] },
  { label: "Achats", href: "/achats", icon: "ShoppingCart", anyOf: ["purchaseRequest.view"] },
  { label: "Import", href: "/import", icon: "Ship", anyOf: ["importFile.view"], scope: "IMPORT" },
  { label: "Stock", href: "/stock", icon: "Warehouse", anyOf: ["stock.view"] },
  { label: "Articles", href: "/stock/articles", icon: "Package", anyOf: ["item.view"] },
  { label: "Fournisseurs", href: "/fournisseurs", icon: "Truck", anyOf: ["supplier.view"] },
  {
    label: "Rapports",
    href: "/rapports",
    icon: "BarChart3",
    anyOf: ["report.purchasing", "report.stock", "report.all"],
  },
  {
    label: "Paramètres",
    href: "/parametres",
    icon: "Settings",
    anyOf: ["users.manage", "settings.manage", "exchangeRate.manage"],
  },
  { label: "Licence", href: "/parametres/licence", icon: "KeyRound", anyOf: ["license.manage"] },
];

export function visibleNav(user: PermissionUser): NavEntry[] {
  return NAV_ITEMS.filter((n) => n.anyOf.length === 0 || n.anyOf.some((a) => can(user, a, n.scope ? { scope: n.scope } : undefined)));
}

/**
 * H13 / R15 : le prix d'achat est visible pour tous sauf le Magasinier, qui le voit
 * seulement si le réglage `warehouse.showPurchasePrice` est activé. Pur : le réglage est passé en argument.
 */
export function canSeePurchasePrice(
  user: PermissionUser,
  settings: { showPurchasePriceToWarehouse?: boolean },
): boolean {
  if (can(user, "price.viewPurchase")) return true;
  return user.role === "MAGASINIER" && settings.showPurchasePriceToWarehouse === true;
}

// ------------------------------------------------------------------ LOT-04 : demandes d'achat (règles pures)

export interface RequestActor extends PermissionUser {
  id: string;
}

export interface RequestRef {
  createdById: string;
  kind: "STANDARD" | "REAPPRO";
  status?: string;
}

/**
 * H48 : Responsable, Acheteurs et Super-admin (lecture) voient toutes les DA ;
 * le Magasinier voit les siennes et les DA de réapprovisionnement.
 */
export function canViewRequest(user: RequestActor, pr: RequestRef): boolean {
  if (!can(user, "purchaseRequest.view")) return false;
  if (user.role !== "MAGASINIER") return true;
  return pr.createdById === user.id || pr.kind === "REAPPRO";
}

/** Modification du contenu : créateur (ou Responsable) tant que la DA est en BROUILLON ou A_COMPLETER. */
export function canEditRequest(user: RequestActor, pr: RequestRef & { status: string }): boolean {
  if (pr.status !== "BROUILLON" && pr.status !== "A_COMPLETER") return false;
  const mayWrite = can(user, "purchaseRequest.create") || can(user, "purchaseRequest.createReplenishment");
  if (!mayWrite) return false;
  return pr.createdById === user.id || user.role === "RESPONSABLE_ACHATS";
}
