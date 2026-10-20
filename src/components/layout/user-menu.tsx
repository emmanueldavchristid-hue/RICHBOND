"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(auth)/connexion/actions";

/** Avatar à initiales de l'en-tête : ouvre le menu Mon compte / Se déconnecter. */
export function UserMenu({
  name,
  roleLabel,
  showAccountLink,
}: {
  name: string;
  roleLabel: string;
  showAccountLink: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu"
        aria-label={`Menu utilisateur : ${name}`}
        className="flex h-9 items-center gap-2 rounded-lg px-1 text-left transition-colors hover:bg-muted"
      >
        <Avatar name={name} size={30} />
        <span className="hidden flex-col leading-tight xl:flex">
          <span className="text-[13px] font-medium" data-testid="user-name">
            {name}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="user-role">
            {roleLabel}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <DropdownMenuSeparator />
        {showAccountLink ? (
          <DropdownMenuItem className="h-10" render={<Link href="/mon-compte" data-testid="menu-mon-compte" />}>
            <UserRound /> Mon compte
          </DropdownMenuItem>
        ) : null}
        <div className="px-1 py-0.5 lg:hidden">
          <ThemeToggle showLabel className="w-full justify-start hover:bg-accent" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-10" data-testid="menu-deconnexion" onClick={() => void logoutAction()}>
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
