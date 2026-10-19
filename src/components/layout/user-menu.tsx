"use client";

import Link from "next/link";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(auth)/connexion/actions";

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
        className="flex h-11 items-center gap-2 rounded-lg px-2 text-left hover:bg-muted"
      >
        <UserRound className="size-5 text-muted-foreground" />
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-sm font-medium" data-testid="user-name">
            {name}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="user-role">
            {roleLabel}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-1.5 py-1.5 sm:hidden">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        {showAccountLink ? (
          <DropdownMenuItem
            className="h-10"
            render={<Link href="/mon-compte" data-testid="menu-mon-compte" />}
          >
            Mon compte
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-10"
          data-testid="menu-deconnexion"
          onClick={() => void logoutAction()}
        >
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
