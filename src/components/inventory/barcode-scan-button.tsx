"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (options?: { formats?: string[] }) => DetectorLike;

const detectorCtor = (): DetectorCtor | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

const subscribe = () => () => {};

/**
 * Scan de code-barres par la caméra. Facultatif : le bouton n'apparaît que si le navigateur sait lire les codes
 * (BarcodeDetector) et dispose d'une caméra ; sinon la recherche par code reste disponible.
 */
export function BarcodeScanButton({ onDetect }: { onDetect: (value: string) => void }) {
  const supported = useSyncExternalStore(
    subscribe,
    () => !!detectorCtor() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    const detector = new Ctor();

    const loop = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video || !stream) {
        timer = setTimeout(loop, 200); // la fenêtre ou la caméra ne sont pas encore prêtes
        return;
      }
      try {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (video.readyState >= 2) {
          const found = await detector.detect(video);
          if (found.length > 0 && found[0].rawValue) {
            stopped = true;
            setOpen(false);
            onDetectRef.current(found[0].rawValue);
            return;
          }
        }
      } catch {
        // image illisible : on réessaie
      }
      timer = setTimeout(loop, 300);
    };

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        void loop();
      })
      .catch(() => setError("La caméra n'est pas accessible. Autorisez-la dans le navigateur, ou saisissez le code."));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!supported) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 px-4 text-base"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="cnt-scan"
      >
        <ScanLine /> Scanner
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="cnt-scan-dialog">
          <DialogHeader>
            <DialogTitle>Scanner un code-barres</DialogTitle>
            <DialogDescription>Placez le code-barres de l&apos;article devant la caméra.</DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : (
            <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" playsInline muted aria-label="Image de la caméra" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
