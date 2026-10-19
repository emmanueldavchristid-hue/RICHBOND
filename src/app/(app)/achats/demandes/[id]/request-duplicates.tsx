"use client";

import { useEffect, useState } from "react";
import { DuplicateWarning } from "@/components/purchase-requests/duplicate-warning";
import { checkDuplicatesAction } from "../actions";

/** Rappel des doublons (D13) à la validation : mêmes articles déjà demandés ou commandés ailleurs. Non bloquant. */
export function RequestDuplicates({ requestId, itemIds }: { requestId: string; itemIds: string[] }) {
  const [messages, setMessages] = useState<string[]>([]);
  const key = itemIds.join("|");
  useEffect(() => {
    if (itemIds.length === 0) return;
    let cancelled = false;
    void checkDuplicatesAction({ itemIds, excludeId: requestId }).then((r) => {
      if (cancelled || !r.ok) return;
      setMessages(r.data.flatMap((w) => w.messages.map((m) => `${w.itemCode} – ${w.itemName} : ${m}`)));
    });
    return () => {
      cancelled = true;
    };
    // key résume itemIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, requestId]);
  return <DuplicateWarning messages={messages} title="Attention : doublons possibles avec d'autres demandes ou commandes" testId="pr-duplicates" />;
}
