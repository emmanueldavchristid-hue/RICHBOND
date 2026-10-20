"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { PAGE_SIZES } from "@/modules/referentials/list-query";

/** « 1–25 sur 148 », précédent / suivant (boutons tactiles) et taille de page. */
export function Pagination({
  testId,
  page,
  pageSize,
  total,
  pageCount,
  shown,
  onPage,
  onSize,
  pending,
}: {
  testId: string;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  shown: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  pending: boolean;
}) {
  const from = shown === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = shown === 0 ? 0 : (page - 1) * pageSize + shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]" data-testid={`${testId}-pagination`}>
      <span className="text-muted-foreground" data-testid={`${testId}-range`} aria-live="polite">
        {from}–{to} sur {total}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          Lignes par page
          <NativeSelect
            value={String(pageSize)}
            onChange={(e) => onSize(Number(e.target.value))}
            className="h-8 w-20 text-[13px] md:text-[13px]"
            aria-label="Lignes par page"
            data-testid={`${testId}-size`}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-8 px-2.5 text-[13px]"
          disabled={page <= 1 || pending}
          onClick={() => onPage(page - 1)}
          data-testid={`${testId}-prev`}
        >
          <ChevronLeft /> Précédent
        </Button>
        <span className="min-w-20 text-center tabular-nums" data-testid={`${testId}-page`}>
          Page {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-8 px-2.5 text-[13px]"
          disabled={page >= pageCount || pending}
          onClick={() => onPage(page + 1)}
          data-testid={`${testId}-next`}
        >
          Suivant <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
