"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsBell } from "./notifications-bell";
import { NavItems, type NavLink } from "./nav-items";
import { UserMenu } from "./user-menu";
import { TrialBadgeSlot } from "./trial-badge-slot";

export function AppHeader({
  items,
  name,
  roleLabel,
  minimal,
}: {
  items: NavLink[];
  name: string;
  roleLabel: string;
  /** Première connexion : pas de menu, pas de lien Mon compte. */
  minimal: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header
      data-testid="app-header"
      className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4"
    >
      {minimal ? (
        <p className="text-lg font-bold tracking-wide text-primary lg:hidden">RICHBOND</p>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="size-11 lg:hidden" />}
            aria-label="Ouvrir le menu"
            data-testid="menu-toggle"
          >
            <Menu className="size-6" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="text-primary">RICHBOND</SheetTitle>
            </SheetHeader>
            <NavItems items={items} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
      <div className="flex-1" />
      <TrialBadgeSlot />
      {minimal ? null : <NotificationsBell />}
      <UserMenu name={name} roleLabel={roleLabel} showAccountLink={!minimal} />
    </header>
  );
}
