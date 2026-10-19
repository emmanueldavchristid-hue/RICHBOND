/**
 * Référentiels fictifs (LOT-03). Aucune donnée réelle du client : noms, NCC, prix inventés.
 * Idempotent : upsert par code ; liens et historiques créés une seule fois.
 */
import { formatInTimeZone } from "date-fns-tz";
import type {
  Criticality,
  Incoterm,
  ItemCategory,
  PaymentTerm,
  PrismaClient,
  SupplierStatus,
  SupplierType,
} from "../../src/generated/prisma/client";

const TZ = "Africa/Abidjan";

function dayAt(offsetDays: number): Date {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Date(`${formatInTimeZone(d, TZ, "yyyy-MM-dd")}T00:00:00.000Z`);
}

const WAREHOUSES = [
  { code: "MAG-CENTRAL", name: "MAGASIN CENTRAL" },
  { code: "MAG-PDR", name: "MAGASIN PDR" },
];

const DEPARTMENTS = [
  { code: "PROD", name: "Production" },
  { code: "MAINT", name: "Maintenance" },
  { code: "QUAL", name: "Qualité" },
  { code: "LOG", name: "Logistique" },
  { code: "ADM", name: "Administration" },
  { code: "DIR", name: "Direction" },
];

const CURRENCIES = [
  { code: "XOF", name: "Franc CFA (FCFA)", symbol: "FCFA", decimals: 0, isBase: true },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, isBase: false },
  { code: "USD", name: "Dollar américain", symbol: "$", decimals: 2, isBase: false },
  { code: "CNY", name: "Yuan renminbi", symbol: "¥", decimals: 2, isBase: false },
];

/**
 * Taux datés. Le plus ancien (-150 j) précède tous les prix de l'historique (-120 j) : chaque ligne d'historique
 * trouve donc un taux à sa date (colonne « Équivalent FCFA » toujours remplie). Écarts < 20 % entre deux taux.
 */
const RATES: { currencyCode: string; offset: number; rate: string }[] = [
  { currencyCode: "EUR", offset: -1, rate: "655.957" },
  { currencyCode: "EUR", offset: -35, rate: "655.957" },
  { currencyCode: "EUR", offset: -150, rate: "655.957" },
  { currencyCode: "USD", offset: -1, rate: "605.000" },
  { currencyCode: "USD", offset: -35, rate: "598.500" },
  { currencyCode: "USD", offset: -150, rate: "590.000" },
  { currencyCode: "CNY", offset: -1, rate: "83.000" },
  { currencyCode: "CNY", offset: -35, rate: "82.200" },
  { currencyCode: "CNY", offset: -150, rate: "80.500" },
];

/** Dernier taux connu à `offset` (jours relatifs) : même règle que getRateAt (dernier taux <= date). */
function seedRateAt(currency: string, offset: number): string | null {
  if (currency === "XOF") return null;
  const r = RATES.filter((x) => x.currencyCode === currency && x.offset <= offset).sort((a, b) => b.offset - a.offset)[0];
  return r?.rate ?? null;
}

interface SupplierSeed {
  name: string;
  type: SupplierType;
  country: string;
  city: string;
  cur: string;
  cats: ItemCategory[];
  term: PaymentTerm;
  inco?: Incoterm;
  lead: number;
  status?: SupplierStatus;
  reason?: string;
  contact: [string, string];
  /** Mode de règlement fictif. */
  bank?: string;
}

const SUPPLIERS: SupplierSeed[] = [
  { name: "ABIDJAN CHIMIE DISTRIBUTION", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["MATIERE_PREMIERE", "INTRANT"], term: "J30", lead: 7, contact: ["Service commercial", "+225 27 00 00 01 01"] },
  { name: "EMBALLAGES DU GOLFE", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["INTRANT", "FOURNITURE"], term: "J30", lead: 5, contact: ["Service commercial", "+225 27 00 00 01 02"] },
  { name: "TEXTILES DU BANDAMA", type: "LOCAL", country: "CI", city: "Bouaké", cur: "XOF", cats: ["MATIERE_PREMIERE"], term: "J45", lead: 10, contact: ["Service commercial", "+225 27 00 00 01 03"] },
  { name: "ATELIER MECANIQUE DU PORT", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["PDR"], term: "J30", lead: 4, contact: ["Atelier", "+225 27 00 00 01 04"] },
  { name: "ELEC-INDUSTRIE CI", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["PDR"], term: "J30", lead: 6, contact: ["Service commercial", "+225 27 00 00 01 05"] },
  { name: "PAPETERIE MODERNE ABIDJAN", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["FOURNITURE"], term: "COMPTANT", lead: 2, contact: ["Comptoir", "+225 27 00 00 01 06"] },
  { name: "QUINCAILLERIE CENTRALE D'ABIDJAN", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["PDR", "FOURNITURE"], term: "J30", lead: 3, contact: ["Comptoir", "+225 27 00 00 01 07"] },
  { name: "TRANSPORTS LAGUNE EXPRESS", type: "LOCAL", country: "CI", city: "San-Pedro", cur: "XOF", cats: ["SERVICE"], term: "J30", lead: 3, contact: ["Exploitation", "+225 27 00 00 01 08"] },
  { name: "FROID ET AIR SERVICES", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["SERVICE", "PDR"], term: "J45", lead: 5, contact: ["Service technique", "+225 27 00 00 01 09"] },
  { name: "SAN-PEDRO INDUSTRIAL SUPPLY", type: "LOCAL", country: "CI", city: "San-Pedro", cur: "XOF", cats: ["PDR", "FOURNITURE"], term: "J30", lead: 6, contact: ["Service commercial", "+225 27 00 00 01 10"] },
  { name: "IMPRIMERIE ETIQUETTES CI", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["INTRANT"], term: "J30", lead: 8, status: "EN_EVALUATION", contact: ["Service commercial", "+225 27 00 00 01 11"] },
  { name: "METROLOGIE AFRIQUE OUEST", type: "LOCAL", country: "CI", city: "Abidjan", cur: "XOF", cats: ["SERVICE"], term: "J30", lead: 10, contact: ["Laboratoire", "+225 27 00 00 01 12"] },
  { name: "Shenzhen Nova Foam Materials Co.", type: "IMPORT", country: "CN", city: "Shenzhen", cur: "CNY", cats: ["MATIERE_PREMIERE", "INTRANT"], term: "J60", inco: "FOB", lead: 45, contact: ["Sales Dept", "+86 755 0000 0013"] },
  { name: "Guangzhou Sunrise Textile Co.", type: "IMPORT", country: "CN", city: "Guangzhou", cur: "CNY", cats: ["MATIERE_PREMIERE"], term: "J60", inco: "FOB", lead: 50, contact: ["Sales Dept", "+86 20 0000 0014"] },
  { name: "Foshan Delta Machinery Parts", type: "IMPORT", country: "CN", city: "Foshan", cur: "CNY", cats: ["PDR"], term: "J30", inco: "CIF", lead: 40, contact: ["Sales Dept", "+86 757 0000 0015"] },
  { name: "Ningbo Harbor Bearings Trading", type: "IMPORT", country: "CN", city: "Ningbo", cur: "USD", cats: ["PDR"], term: "J30", inco: "FOB", lead: 35, contact: ["Sales Dept", "+86 574 0000 0016"] },
  { name: "Qingdao Pacific Chemicals", type: "IMPORT", country: "CN", city: "Qingdao", cur: "USD", cats: ["INTRANT"], term: "J60", inco: "CFR", lead: 55, status: "EN_EVALUATION", contact: ["Sales Dept", "+86 532 0000 0017"] },
  { name: "Hangzhou Silk Road Fabrics", type: "IMPORT", country: "CN", city: "Hangzhou", cur: "CNY", cats: ["MATIERE_PREMIERE"], term: "J60", inco: "FOB", lead: 50, contact: ["Sales Dept", "+86 571 0000 0018"] },
  { name: "Nordic Polyurethane Systems GmbH", type: "IMPORT", country: "DE", city: "Hambourg", cur: "EUR", cats: ["MATIERE_PREMIERE", "INTRANT"], term: "J60", inco: "FCA", lead: 30, contact: ["Vertrieb", "+49 40 0000 0019"] },
  { name: "Iberia Rodamientos SL", type: "IMPORT", country: "ES", city: "Valence", cur: "EUR", cats: ["PDR"], term: "J30", inco: "DAP", lead: 25, contact: ["Ventas", "+34 96 000 0020"] },
  { name: "Lyon Industrie Pneumatique SAS", type: "IMPORT", country: "FR", city: "Lyon", cur: "EUR", cats: ["PDR"], term: "J30", inco: "DAP", lead: 20, contact: ["Service ventes", "+33 4 00 00 00 21"] },
  { name: "Milano Tessuti Tecnici SRL", type: "IMPORT", country: "IT", city: "Milan", cur: "EUR", cats: ["MATIERE_PREMIERE"], term: "J60", inco: "FCA", lead: 35, contact: ["Ufficio vendite", "+39 02 0000 0022"] },
  { name: "Mumbai Polymers Pvt Ltd", type: "IMPORT", country: "IN", city: "Mumbai", cur: "USD", cats: ["MATIERE_PREMIERE", "INTRANT"], term: "J60", inco: "CFR", lead: 50, contact: ["Sales Dept", "+91 22 0000 0023"] },
  { name: "Chennai Spring Works Pvt Ltd", type: "IMPORT", country: "IN", city: "Chennai", cur: "USD", cats: ["MATIERE_PREMIERE"], term: "J60", inco: "CFR", lead: 55, contact: ["Sales Dept", "+91 44 0000 0024"] },
  { name: "Ahmedabad Yarn Industries", type: "IMPORT", country: "IN", city: "Ahmedabad", cur: "USD", cats: ["MATIERE_PREMIERE"], term: "J60", inco: "CFR", lead: 60, status: "BLOQUE", reason: "Retards de livraison répétés et lots non conformes (données fictives).", contact: ["Sales Dept", "+91 79 0000 0025"] },
];

type SupLink = [supplierNumber: number, price: number, currency: string];

interface ItemSeed {
  name: string;
  cat: ItemCategory;
  family: string;
  su: string;
  pu: string;
  coef?: number;
  crit?: Criticality;
  eq?: string;
  wh?: "MAG-CENTRAL" | "MAG-PDR";
  ss?: number;
  rp?: number;
  eoq?: number;
  lead?: number;
  /** Quantité minimale de commande, en unité d'ACHAT (défaut 1). */
  moq?: number;
  /**
   * Les prix de `s` sont exprimés par unité d'ACHAT. Sinon (défaut) ils sont donnés par unité de STOCK et convertis
   * ici (prix x coefficient) : le prix d'un lien est toujours enregistré par unité d'achat.
   */
  perPack?: boolean;
  s: SupLink[];
}

const ITEMS: ItemSeed[] = [
  // Matières premières
  { name: "Polyol polyéther PO-3000", cat: "MATIERE_PREMIERE", family: "Chimie mousse", su: "KG", pu: "FUT", coef: 200, crit: "CRITIQUE", ss: 4000, rp: 8000, eoq: 12000, lead: 45, s: [[19, 1.9, "EUR"], [23, 2.1, "USD"], [13, 14.2, "CNY"]] },
  { name: "TDI 80/20", cat: "MATIERE_PREMIERE", family: "Chimie mousse", su: "KG", pu: "FUT", coef: 250, crit: "CRITIQUE", ss: 3000, rp: 6000, eoq: 10000, lead: 45, s: [[19, 2.4, "EUR"], [23, 2.6, "USD"]] },
  { name: "MDI polymérique", cat: "MATIERE_PREMIERE", family: "Chimie mousse", su: "KG", pu: "FUT", coef: 250, crit: "IMPORTANT", ss: 1500, rp: 3000, eoq: 5000, lead: 45, s: [[19, 2.7, "EUR"], [13, 17.8, "CNY"]] },
  { name: "Tissu matelassé 180 g/m²", cat: "MATIERE_PREMIERE", family: "Tissus", su: "M", pu: "ROULEAU", coef: 50, crit: "IMPORTANT", ss: 2000, rp: 4000, eoq: 6000, lead: 30, s: [[3, 1850, "XOF"], [14, 9.4, "CNY"]] },
  { name: "Tissu jacquard damassé", cat: "MATIERE_PREMIERE", family: "Tissus", su: "M", pu: "ROULEAU", coef: 50, crit: "IMPORTANT", ss: 1500, rp: 3000, eoq: 5000, lead: 40, s: [[18, 11.8, "CNY"], [22, 3.9, "EUR"], [3, 2300, "XOF"]] },
  { name: "Fil polyester 40/2", cat: "MATIERE_PREMIERE", family: "Fils", su: "KG", pu: "CARTON", coef: 20, crit: "STANDARD", ss: 100, rp: 250, eoq: 400, lead: 30, s: [[14, 22.5, "CNY"], [25, 3.1, "USD"]] },
  { name: "Fil de couture bord de matelas", cat: "MATIERE_PREMIERE", family: "Fils", su: "KG", pu: "CARTON", coef: 10, crit: "STANDARD", ss: 50, rp: 120, eoq: 200, lead: 30, s: [[14, 31, "CNY"], [3, 7800, "XOF"]] },
  { name: "Ressorts ensachés 7 zones", cat: "MATIERE_PREMIERE", family: "Ressorts", su: "U", pu: "PALETTE", coef: 200, crit: "IMPORTANT", ss: 400, rp: 800, eoq: 1200, lead: 55, s: [[24, 4.6, "USD"], [25, 4.9, "USD"]] },
  { name: "Ouate polyester 250 g/m²", cat: "MATIERE_PREMIERE", family: "Garnissage", su: "KG", pu: "SAC", coef: 25, crit: "STANDARD", ss: 300, rp: 600, eoq: 1000, lead: 25, s: [[3, 1650, "XOF"], [13, 11.5, "CNY"]] },
  // Intrants
  { name: "Catalyseur amine", cat: "INTRANT", family: "Chimie mousse", su: "KG", pu: "FUT", coef: 190, crit: "CRITIQUE", ss: 400, rp: 800, eoq: 1500, lead: 45, s: [[19, 6.8, "EUR"], [17, 7.2, "USD"]] },
  { name: "Silicone tensioactif", cat: "INTRANT", family: "Chimie mousse", su: "KG", pu: "FUT", coef: 200, crit: "IMPORTANT", ss: 400, rp: 800, eoq: 1400, lead: 45, s: [[19, 8.9, "EUR"], [13, 74, "CNY"]] },
  { name: "Colle de contrecollage", cat: "INTRANT", family: "Adhésifs", su: "L", pu: "FUT", coef: 200, crit: "IMPORTANT", ss: 400, rp: 800, eoq: 1200, lead: 12, s: [[1, 2450, "XOF"], [17, 4.1, "USD"]] },
  { name: "Chlorure de méthylène", cat: "INTRANT", family: "Solvants", su: "KG", pu: "FUT", coef: 270, crit: "STANDARD", ss: 500, rp: 1000, eoq: 1600, lead: 12, s: [[1, 1350, "XOF"], [23, 1.4, "USD"]] },
  { name: "Film étirable", cat: "INTRANT", family: "Emballage", su: "U", pu: "CARTON", coef: 6, crit: "STANDARD", ss: 30, rp: 60, eoq: 120, lead: 7, s: [[2, 3200, "XOF"], [13, 22, "CNY"]] },
  { name: "Étiquettes produit", cat: "INTRANT", family: "Emballage", su: "U", pu: "ROULEAU", coef: 1000, crit: "STANDARD", ss: 5000, rp: 10000, eoq: 20000, lead: 10, perPack: true, s: [[11, 18500, "XOF"], [2, 21000, "XOF"]] },
  // PDR
  { name: "Roulement 6205", cat: "PDR", family: "Roulements", su: "U", pu: "U", crit: "CRITIQUE", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 20, rp: 40, eoq: 50, lead: 20, s: [[4, 3800, "XOF"], [16, 1.2, "USD"], [20, 1.9, "EUR"]] },
  { name: "Roulement 6308", cat: "PDR", family: "Roulements", su: "U", pu: "U", crit: "CRITIQUE", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 10, rp: 20, eoq: 30, lead: 25, s: [[16, 3.4, "USD"], [20, 5.2, "EUR"], [4, 11500, "XOF"]] },
  { name: "Courroie trapézoïdale SPZ 1250", cat: "PDR", family: "Transmission", su: "U", pu: "U", crit: "IMPORTANT", eq: "Matelasseuse", wh: "MAG-PDR", ss: 4, rp: 8, eoq: 10, lead: 15, s: [[4, 9500, "XOF"], [7, 8800, "XOF"]] },
  { name: "Courroie trapézoïdale SPB 2000", cat: "PDR", family: "Transmission", su: "U", pu: "U", crit: "IMPORTANT", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 4, rp: 8, eoq: 10, lead: 15, s: [[4, 14800, "XOF"], [15, 78, "CNY"]] },
  { name: "Courroie crantée HTD 8M", cat: "PDR", family: "Transmission", su: "U", pu: "U", crit: "STANDARD", eq: "Matelasseuse", wh: "MAG-PDR", ss: 2, rp: 4, eoq: 6, lead: 20, s: [[15, 95, "CNY"], [21, 28, "EUR"]] },
  { name: "Moteur asynchrone 7,5 kW", cat: "PDR", family: "Moteurs", su: "U", pu: "U", crit: "CRITIQUE", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 1, rp: 1, eoq: 1, lead: 40, s: [[5, 485000, "XOF"], [15, 2650, "CNY"], [21, 690, "EUR"]] },
  { name: "Variateur de fréquence 7,5 kW", cat: "PDR", family: "Électricité", su: "U", pu: "U", crit: "CRITIQUE", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 1, rp: 1, eoq: 1, lead: 45, s: [[5, 420000, "XOF"], [21, 640, "EUR"]] },
  { name: "Contacteur 25 A", cat: "PDR", family: "Électricité", su: "U", pu: "U", crit: "IMPORTANT", eq: "Fermeuse", wh: "MAG-PDR", ss: 3, rp: 6, eoq: 10, lead: 10, s: [[5, 18500, "XOF"], [7, 19500, "XOF"]] },
  { name: "Capteur de proximité inductif", cat: "PDR", family: "Électricité", su: "U", pu: "U", crit: "IMPORTANT", eq: "Fermeuse", wh: "MAG-PDR", ss: 4, rp: 8, eoq: 10, lead: 15, s: [[5, 24500, "XOF"], [15, 62, "CNY"]] },
  { name: "Buse de mélange", cat: "PDR", family: "Mousse", su: "U", pu: "U", crit: "CRITIQUE", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 2, rp: 3, eoq: 4, lead: 60, s: [[21, 380, "EUR"], [15, 2200, "CNY"]] },
  { name: "Aiguille de matelasseuse", cat: "PDR", family: "Matelassage", su: "U", pu: "CARTON", coef: 100, crit: "IMPORTANT", eq: "Matelasseuse", wh: "MAG-PDR", ss: 200, rp: 400, eoq: 600, lead: 35, perPack: true, s: [[15, 1450, "CNY"], [22, 190, "EUR"]] },
  { name: "Joint hydraulique 63 mm", cat: "PDR", family: "Hydraulique", su: "U", pu: "U", crit: "STANDARD", eq: "Ensacheuse", wh: "MAG-PDR", ss: 4, rp: 8, eoq: 12, lead: 20, s: [[10, 6500, "XOF"], [21, 14, "EUR"]] },
  { name: "Résistance chauffante ensacheuse", cat: "PDR", family: "Ensachage", su: "U", pu: "U", crit: "IMPORTANT", eq: "Ensacheuse", wh: "MAG-PDR", ss: 2, rp: 4, eoq: 6, lead: 25, s: [[15, 180, "CNY"], [5, 32000, "XOF"]] },
  { name: "Vérin pneumatique Ø63", cat: "PDR", family: "Pneumatique", su: "U", pu: "U", crit: "IMPORTANT", eq: "Ensacheuse", wh: "MAG-PDR", ss: 1, rp: 2, eoq: 3, lead: 30, s: [[21, 165, "EUR"], [15, 980, "CNY"]] },
  { name: "Électrovanne 24 V", cat: "PDR", family: "Pneumatique", su: "U", pu: "U", crit: "IMPORTANT", eq: "Ligne mousse continue", wh: "MAG-PDR", ss: 3, rp: 5, eoq: 8, lead: 30, s: [[21, 54, "EUR"], [15, 360, "CNY"]] },
  { name: "Filtre à air compresseur", cat: "PDR", family: "Compresseur", su: "U", pu: "U", crit: "STANDARD", eq: "Compresseur d'air", wh: "MAG-PDR", ss: 2, rp: 4, eoq: 6, lead: 20, s: [[9, 45000, "XOF"], [21, 85, "EUR"]] },
  // Fournitures
  { name: "Gants de manutention", cat: "FOURNITURE", family: "EPI", su: "PAIRE", pu: "CARTON", coef: 12, crit: "STANDARD", ss: 24, rp: 48, eoq: 120, lead: 5, s: [[7, 1200, "XOF"], [10, 1150, "XOF"]] },
  { name: "Bouchons d'oreille", cat: "FOURNITURE", family: "EPI", su: "PAIRE", pu: "CARTON", coef: 100, crit: "STANDARD", ss: 100, rp: 200, eoq: 400, lead: 7, s: [[7, 150, "XOF"]] },
  { name: "Rame papier A4", cat: "FOURNITURE", family: "Bureau", su: "U", pu: "CARTON", coef: 5, crit: "STANDARD", ss: 10, rp: 20, eoq: 50, lead: 3, s: [[6, 3100, "XOF"]] },
  { name: "Toner imprimante", cat: "FOURNITURE", family: "Bureau", su: "U", pu: "U", crit: "STANDARD", ss: 1, rp: 2, eoq: 4, lead: 5, s: [[6, 62000, "XOF"]] },
  { name: "Cutter de découpe", cat: "FOURNITURE", family: "Outillage", su: "U", pu: "CARTON", coef: 12, crit: "STANDARD", ss: 6, rp: 12, eoq: 24, lead: 5, s: [[7, 1400, "XOF"], [10, 1350, "XOF"]] },
  { name: "Graisse multi-usage", cat: "FOURNITURE", family: "Lubrifiants", su: "KG", pu: "CARTON", coef: 12, crit: "STANDARD", ss: 12, rp: 24, eoq: 48, lead: 7, s: [[7, 4200, "XOF"], [1, 4000, "XOF"]] },
  // Services
  { name: "Maintenance annuelle compresseur", cat: "SERVICE", family: "Maintenance", su: "FORFAIT", pu: "FORFAIT", s: [[9, 850000, "XOF"]] },
  { name: "Transport conteneur Abidjan-San-Pedro", cat: "SERVICE", family: "Transport", su: "FORFAIT", pu: "FORFAIT", s: [[8, 450000, "XOF"]] },
  { name: "Étalonnage des balances", cat: "SERVICE", family: "Métrologie", su: "FORFAIT", pu: "FORFAIT", s: [[12, 180000, "XOF"]] },
];

const pad = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, "0")}`;

export async function seedReferentials(prisma: PrismaClient): Promise<void> {
  for (const w of WAREHOUSES) {
    await prisma.warehouse.upsert({ where: { code: w.code }, update: { name: w.name }, create: w });
  }
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { code: d.code }, update: { name: d.name }, create: d });
  }
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({ where: { code: c.code }, update: { name: c.name, symbol: c.symbol, decimals: c.decimals, isBase: c.isBase }, create: c });
  }
  for (const r of RATES) {
    await prisma.exchangeRate.upsert({
      where: { currencyCode_date: { currencyCode: r.currencyCode, date: dayAt(r.offset) } },
      update: {},
      create: { currencyCode: r.currencyCode, date: dayAt(r.offset), rate: r.rate, note: "Taux fictif de démonstration" },
    });
  }
  await prisma.setting.createMany({ data: [{ key: "warehouse.showPurchasePrice", value: false }], skipDuplicates: true });

  // Fournisseurs (codes FRS-00001...).
  const supplierIds: string[] = [];
  for (const [i, s] of SUPPLIERS.entries()) {
    const code = pad("FRS", i + 1);
    const base = {
      name: s.name,
      type: s.type,
      country: s.country,
      city: s.city,
      address: `${10 + i} rue des Industries, ${s.city} (adresse fictive)`,
      phone: s.contact[1],
      email: `contact@fournisseur-${String(i + 1).padStart(2, "0")}.exemple.test`,
      bankDetails: s.country === "CI" ? `Banque fictive – RIB CI00 0000 0000 ${String(1000 + i)} (donnée fictive)` : `Fictive Bank – IBAN XX00 0000 ${String(1000 + i)} / SWIFT FICTXX00 (fictitious)`,
      currencyCode: s.cur,
      ncc: s.country === "CI" ? `${2100000 + i + 1}A` : null,
      rccm: s.country === "CI" ? `CI-ABJ-2020-B-${String(1000 + i)}` : null,
      paymentTerm: s.term,
      incoterm: s.inco ?? null,
      leadTimeDays: s.lead,
      categories: s.cats,
      status: s.status ?? "ACTIF",
      blockedReason: s.status === "BLOQUE" ? (s.reason ?? null) : null,
      blockedAt: s.status === "BLOQUE" ? new Date() : null,
    };
    const sup = await prisma.supplier.upsert({
      where: { code },
      // Le statut n'est pas réécrit : un blocage décidé dans l'application survit au seed.
      update: { name: base.name },
      create: { code, ...base },
    });
    // Reprise : renseigne les coordonnées des fournisseurs semés avant leur ajout, sans écraser une saisie.
    await prisma.supplier.updateMany({
      where: { id: sup.id, address: null, phone: null, email: null, bankDetails: null },
      data: { address: base.address, phone: base.phone, email: base.email, bankDetails: base.bankDetails },
    });
    supplierIds.push(sup.id);
    if ((await prisma.supplierContact.count({ where: { supplierId: sup.id } })) === 0) {
      await prisma.supplierContact.create({
        data: { supplierId: sup.id, name: s.contact[0], role: "Contact principal", phone: s.contact[1], isPrimary: true },
      });
    }
  }

  // Articles (codes ART-00001...) et liens fournisseurs.
  const warehouses = new Map((await prisma.warehouse.findMany()).map((w) => [w.code, w.id]));
  for (const [i, it] of ITEMS.entries()) {
    const code = pad("ART", i + 1);
    const isService = it.cat === "SERVICE";
    const mainId = supplierIds[it.s[0][0] - 1];
    const item = await prisma.item.upsert({
      where: { code },
      update: { name: it.name, purchaseUnit: it.pu, conversionFactor: it.coef ?? 1 },
      create: {
        code,
        name: it.name,
        category: it.cat,
        family: it.family,
        stockUnit: it.su,
        purchaseUnit: it.pu,
        conversionFactor: it.coef ?? 1,
        stocked: !isService,
        criticality: it.crit ?? "STANDARD",
        defaultWarehouseId: isService ? null : (warehouses.get(it.wh ?? "MAG-CENTRAL") ?? null),
        safetyStock: isService ? null : (it.ss ?? null),
        reorderPoint: isService ? null : (it.rp ?? null),
        economicOrderQty: isService ? null : (it.eoq ?? null),
        leadTimeDays: it.lead ?? null,
        mainSupplierId: mainId,
        equipment: it.cat === "PDR" ? (it.eq ?? null) : null,
      },
    });
    for (const [n, [supNo, rawPrice, cur]] of it.s.entries()) {
      const supplierId = supplierIds[supNo - 1];
      // Prix par unité d'achat (cf. ItemSeed.perPack) ; FCFA entier, devises à 2 décimales.
      const factor = it.perPack ? 1 : (it.coef ?? 1);
      const price = cur === "XOF" ? Math.round(rawPrice * factor) : Math.round(rawPrice * factor * 100) / 100;
      const old = cur === "XOF" ? Math.round(price * 0.95) : Math.round(price * 0.95 * 100) / 100;
      const linkData = {
        supplierRef: `REF-${code.slice(-3)}-${n + 1}`,
        lastPrice: price,
        currencyCode: cur,
        lastPriceDate: dayAt(-5),
        priceUnit: it.pu,
        leadTimeDays: SUPPLIERS[supNo - 1].lead,
        minOrderQty: it.moq ?? 1,
      };
      const existing = await prisma.itemSupplier.findUnique({ where: { itemId_supplierId: { itemId: item.id, supplierId } } });
      if (existing) {
        // Reprise des données fictives d'une version précédente (prix par unité de stock, sans unité ni taux).
        if (existing.priceUnit === null || existing.priceUnit !== it.pu || !existing.lastPrice?.eq(price)) {
          await prisma.itemSupplier.update({ where: { id: existing.id }, data: linkData });
          await prisma.itemPriceHistory.deleteMany({ where: { itemId: item.id, supplierId, source: "MANUEL", createdById: null } });
        } else if ((await prisma.itemPriceHistory.count({ where: { itemId: item.id, supplierId } })) > 0) {
          continue;
        }
      } else {
        await prisma.itemSupplier.create({ data: { itemId: item.id, supplierId, ...linkData } });
      }
      // Historique : un prix plus ancien (-5 %), puis le prix actuel, avec le taux figé à leur date.
      await prisma.itemPriceHistory.createMany({
        data: [
          { itemId: item.id, supplierId, price: old, currencyCode: cur, rateToXof: seedRateAt(cur, -120), priceUnit: it.pu, source: "MANUEL", date: dayAt(-120) },
          { itemId: item.id, supplierId, price, currencyCode: cur, rateToXof: seedRateAt(cur, -5), priceUnit: it.pu, source: "MANUEL", date: dayAt(-5) },
        ],
      });
    }
  }

  // Les compteurs automatiques repartent après les codes semés.
  for (const [key, value] of [["FRS", SUPPLIERS.length], ["ART", ITEMS.length]] as const) {
    await prisma.$executeRaw`
      INSERT INTO counters (key, year, value, updated_at) VALUES (${key}, 0, ${value}, now())
      ON CONFLICT (key, year) DO UPDATE SET value = GREATEST(counters.value, ${value}), updated_at = now()`;
  }
}
