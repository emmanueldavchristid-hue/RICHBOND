"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { ExportButton, Toolbar, type FilterDef } from "./toolbar";
import { Pagination } from "./pagination";
import { useTableUrl } from "./use-table-url";

export type { FilterDef, FilterOption } from "./toolbar";

/** Colonne d'une liste : rendu libre, tri serveur si `sortable` (l'id est le nom du champ trié côté serveur). */
export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** Figée à gauche sur tablette : « first » (code), « second » (désignation, décalée de la première). */
  sticky?: "first" | "second";
  align?: "right";
  className?: string;
  /** Vue cartes : titre, sous-titre, ou masquée. Les autres colonnes deviennent des lignes « libellé : valeur ». */
  mobile?: "title" | "subtitle" | "hide";
}

export interface DataTablePageInfo {
  total: number;
  page: number;
  taille: number;
  pageCount: number;
}

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });

const STICKY: Record<"first" | "second", string> = {
  first: "max-lg:sticky max-lg:left-0 max-lg:z-10 max-lg:bg-card max-lg:min-w-28",
  second: "max-lg:sticky max-lg:left-28 max-lg:z-10 max-lg:bg-card max-lg:min-w-44 max-lg:shadow-[1px_0_0_var(--border)]",
};

/**
 * Liste paginée côté serveur : tri, recherche, filtres et pagination vivent dans l'URL, la page serveur
 * relit les données à chaque changement. TanStack Table en mode manuel pilote les en-têtes et les lignes.
 */
export function DataTable<T extends { id: string }>({
  testId,
  columns,
  rows,
  pageInfo,
  defaultSort,
  filters = [],
  searchPlaceholder = "Rechercher",
  exportHref,
  rowHref,
  rowTestId,
  emptyTitle = "Aucun résultat",
  emptyDescription = "Modifiez la recherche ou les filtres.",
  toolbarExtra,
}: {
  testId: string;
  columns: DataColumn<T>[];
  rows: T[];
  pageInfo: DataTablePageInfo;
  defaultSort: { id: string; dir: "asc" | "desc" };
  filters?: FilterDef[];
  searchPlaceholder?: string;
  /** Route d'export Excel (ex. /api/export/articles) : reçoit les mêmes filtres que la liste. */
  exportHref?: string;
  rowHref?: (row: T) => string;
  rowTestId?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbarExtra?: ReactNode;
}) {
  const router = useRouter();
  const url = useTableUrl();

  const sortId = url.get("tri") || defaultSort.id;
  const sortDir = (url.get("ordre") || defaultSort.dir) === "desc" ? "desc" : "asc";
  const sorting = useMemo<SortingState>(() => [{ id: sortId, desc: sortDir === "desc" }], [sortId, sortDir]);

  const defs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        accessorFn: () => null,
        cell: (ctx: { row: { original: T } }) => c.cell(ctx.row.original),
        enableSorting: !!c.sortable,
      })) as ColumnDef<typeof features, T>[],
    [columns],
  );

  const table = useTable<typeof features, T>({
    features,
    columns: defs,
    data: rows,
    getRowId: (r) => r.id,
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    rowCount: pageInfo.total,
    state: { sorting, pagination: { pageIndex: pageInfo.page - 1, pageSize: pageInfo.taille } },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (first) url.setParams({ tri: first.id, ordre: first.desc ? "desc" : "asc" });
    },
  });

  const byId = new Map(columns.map((c) => [c.id, c]));
  const filterParams = ["q", ...filters.map((f) => f.param)];
  const canReset = filterParams.some((p) => url.get(p) !== "");
  const resetPatch = Object.fromEntries(filterParams.map((p) => [p, undefined]));

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subtitleCol = columns.find((c) => c.mobile === "subtitle");
  const fieldCols = columns.filter((c) => c !== titleCol && c !== subtitleCol && c.mobile !== "hide");

  const rowKey = (r: T) => rowTestId?.(r) ?? `${testId}-row`;

  return (
    <div className="space-y-4" data-testid={testId} aria-busy={url.isPending}>
      <Toolbar
        testId={testId}
        searchValue={url.get("q")}
        searchPlaceholder={searchPlaceholder}
        onSearch={(v) => url.setParams({ q: v })}
        filters={filters}
        getParam={url.get}
        onFilter={(p, v) => url.setParams({ [p]: v })}
        onReset={() => url.setParams(resetPatch)}
        canReset={canReset}
        exportButton={exportHref ? <ExportButton href={exportHref} query={url.filterQuery()} testId={`${testId}-export`} /> : null}
        extra={toolbarExtra}
      />

      <div className={cn("transition-opacity", url.isPending && "opacity-60")}>
        {rows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <>
            {/* Tablette et ordinateur : tableau */}
            <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
              <table className="w-full caption-bottom text-sm" data-testid={`${testId}-table`}>
                <thead className="bg-muted/50 [&_tr]:border-b">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => {
                        const col = byId.get(h.column.id);
                        const active = sortId === h.column.id;
                        const canSort = h.column.getCanSort();
                        return (
                          <th
                            key={h.id}
                            scope="col"
                            aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                            className={cn(
                              "h-12 px-3 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                              col?.align === "right" && "text-right",
                              col?.sticky && STICKY[col.sticky],
                              col?.sticky && "bg-muted",
                            )}
                          >
                            {canSort ? (
                              <button
                                type="button"
                                onClick={h.column.getToggleSortingHandler()}
                                className="-mx-2 inline-flex h-11 items-center gap-1 rounded-md px-2 uppercase hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                                data-testid={`${testId}-sort-${h.column.id}`}
                              >
                                {col?.header}
                                {active ? (
                                  sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                                ) : (
                                  <ArrowUpDown className="size-3.5 opacity-40" />
                                )}
                              </button>
                            ) : (
                              col?.header
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {table.getRowModel().rows.map((row) => {
                    const href = rowHref?.(row.original);
                    return (
                      <tr
                        key={row.id}
                        data-testid={rowKey(row.original)}
                        onClick={
                          href
                            ? (e) => {
                                if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
                                router.push(href);
                              }
                            : undefined
                        }
                        className={cn("border-b transition-colors hover:bg-muted/50", href && "cursor-pointer")}
                      >
                        {row.getAllCells().map((cell) => {
                          const col = byId.get(cell.column.id);
                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                "min-h-12 px-3 py-3 align-middle",
                                col?.align === "right" && "text-right tabular-nums",
                                col?.sticky && STICKY[col.sticky],
                                col?.className,
                              )}
                            >
                              {col?.cell(row.original)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Téléphone et petite tablette : cartes */}
            <ul className="space-y-3 md:hidden" data-testid={`${testId}-cards`}>
              {rows.map((r) => {
                const href = rowHref?.(r);
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 font-medium">{titleCol?.cell(r)}</div>
                    </div>
                    {subtitleCol ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitleCol.cell(r)}</div> : null}
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      {fieldCols.map((c) => (
                        <div key={c.id} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.header}</dt>
                          <dd className="truncate">{c.cell(r)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                );
                return (
                  <li key={r.id} data-testid={`${rowKey(r)}-card`} className="rounded-lg border bg-card">
                    {href ? (
                      <Link href={href} className="block min-h-14 rounded-lg p-4 hover:bg-muted/50">
                        {body}
                      </Link>
                    ) : (
                      <div className="p-4">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <Pagination
        testId={testId}
        page={pageInfo.page}
        pageSize={pageInfo.taille}
        total={pageInfo.total}
        pageCount={pageInfo.pageCount}
        shown={rows.length}
        pending={url.isPending}
        onPage={(p) => url.setParams({ page: Math.min(p, pageInfo.pageCount) > 1 ? String(Math.min(p, pageInfo.pageCount)) : undefined })}
        onSize={(s) => url.setParams({ taille: s === 25 ? undefined : String(s) })}
      />
    </div>
  );
}
