import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { SETTING_DEFS, updateSettingSchema, type AppSettings, type SettingKey } from "./keys";

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const get = <T>(k: SettingKey): T => {
    const parsed = SETTING_DEFS[k].schema.safeParse(byKey.get(k));
    return (parsed.success ? parsed.data : SETTING_DEFS[k].default) as T;
  };
  return {
    showPurchasePriceToWarehouse: get<boolean>("warehouse.showPurchasePrice"),
    purchaseRequestApprovalThreshold: get<number>("purchaseRequest.approvalThreshold"),
    purchaseOrderApprovalThreshold: get<number>("purchaseOrder.approvalThreshold"),
    purchaseOrderDefaultVatRate: get<0 | 9 | 18>("purchaseOrder.defaultVatRate"),
    purchaseOrderPriceAlertPct: get<number>("purchaseOrder.priceAlertPct"),
    purchaseOrderReminderAfterDays: get<number>("purchaseOrder.reminderAfterDays"),
    company: {
      name: get<string>("company.name"),
      address: get<string>("company.address"),
      phone: get<string>("company.phone"),
      email: get<string>("company.email"),
      legalIds: get<string>("company.legalIds"),
    },
    purchaseOrderPdfFooter: get<string>("purchaseOrder.pdfFooter"),
    purchaseOrderPdfConditions: get<string>("purchaseOrder.pdfConditions"),
    receiptOverDeliveryPct: get<number>("receipt.overDeliveryPct"),
    receiptShowPricesToStorekeeper: get<boolean>("receipt.showPricesToStorekeeper"),
    stockConsumptionWindowDays: get<number>("stock.consumptionWindowDays"),
    stockDefaultLeadTimeDays: get<number>("stock.defaultLeadTimeDays"),
    stockDormantDays: get<number>("stock.dormantDays"),
    inventoryThresholdPct: get<number>("inventory.thresholdPct"),
    inventoryThresholdValue: get<number>("inventory.thresholdValue"),
    invoicePriceTolerancePct: get<number>("invoice.priceTolerancePct"),
    invoiceQtyTolerance: get<number>("invoice.qtyTolerance"),
  };
}

export async function updateSetting(actor: Actor, raw: { key: string; value: unknown }, ip?: string | null) {
  const input = updateSettingSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: input.key } });
    const value = input.value as Prisma.InputJsonValue;
    const after = await tx.setting.upsert({
      where: { key: input.key },
      update: { value, updatedById: actor.id },
      create: { key: input.key, value, updatedById: actor.id },
    });
    await log(tx, {
      userId: actor.id, ip,
      action: "SETTING_UPDATE",
      entity: "Setting",
      entityId: input.key,
      before: before ? { value: before.value } : { value: SETTING_DEFS[input.key].default },
      after: { value: after.value },
    });
    return { key: after.key, value: after.value };
  });
}
