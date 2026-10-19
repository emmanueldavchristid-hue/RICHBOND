import { AlertTriangle } from "lucide-react";

/** Avertissement non bloquant : l'article a déjà une DA ou un BC en cours (évite les doublons). */
export function DuplicateWarning({
  messages,
  title = "Attention, cet article est déjà en cours",
  testId = "duplicate-warning",
}: {
  messages: string[];
  title?: string;
  testId?: string;
}) {
  if (messages.length === 0) return null;
  return (
    <div role="status" data-testid={testId} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden /> {title}
      </p>
      <ul className="mt-1 list-disc pl-6">
        {messages.map((m, i) => (
          <li key={i} data-testid={`${testId}-message`}>
            {m}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-amber-900">Vous pouvez continuer : ce message ne bloque rien.</p>
    </div>
  );
}
