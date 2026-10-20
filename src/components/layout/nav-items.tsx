"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Home,
  KeyRound,
  Settings,
  Ship,
  ShoppingCart,
  Truck,
  Package,
  PackageCheck,
  ShieldAlert,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Élément de menu sérialisable (calculé côté serveur par `visibleNav`). */
export interface NavLink {
  label: string;
  href: string;
  icon: string;
}

/** Pastille de compteur d'un élément du menu (ex. « 3 DA à valider »). */
export interface NavBadge {
  count: number;
  tone: "warn" | "danger";
  /** Phrase lue au survol et par les lecteurs d'écran. */
  label: string;
}

const ICONS: Record<string, LucideIcon> = { Home, ShoppingCart, Ship, Warehouse, Package, PackageCheck, ShieldAlert, Truck, BarChart3, Settings, KeyRound };

/** Sections du menu (DESIGN.md §5). Un élément absent de la liste rejoint la dernière section. */
const SECTIONS: { title: string | null; hrefs: string[] }[] = [
  { title: null, hrefs: ["/accueil"] },
  { title: "Achats", hrefs: ["/achats", "/import"] },
  { title: "Stock", hrefs: ["/stock", "/stock/receptions", "/stock/receptions/non-conformites", "/stock/articles"] },
  { title: "Fournisseurs", hrefs: ["/fournisseurs"] },
  { title: "Pilotage", hrefs: ["/rapports"] },
  { title: "Paramètres", hrefs: ["/parametres", "/parametres/licence"] },
];

const PILL = {
  warn: "bg-[#E8A13A]/20 text-[#F4C06F]",
  danger: "bg-[#DC2626]/25 text-[#FCA5A5]",
} as const;

export function NavItems({
  items,
  badges = {},
  collapsed = false,
  onNavigate,
}: {
  items: NavLink[];
  badges?: Record<string, NavBadge[]>;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const known = new Set(SECTIONS.flatMap((s) => s.hrefs));
  const groups = SECTIONS.map((s, i) => ({
    title: s.title,
    items: items.filter((it) => s.hrefs.includes(it.href) || (i === SECTIONS.length - 1 && !known.has(it.href))),
  })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-4" data-testid="main-nav">
      {groups.map((g, gi) => (
        <div key={g.title ?? "top"} className="flex flex-col gap-0.5">
          {g.title ? (
            collapsed ? (
              gi > 0 ? <div className="mx-3 mb-1 h-px bg-sidebar-border" aria-hidden /> : null
            ) : (
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase">{g.title}</p>
            )
          ) : null}
          {g.items.map((item) => {
            const Icon = ICONS[item.icon] ?? Home;
            const inChildEntry = items.some((o) => o.href !== item.href && o.href.startsWith(item.href + "/") && (pathname === o.href || pathname.startsWith(o.href + "/")));
            const active = pathname === item.href || (!inChildEntry && pathname.startsWith(item.href + "/"));
            const itemBadges = (badges[item.href] ?? []).filter((b) => b.count > 0);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? [item.label, ...itemBadges.map((b) => b.label)].join(", ") : undefined}
                title={collapsed ? item.label : undefined}
                data-testid={`nav-${item.href.slice(1)}`}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150",
                  collapsed ? "justify-center px-0" : "px-3",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" aria-hidden /> : null}
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {itemBadges.length > 0 ? (
                  collapsed ? (
                    <span className={cn("absolute top-1.5 right-2.5 size-2 rounded-full", itemBadges[0].tone === "danger" ? "bg-[#EF4444]" : "bg-[#E8A13A]")} aria-hidden />
                  ) : (
                    <span className="flex items-center gap-1">
                      {itemBadges.map((b) => (
                        <span
                          key={b.label}
                          title={b.label}
                          data-testid={`nav-badge-${item.href.slice(1)}-${b.tone}`}
                          className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums", PILL[b.tone])}
                        >
                          <span aria-hidden>{b.count}</span>
                          <span className="sr-only">{b.label}</span>
                        </span>
                      ))}
                    </span>
                  )
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
