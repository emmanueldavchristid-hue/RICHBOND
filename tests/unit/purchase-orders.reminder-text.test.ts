import { describe, expect, it } from "vitest";
import { mailtoLink, reminderText, sendText, whatsappLink, whatsappNumber } from "@/modules/purchase-orders/reminder-text";

const base = {
  orderNumber: "BC-2026-00042",
  orderDate: new Date("2026-10-05T00:00:00Z"),
  contactName: "M. Koffi",
  expectedDate: new Date("2026-11-10T00:00:00Z"),
  daysLate: 4,
  lines: [
    { designation: "ART-00012 – Roulement 6205", remainingQty: "40", unit: "U" },
    { designation: "ART-00020 – Graisse EP2", remainingQty: "12.5", unit: "KG" },
    { designation: "ART-00031 – Joint", remainingQty: "0", unit: "U" },
  ],
  buyerName: "Acheteur Local",
  companyName: "RICHBOND CI",
};

describe("texte de relance (D20)", () => {
  it("cite le numéro, la date du bon, la date attendue et le retard", () => {
    const t = reminderText(base);
    expect(t).toContain("Bonjour M. Koffi,");
    expect(t).toContain("bon de commande BC-2026-00042 du 05/10/2026");
    expect(t).toContain("attendue le 10/11/2026, soit 4 jours de retard");
  });

  it("liste seulement les lignes restant à recevoir, avec quantités et unités", () => {
    const t = reminderText(base);
    expect(t).toContain("- ART-00012 – Roulement 6205 : 40 U");
    expect(t).toContain("- ART-00020 – Graisse EP2 : 12,5 KG");
    expect(t).not.toContain("Joint");
  });

  it("pas de retard : formulation neutre ; un jour de retard : singulier", () => {
    expect(reminderText({ ...base, daysLate: 0 })).toContain("La livraison est attendue le 10/11/2026.");
    expect(reminderText({ ...base, daysLate: 1 })).toContain("soit 1 jour de retard");
  });

  it("sans contact : « Bonjour, » ; signature acheteur et société", () => {
    const t = reminderText({ ...base, contactName: null });
    expect(t.startsWith("Bonjour,\n")).toBe(true);
    expect(t.trim().endsWith("Acheteur Local\nRICHBOND CI")).toBe(true);
  });

  it("tout reçu : pas de rubrique « Reste à livrer »", () => {
    expect(reminderText({ ...base, lines: [] })).not.toContain("Reste à livrer");
  });
});

describe("liens de contact", () => {
  it("numéro WhatsApp normalisé (indicatif ivoirien ajouté aux 10 chiffres locaux)", () => {
    expect(whatsappNumber("07 08 09 10 11")).toBe("2250708091011");
    expect(whatsappNumber("+225 07 08 09 10 11")).toBe("2250708091011");
    expect(whatsappNumber("00225 0708091011")).toBe("2250708091011");
    expect(whatsappNumber("+86 138 1234 5678")).toBe("8613812345678");
    expect(whatsappNumber("12 34")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("lien wa.me avec le texte encodé ; absent sans numéro", () => {
    const l = whatsappLink("0708091011", "Bonjour & merci");
    expect(l).toBe("https://wa.me/2250708091011?text=Bonjour%20%26%20merci");
    expect(whatsappLink("", "x")).toBeNull();
  });

  it("lien mailto avec objet et corps encodés", () => {
    expect(mailtoLink("achats@fournisseur.ci", "Relance BC", "Ligne 1\nLigne 2")).toBe("mailto:achats@fournisseur.ci?subject=Relance%20BC&body=Ligne%201%0ALigne%202");
    expect(mailtoLink(null, "a", "b")).toBeNull();
  });
});

describe("texte d'envoi du PDF (D17)", () => {
  it("cite le numéro et la date de livraison demandée, signé de l'acheteur", () => {
    const t = sendText({ orderNumber: "BC-2026-00042 v2", contactName: "M. Koffi", requestedDate: new Date("2026-11-20T00:00:00Z"), buyerName: "Acheteur Local", companyName: "RICHBOND CI" });
    expect(t).toContain("Bonjour M. Koffi,");
    expect(t).toContain("notre bon de commande BC-2026-00042 v2");
    expect(t).toContain("Livraison demandée le 20/11/2026");
    expect(t.trim().endsWith("Acheteur Local\nRICHBOND CI")).toBe(true);
  });
});
