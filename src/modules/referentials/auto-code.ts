import type { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { formatDocumentNumber, nextNumber } from "@/modules/numbering";

/**
 * R1 : code généré dans la transaction (ART-00001, FRS-00001). Saute les codes déjà saisis à la main.
 * `exists` doit interroger la même transaction.
 */
export async function generateCode(
  tx: Prisma.TransactionClient,
  key: "ART" | "FRS",
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const n = await nextNumber(key, 0, tx);
    const code = formatDocumentNumber(key, 0, n);
    if (!(await exists(code))) return code;
  }
  throw new BusinessError("CODE_GENERATION", "Impossible de générer un code libre. Saisissez un code manuellement.");
}
