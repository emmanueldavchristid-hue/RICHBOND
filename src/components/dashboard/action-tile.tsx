import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/money";
import type { ActionCard, CardTone } from "@/modules/reporting/types";

/**
 * Identifiants de test hérités du LOT-05 (pastilles d'accueil) : conservés pour les scénarios existants.
 * Clé de carte -> data-testid du lien.
 */
const LEGACY_LINK_TESTIDS: Record<string, string> = {
  "da-a-valider": "accueil-a-valider",
  "mes-da": "accueil-assignees",
  "bc-a-valider": "accueil-bc-a-valider",
  "bc-en-retard": "accueil-bc-en-retard",
  "mes-bc-en-retard": "accueil-bc-en-retard",
  "mes-bc-a-relancer": "accueil-bc-a-relancer",
};

const TONE_VALUE: Record<CardTone, string> = {
  neutral: "text-foreground",
  attention: "text-[#B45309] dark:text-amber-400",
  critical: "text-[#B91C1C] dark:text-red-400",
};
const TONE_BAR: Record<CardTone, string> = {
  neutral: "bg-transparent",
  attention: "bg-[#D97706]",
  critical: "bg-[#DC2626]",
};

/**
 * Carte « à traiter » : un nombre, un libellé, un clic vers la liste filtrée.
 * Un compteur à 0 reste neutre (jamais rouge) ; seul un compteur non nul prend le ton d'alerte.
 */
export function ActionTile({ card, large = false }: { card: ActionCard; large?: boolean }) {
  const tone: CardTone = card.count === 0 ? "neutral" : card.tone;
  const legacy = LEGACY_LINK_TESTIDS[card.key];
  return (
    <div
      className="group relative flex overflow-hidden rounded-xl border bg-card transition-colors hover:border-input hover:bg-background"
      data-testid={`dash-action-${card.key}`}
      data-tone={tone}
      data-count={card.count}
    >
      <span className={cn("w-[3px] shrink-0", TONE_BAR[tone])} aria-hidden />
      <Link
        href={card.href}
        className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={legacy ?? `dash-action-${card.key}-link`}
        data-dash-link={`dash-action-${card.key}-link`}
      >
        <span className="sr-only">{`${card.label} : ${card.count}`}</span>
      </Link>
      <div className={cn("min-w-0 flex-1 px-4", large ? "py-5" : "py-3.5")}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] leading-5 font-medium text-muted-foreground">{card.label}</p>
          <ArrowUpRight
            className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>
        <p
          className={cn(
            "mt-0.5 font-semibold tracking-tight tabular-nums",
            large ? "text-4xl leading-10" : "text-[28px] leading-9",
            TONE_VALUE[tone],
          )}
          data-testid={`dash-action-${card.key}-count`}
        >
          {formatNumber(card.count, 0)}
        </p>
        {card.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p> : null}
      </div>
    </div>
  );
}

/** Rangée de cartes « à traiter » ; `cols` adapte la grille au nombre de cartes. */
export function ActionTiles({
  cards,
  large = false,
  testId = "dash-actions",
}: {
  cards: ActionCard[];
  large?: boolean;
  testId?: string;
}) {
  if (cards.length === 0) return null;
  const cols =
    cards.length >= 5
      ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      : cards.length === 4
        ? "sm:grid-cols-2 xl:grid-cols-4"
        : cards.length === 3
          ? "sm:grid-cols-3"
          : "sm:grid-cols-2";
  return (
    <section aria-label="À traiter" className={cn("grid gap-3", cols)} data-testid={testId}>
      {cards.map((c) => (
        <ActionTile key={c.key} card={c} large={large} />
      ))}
    </section>
  );
}
