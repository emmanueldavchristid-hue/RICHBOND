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

const ICONS: Record<string, LucideIcon> = { Home, ShoppingCart, Ship, Warehouse, Package, Truck, BarChart3, Settings, KeyRound };

export function NavItems({ items, onNavigate }: { items: NavLink[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1" data-testid="main-nav">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Home;
        const hasChildEntry = items.some((o) => o.href !== item.href && o.href.startsWith(item.href + "/"));
        const active =
          pathname === item.href || (!hasChildEntry && pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-${item.href.slice(1)}`}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
