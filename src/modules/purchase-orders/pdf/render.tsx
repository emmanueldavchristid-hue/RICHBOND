import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSettings, readLogo } from "@/modules/settings";
import type { OrderSnapshot } from "../snapshot";
import { PurchaseOrderDocument, type CompanyInfo, type LogoInput } from "./document";

/** Génère le PDF d'une version (jamais stocké : régénéré à la demande depuis l'instantané, D28). */
export async function renderOrderPdf(
  snapshot: OrderSnapshot,
  opts: { company: CompanyInfo; logo?: LogoInput | null; preview?: boolean },
): Promise<Buffer> {
  return renderToBuffer(<PurchaseOrderDocument snapshot={snapshot} company={opts.company} logo={opts.logo} preview={opts.preview} />);
}

/** Coordonnées société et logo réglés par le Responsable (paramètres), pour le PDF. */
export async function loadBranding(): Promise<{ company: CompanyInfo; logo: LogoInput | null }> {
  const s = await getSettings();
  const logo = await readLogo();
  return {
    company: { ...s.company, footer: s.purchaseOrderPdfFooter, conditions: s.purchaseOrderPdfConditions },
    logo: logo ? { data: logo.bytes, format: logo.ext } : null,
  };
}
