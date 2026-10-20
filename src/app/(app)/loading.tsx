import { PageSkeleton } from "@/components/page-header";

/** Squelette affiché pendant le chargement d'une page : jamais de page blanche. */
export default function Loading() {
  return <PageSkeleton />;
}
