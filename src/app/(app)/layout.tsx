import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LicenseShell } from "@/components/license/license-shell";
import { PageSkeleton } from "@/components/page-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
      <LicenseShell>
        <AppShell>
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </AppShell>
      </LicenseShell>
    </Suspense>
  );
}
