import type { ComponentProps, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Libellé + champ + aide + message d'erreur. L'identifiant du champ doit être `id`. */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" data-testid={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Zone de texte sur plusieurs lignes, alignée sur le style des champs. */
export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function FormError({ message, testId = "form-error" }: { message: string | null; testId?: string }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid={testId} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </div>
  );
}
