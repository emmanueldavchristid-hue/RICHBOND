import { NavItems, type NavLink } from "./nav-items";

export function AppSidebar({ items }: { items: NavLink[] }) {
  return (
    <aside
      data-testid="sidebar"
      className="hidden w-60 shrink-0 flex-col gap-6 border-r bg-card p-4 lg:flex"
    >
      <div>
        <p className="text-xl font-bold tracking-wide text-primary">RICHBOND</p>
        <p className="text-xs text-muted-foreground">Achats &amp; Stocks</p>
      </div>
      <NavItems items={items} />
    </aside>
  );
}
