import { z } from "zod";

/** Réglages connus (clé -> schéma de valeur + défaut). */
export const SETTING_DEFS = {
  "warehouse.showPurchasePrice": { schema: z.boolean({ error: "Valeur invalide." }), default: false },
  /** D12 : seuil (FCFA entiers) au-delà duquel une validation « direction » est prévue ; 0 = désactivé. */
  "purchaseRequest.approvalThreshold": {
    schema: z
      .number({ error: "Le seuil doit être un nombre entier de FCFA." })
      .int("Le seuil doit être un nombre entier de FCFA.")
      .min(0, "Le seuil ne peut pas être négatif.")
      .max(10_000_000_000, "Seuil trop élevé."),
    default: 0,
  },
  // ---------------------------------------------------------------- LOT-05 : bons de commande
  /** D3 : seuil (FCFA TTC) sous lequel la soumission d'un BC vaut validation ; 0 = tous les BC passent par le Responsable. */
  "purchaseOrder.approvalThreshold": {
    schema: z
      .number({ error: "Le seuil doit être un nombre entier de FCFA." })
      .int("Le seuil doit être un nombre entier de FCFA.")
      .min(0, "Le seuil ne peut pas être négatif.")
      .max(2_147_483_647, "Seuil trop élevé."),
    default: 0,
  },
  /** D12 : taux de TVA proposé par défaut sur les lignes d'un BC local (0 % pour l'import). */
  "purchaseOrder.defaultVatRate": {
    schema: z
      .number({ error: "Taux de TVA invalide." })
      .refine((n) => n === 0 || n === 9 || n === 18, "Taux de TVA invalide (0, 9 ou 18 %)."),
    default: 18,
  },
  /** D14 : écart (en %) face au dernier prix d'achat au-delà duquel le validateur est alerté. */
  "purchaseOrder.priceAlertPct": {
    schema: z.number({ error: "Valeur invalide." }).min(0, "L'écart ne peut pas être négatif.").max(1000, "Écart trop élevé."),
    default: 20,
  },
  /** D20 : jours ouvrés après l'envoi sans confirmation avant l'indicateur « À relancer ». */
  "purchaseOrder.reminderAfterDays": {
    schema: z
      .number({ error: "Nombre de jours invalide." })
      .int("Nombre de jours invalide.")
      .min(1, "Au moins 1 jour.")
      .max(30, "30 jours au maximum."),
    default: 3,
  },
  // D29 : coordonnées imprimées sur le PDF du bon de commande (valeurs fictives en seed).
  "company.name": { schema: z.string({ error: "Valeur invalide." }).trim().min(2, "Raison sociale obligatoire.").max(100, "100 caractères maximum."), default: "RICHBOND CI" },
  "company.address": { schema: z.string({ error: "Valeur invalide." }).trim().max(300, "300 caractères maximum."), default: "" },
  "company.phone": { schema: z.string({ error: "Valeur invalide." }).trim().max(60, "60 caractères maximum."), default: "" },
  "company.email": {
    schema: z.string({ error: "Valeur invalide." }).trim().max(100, "100 caractères maximum.").refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Adresse e-mail invalide."),
    default: "",
  },
  /** NCC, RCCM… texte libre. */
  "company.legalIds": { schema: z.string({ error: "Valeur invalide." }).trim().max(300, "300 caractères maximum."), default: "" },
  "purchaseOrder.pdfFooter": { schema: z.string({ error: "Valeur invalide." }).trim().max(300, "300 caractères maximum."), default: "" },
  /** Conditions générales d'achat imprimées au bas du bon. */
  "purchaseOrder.pdfConditions": { schema: z.string({ error: "Valeur invalide." }).trim().max(1000, "1000 caractères maximum."), default: "" },
  // ---------------------------------------------------------------- LOT-06 : réceptions
  /** R4 : tolérance de sur-livraison en % de la quantité commandée ; au-delà, accord du Responsable exigé. */
  "receipt.overDeliveryPct": {
    schema: z.number({ error: "Valeur invalide." }).min(0, "La tolérance ne peut pas être négative.").max(100, "Tolérance trop élevée (100 % au maximum)."),
    default: 0,
  },
  /** R11 : le Magasinier voit prix et montants sur les écrans de réception. */
  "receipt.showPricesToStorekeeper": { schema: z.boolean({ error: "Valeur invalide." }), default: false },
  // ---------------------------------------------------------------- LOT-07 : stock, prévision, réapprovisionnement
  /** K6 : fenêtre (jours) de calcul de la consommation moyenne journalière. */
  "stock.consumptionWindowDays": {
    schema: z.number({ error: "Nombre de jours invalide." }).int("Nombre de jours invalide.").min(7, "Au moins 7 jours.").max(365, "365 jours au maximum."),
    default: 90,
  },
  /** K6 : délai de réapprovisionnement (jours) quand ni l'article ni son fournisseur principal n'en portent. */
  "stock.defaultLeadTimeDays": {
    schema: z.number({ error: "Nombre de jours invalide." }).int("Nombre de jours invalide.").min(1, "Au moins 1 jour.").max(365, "365 jours au maximum."),
    default: 30,
  },
  /** K9 : un article en stock sans aucun mouvement depuis ce nombre de jours est dit dormant. */
  "stock.dormantDays": {
    schema: z.number({ error: "Nombre de jours invalide." }).int("Nombre de jours invalide.").min(30, "Au moins 30 jours.").max(1095, "1095 jours au maximum."),
    default: 180,
  },
  // ---------------------------------------------------------------- LOT-11 : inventaires
  /** Écart (en % de la quantité théorique) au-delà duquel un recomptage est exigé avant validation. */
  "inventory.thresholdPct": {
    schema: z.number({ error: "Valeur invalide." }).min(0, "Le seuil ne peut pas être négatif.").max(100, "100 % au maximum."),
    default: 5,
  },
  /** Écart de valeur (FCFA, au PMP) au-delà duquel un recomptage est exigé avant validation. */
  "inventory.thresholdValue": {
    schema: z
      .number({ error: "Le seuil doit être un nombre entier de FCFA." })
      .int("Le seuil doit être un nombre entier de FCFA.")
      .min(0, "Le seuil ne peut pas être négatif.")
      .max(2_147_483_647, "Seuil trop élevé."),
    default: 100_000,
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export const settingKeySchema = z.enum(Object.keys(SETTING_DEFS) as [SettingKey, ...SettingKey[]], {
  error: "Réglage inconnu.",
});

export const updateSettingSchema = z
  .object({ key: settingKeySchema, value: z.unknown() })
  .superRefine((v, ctx) => {
    const r = SETTING_DEFS[v.key].schema.safeParse(v.value);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["value"], message: r.error.issues[0]?.message ?? "Valeur invalide." });
  });

export interface AppSettings {
  showPurchasePriceToWarehouse: boolean;
  /** FCFA, 0 = désactivé. */
  purchaseRequestApprovalThreshold: number;
  /** LOT-05 : voir `SETTING_DEFS`. */
  purchaseOrderApprovalThreshold: number;
  purchaseOrderDefaultVatRate: 0 | 9 | 18;
  purchaseOrderPriceAlertPct: number;
  purchaseOrderReminderAfterDays: number;
  company: { name: string; address: string; phone: string; email: string; legalIds: string };
  purchaseOrderPdfFooter: string;
  purchaseOrderPdfConditions: string;
  /** LOT-06 : voir `SETTING_DEFS`. */
  receiptOverDeliveryPct: number;
  receiptShowPricesToStorekeeper: boolean;
  /** LOT-07 : voir `SETTING_DEFS`. */
  stockConsumptionWindowDays: number;
  stockDefaultLeadTimeDays: number;
  stockDormantDays: number;
  /** LOT-11 : voir `SETTING_DEFS`. */
  inventoryThresholdPct: number;
  inventoryThresholdValue: number;
}
