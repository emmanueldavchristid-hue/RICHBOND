"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Json({ value, testId }: { value: unknown; testId: string }) {
  return (
    <pre
      data-testid={testId}
      className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed"
    >
      {value === null || value === undefined ? "–" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AuditDetailButton({
  title,
  before,
  after,
}: {
  title: string;
  before: unknown;
  after: unknown;
}) {
  const [open, setOpen] = useState(false);
  const empty = (before === null || before === undefined) && (after === null || after === undefined);
  if (empty) return <span className="text-muted-foreground">–</span>;
  return (
    <>
      <Button variant="outline" className="h-10 px-3" onClick={() => setOpen(true)} data-testid="audit-detail">
        Voir le détail
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" data-testid="audit-detail-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Valeurs avant et après l&apos;opération.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">Avant</p>
              <Json value={before} testId="audit-before" />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Après</p>
              <Json value={after} testId="audit-after" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
