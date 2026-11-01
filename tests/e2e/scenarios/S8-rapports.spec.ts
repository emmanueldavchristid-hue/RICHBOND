import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";
import { setTestNow } from "../helpers/clock";
import { ready, t, title } from "../helpers/da";
import { resetLicense } from "../helpers/license";

/**
 * S8 – Rapports quotidien, hebdomadaire et mensuel (LOT-15, EX-61 à EX-63).
 * Le Responsable ouvre les trois rapports, applique un filtre et télécharge le PDF et l'Excel de chacun ;
 * l'Acheteur local n'a que son périmètre ; le Magasinier n'a accès à aucun rapport achats.
 */
test.beforeEach(async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Parcours joué une seule fois (desktop).");
  await resetLicense(30);
  await setTestNow(context, null);
});
test.afterAll(async () => {
  await resetLicense(30);
});

const KINDS = [
  { kind: "quotidien", heading: "Rapport quotidien", kpi: "rpt-kpi-bc-emis" },
  { kind: "hebdomadaire", heading: "Rapport hebdomadaire", kpi: "rpt-kpi-bc-emis" },
  { kind: "mensuel", heading: "Rapport mensuel", kpi: "rpt-kpi-montant-achete" },
] as const;

async function download(page: Page, testId: string): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent("download"), t(page, testId).click()]);
  const path = await dl.path();
  return readFileSync(path);
}

test("S8 – Rapports : le Responsable consulte et exporte les 3 rapports, le Magasinier n'y a pas accès", async ({
  page,
}) => {
  await test.step("Le Responsable voit la liste des rapports", async () => {
    await loginAs(page, "RESPONSABLE_ACHATS");
    await ready(page, "/rapports");
    await expect(title(page)).toHaveText("Rapports");
    for (const k of KINDS) await expect(t(page, `rpt-card-${k.kind}`)).toBeVisible();
  });

  for (const k of KINDS) {
    await test.step(`Rapport ${k.kind} : indicateurs, infobulle, export PDF et Excel`, async () => {
      await ready(page, `/rapports/${k.kind}`);
      await expect(title(page)).toHaveText(k.heading);
      await expect(t(page, "rpt-period")).toBeVisible();
      await expect(t(page, k.kpi)).toBeVisible();
      await expect(
        t(page, "rpt-kpis")
          .getByRole("button", { name: /^Aide :/ })
          .first(),
      ).toBeVisible();
      if (k.kind === "mensuel") {
        // Données des lots non livrés : annoncées, pas inventées.
        await expect(t(page, "rpt-kpi-gains-achats")).toContainText("Non disponible");
        await expect(t(page, "rpt-kpi-evaluation-fournisseurs")).toContainText("Non disponible");
      }
      const pdf = await download(page, "rpt-export-pdf");
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      const xlsx = await download(page, "rpt-export-xlsx");
      expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    });
  }

  await test.step("Un filtre (catégorie) est appliqué et repris dans l'en-tête et l'export", async () => {
    await ready(page, "/rapports/mensuel");
    await t(page, "rpt-f-category").selectOption("PDR");
    await t(page, "rpt-apply").click();
    await expect(page).toHaveURL(/category=PDR/);
    await expect(t(page, "rpt-period")).toContainText("Catégorie : Pièces de rechange");
    await expect(t(page, "rpt-export-pdf")).toHaveAttribute("href", /category=PDR/);
    const xlsx = await download(page, "rpt-export-xlsx");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    await logout(page);
  });

  await test.step("L'Acheteur local voit son périmètre et reste limité aux achats locaux", async () => {
    await loginAs(page, "ACHETEUR_LOCAL");
    await ready(page, "/rapports");
    await expect(t(page, "rpt-scope-note")).toContainText("locaux");
    await ready(page, "/rapports/mensuel");
    await expect(t(page, "rpt-period")).toContainText("Périmètre : Achats locaux");
    await expect(t(page, "rpt-unavailable-import")).toBeVisible();
    await logout(page);
  });

  await test.step("Le Magasinier n'a accès à aucun rapport achats (écran, adresse et export)", async () => {
    await loginAs(page, "MAGASINIER");
    await ready(page, "/rapports");
    await expect(t(page, "rpt-list")).toHaveCount(0);
    await expect(t(page, "empty-state")).toContainText("Aucun rapport disponible");
    for (const k of KINDS) {
      await page.goto(`/rapports/${k.kind}`);
      await expect(page).toHaveURL(/\/acces-refuse/);
    }
    const res = await page.request.get("/api/rapports/mensuel?format=pdf");
    expect(res.status()).toBe(403);
    await logout(page);
  });
});
