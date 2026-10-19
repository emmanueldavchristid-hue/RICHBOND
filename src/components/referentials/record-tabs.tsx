"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface RecordTab {
  value: string;
  label: string;
  content: ReactNode;
}

/** Onglets d'une fiche (article, fournisseur) : cibles tactiles de 44 px, contenu rendu par le serveur. */
export function RecordTabs({ tabs, testId, defaultValue }: { tabs: RecordTab[]; testId: string; defaultValue?: string }) {
  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value} data-testid={testId}>
      <TabsList variant="line" className="h-12 w-full justify-start overflow-x-auto border-b">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="h-11 flex-none px-4 text-sm" data-testid={`${testId}-tab-${t.value}`}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="pt-4" data-testid={`${testId}-panel-${t.value}`}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
