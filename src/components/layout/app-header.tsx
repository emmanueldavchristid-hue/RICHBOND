"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { NavItems, type NavBadge, type NavLink } from "./nav-items";
import { UserMenu } from "./user-menu";
import { TrialBadgeSlot } from "./trial-badge-slot";
import { Logotype } from "./app-sidebar";

/** En-tête de 56 px : fil d'Ariane à gauche ; recherche (Ctrl+K), badge d'essai, cloche et avatar à droite. */
export function AppHeader({
  items,
  badges,
  name,
  roleLabel,
  minimal,
}: {
  items: NavLink[];
  badges: Record<string, NavBadge[]>;
  name: string;
  roleLabel: string;
  /** Première connexion : pas de menu, pas de lien Mon compte. */
  minimal: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header data-testid="app-header" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-6">
      {minimal ? (
        <p className="text-base font-semibold tracking-[0.08em] text-foreground lg:hidden">RICHBOND</p>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="size-11 lg:hidden" />}
            aria-label="Ouvrir le menu"
            data-testid="menu-toggle"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-none bg-sidebar p-4 text-sidebar-foreground">
            <SheetHeader className="p-0 px-3 pt-1">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logotype />
            </SheetHeader>
            <NavItems items={items} badges={badges} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
      <div className="min-w-0 flex-1">{minimal ? null : <Breadcrumbs />}</div>
      {minimal ? null : <GlobalSearch />}
      <TrialBadgeSlot />
      {minimal ? null : <NotificationsBell />}
      <UserMenu name={name} roleLabel={roleLabel} showAccountLink={!minimal} />
    </header>
  );
}
