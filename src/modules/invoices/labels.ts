export const INVOICE_STATUS_LABELS = {
  SAISIE: "Saisie",
  CONFORME: "Conforme",
  ECART: "Écart",
  BON_A_PAYER: "Bon à payer",
  TRANSMISE: "Transmise comptabilité",
  LITIGE: "Litige",
  ANNULEE: "Annulée",
} as const;
export type InvoiceStatusCode = keyof typeof INVOICE_STATUS_LABELS;
export const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as [InvoiceStatusCode, ...InvoiceStatusCode[]];

export const INVOICE_MATCH_LABELS = {
  CONFORME: "Conforme",
  ECART_PRIX: "Écart de prix",
  ECART_QTE: "Écart de quantité",
  ECART_PRIX_QTE: "Écart de prix et de quantité",
} as const;
export type InvoiceMatchCode = keyof typeof INVOICE_MATCH_LABELS;

export const INVOICE_TABS = ["a-traiter", "ecarts", "bon-a-payer", "transmises", "tous"] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];
export const INVOICE_TAB_LABELS: Record<InvoiceTab, string> = {
  "a-traiter": "À traiter",
  ecarts: "Écarts et litiges",
  "bon-a-payer": "Bon à payer",
  transmises: "Transmises",
  tous: "Toutes",
};
export const INVOICE_TAB_STATUSES: Record<InvoiceTab, readonly InvoiceStatusCode[] | null> = {
  "a-traiter": ["SAISIE", "CONFORME"],
  ecarts: ["ECART", "LITIGE"],
  "bon-a-payer": ["BON_A_PAYER"],
  transmises: ["TRANSMISE"],
  tous: null,
};

export const REASON_MIN = 5;
export const invoiceLink = (id: string) => `/achats/factures/${id}`;
