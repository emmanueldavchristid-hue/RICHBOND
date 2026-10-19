"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface SupplierText {
  text: string;
  subject: string;
  whatsappLink: string | null;
  mailtoLink: string | null;
  contact: { name: string; phone: string | null; email: string | null } | null;
}

/** Texte prêt à copier (relance, accompagnement d'envoi) avec liens WhatsApp et e-mail. L'application n'envoie rien elle-même. */
export function SupplierTextPanel({ data, testId }: { data: SupplierText; testId: string }) {
  const [value, setValue] = useState(data.text);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Texte copié.");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte et copiez-le à la main.");
    }
  }
  return (
    <div className="space-y-2" data-testid={testId}>
      {data.contact ? (
        <p className="text-xs text-muted-foreground">
          Contact : {data.contact.name}
          {data.contact.phone ? ` · ${data.contact.phone}` : ""}
          {data.contact.email ? ` · ${data.contact.email}` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Aucun contact enregistré pour ce fournisseur : copiez le texte et envoyez-le manuellement.</p>
      )}
      <textarea
        className="min-h-40 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Texte du message"
        data-testid={`${testId}-text`}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void copy()} data-testid={`${testId}-copy`}>
          <Copy /> Copier le texte
        </Button>
        {data.whatsappLink ? (
          <a
            href={`${data.whatsappLink.split("?text=")[0]}?text=${encodeURIComponent(value)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            data-testid={`${testId}-whatsapp`}
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
        {data.mailtoLink ? (
          <a
            href={`${data.mailtoLink.split("?")[0]}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(value)}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            data-testid={`${testId}-mailto`}
          >
            <Mail className="size-4" /> E-mail
          </a>
        ) : null}
      </div>
    </div>
  );
}
