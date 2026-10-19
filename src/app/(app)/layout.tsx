import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/page-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <AppShell>
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </AppShell>
    </Suspense>
  );
}
