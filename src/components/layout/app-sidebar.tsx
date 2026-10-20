"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { NavItems, type NavBadge, type NavLink } from "./nav-items";
import { getSidebarServerSnapshot, getSidebarSnapshot, setSidebarMode, subscribeSidebar } from "./sidebar-state";

/** Logotype texte : « RICHBOND » (600, interlettrage 0,08 em) et « Achats & Stocks ». */
export function Logotype({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) return <p className="text-lg font-semibold text-white">R</p>;
  return (
    <div>
      <p className="text-[17px] leading-5 font-semibold tracking-[0.08em] text-white">RICHBOND</p>
      <p className="mt-0.5 text-xs text-sidebar-muted">Achats &amp; Stocks</p>
    </div>
  );
}

/** Menu latéral : 240 px, repliable à 64 px, fond --sidebar, sections titrées, compteurs, utilisateur et bascule de thème en bas. */
export function AppSidebar({
  items,
  badges,
  name,
  roleLabel,
}: {
  items: NavLink[];
  badges: Record<string, NavBadge[]>;
  name: string;
  roleLabel: string;
}) {
  const mode = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  const collapsed = mode === "collapsed";
  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar py-4 text-sidebar-foreground transition-[width] duration-150 lg:flex",
        collapsed ? "w-16 px-2" : "w-60 px-3",
      )}
    >
      <div className={cn("mb-6 flex h-10 items-center", collapsed ? "justify-center" : "px-3")}>
        <Logotype collapsed={collapsed} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavItems items={items} badges={badges} collapsed={collapsed} />
      </div>
      <div className="mt-3 border-t border-sidebar-border pt-3">
        <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "px-1")}>
          <Avatar name={name} size={32} />
          {collapsed ? null : (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-white" data-testid="sidebar-user">
                {name}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{roleLabel}</p>
            </div>
          )}
        </div>
        <div className={cn("mt-2 flex gap-1", collapsed ? "flex-col items-center" : "px-1")}>
          <ThemeToggle showLabel={!collapsed} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" />
          <button
            type="button"
            onClick={() => setSidebarMode(collapsed ? "expanded" : "collapsed")}
            aria-label={collapsed ? "Déployer le menu" : "Replier le menu"}
            title={collapsed ? "Déployer le menu" : "Replier le menu"}
            data-testid="sidebar-toggle"
            className="ml-auto inline-flex h-9 items-center justify-center rounded-lg px-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
          </button>
        </div>
      </div>
    </aside>
  );
}
