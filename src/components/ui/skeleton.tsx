import { cn } from "@/lib/utils";

/** Zone grise animée : jamais de page blanche pendant un chargement. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
