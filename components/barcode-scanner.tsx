"use client";

import { useEffect, useRef, useCallback } from "react";

export type ScannerState = "initializing" | "scanning" | "error";
export type CameraError = "NotAllowedError" | "NotFoundError" | "NotReadableError" | "Unknown";

interface BarcodeScannerProps {
  onScan: (isbn: string) => void;
  onError: (error: CameraError) => void;
  onStateChange?: (state: ScannerState) => void;
}

export function BarcodeScanner({
  onScan,
  onError,
  onStateChange,
}: BarcodeScannerProps) {
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScannedRef = useRef(false);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Prevent multiple rapid scans
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;

      onScan(decodedText);

      // Reset after a delay to allow for new scans if staying open
      setTimeout(() => {
        hasScannedRef.current = false;
      }, 1000);
    },
    [onScan]
  );

  useEffect(() => {
    let mounted = true;

    async function initScanner() {
      if (!containerRef.current) return;

      try {
        onStateChange?.("initializing");

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

        if (!mounted) return;

        // Pass formatsToSupport to constructor
        const scanner = new Html5Qrcode("barcode-scanner-container", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 350, height: 130 },
            aspectRatio: 1.777778,
            disableFlip: true,
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          handleScanSuccess,
          // Ignore scan failures (no barcode in frame)
          () => {}
        );

        if (mounted) {
          onStateChange?.("scanning");
        }
      } catch (err) {
        if (!mounted) return;

        const error = err as Error;
        let errorType: CameraError = "Unknown";

        if (error.name === "NotAllowedError") {
          errorType = "NotAllowedError";
        } else if (error.name === "NotFoundError") {
          errorType = "NotFoundError";
        } else if (error.name === "NotReadableError") {
          errorType = "NotReadableError";
        }

        onStateChange?.("error");
        onError(errorType);
      }
    }

    initScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => {
            // Ignore cleanup errors
          });
      }
    };
  }, [handleScanSuccess, onError, onStateChange]);

  return (
    <div
      id="barcode-scanner-container"
      ref={containerRef}
      className="h-full w-full"
    />
  );
}
