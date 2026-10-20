"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { getNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(app)/notifications/actions";
import { DateCell } from "@/components/date-cell";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  severity: "INFO" | "IMPORTANT" | "CRITIQUE";
  title: string;
  body: string | null;
  link: string;
  readAt: Date | string | null;
  createdAt: Date | string;
}

const REFRESH_MS = 60_000;
const DOT: Record<Row["severity"], string> = {
  INFO: "bg-sky-600",
  IMPORTANT: "bg-amber-500",
  CRITIQUE: "bg-red-700",
};

async function fetchNotifications(): Promise<{ unread: number; items: Row[] } | null> {
  try {
    const r = await getNotificationsAction({ limit: 10 });
    return r.ok ? { unread: r.data.unread, items: r.data.items as Row[] } : null;
  } catch {
    return null; // réseau indisponible : on garde l'affichage précédent
  }
}

/** Cloche de l'en-tête : compteur de non lues, 10 dernières, rafraîchie à la navigation et toutes les 60 s. */
export function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  // À chaque navigation, à l'ouverture du panneau, puis toutes les 60 s.
  useEffect(() => {
    let off = false;
    const tick = () =>
      void fetchNotifications().then((d) => {
        if (off || !d) return;
        setUnread(d.unread);
        setItems(d.items);
        setLoaded(true);
      });
    tick();
    const t = window.setInterval(tick, REFRESH_MS);
    return () => {
      off = true;
      window.clearInterval(t);
    };
  }, [pathname, open]);

  async function openItem(n: Row) {
    setOpen(false);
    if (!n.readAt) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationReadAction({ id: n.id });
    }
    router.push(n.link);
  }

  async function markAll() {
    const r = await markAllNotificationsReadAction({});
    if (r.ok) {
      setItems((p) => p.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })));
      setUnread(0);
      toast.success("Toutes les notifications sont marquées comme lues.");
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" className="relative size-9" />}
        aria-label={unread > 0 ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        data-testid="notifications"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white"
            data-testid="notifications-count"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1.5rem)] p-0" data-testid="notifications-panel">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button variant="ghost" className="h-11 px-3 text-sm" disabled={unread === 0} onClick={() => void markAll()} data-testid="notifications-mark-all">
            <CheckCheck /> Tout marquer lu
          </Button>
        </div>
        {!loaded ? (
          <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground" data-testid="notifications-empty">
            Aucune notification.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto" data-testid="notifications-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn("flex min-h-14 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted", !n.readAt && "bg-sky-50/60")}
                  onClick={() => void openItem(n)}
                  data-testid="notification-item"
                  data-unread={!n.readAt}
                >
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.readAt ? "bg-transparent ring-1 ring-slate-300 ring-inset" : DOT[n.severity])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="block text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      <DateCell value={n.createdAt} withTime />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
