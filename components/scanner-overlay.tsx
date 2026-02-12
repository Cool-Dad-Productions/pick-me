"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Camera, AlertCircle, CameraOff } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/components/ui/use-mobile";
import { BarcodeScanner, type ScannerState, type CameraError } from "@/components/barcode-scanner";
import { normalizeIsbn } from "@/lib/validations";
import { vibrateOnSuccess } from "@/lib/haptics";

interface ScannerOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManualEntry?: () => void;
}

export function ScannerOverlay({
  open,
  onOpenChange,
  onManualEntry,
}: ScannerOverlayProps) {
  const router = useRouter();
  const [scannerState, setScannerState] = useState<ScannerState>("initializing");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [invalidScanMessage, setInvalidScanMessage] = useState<string | null>(null);

  const handleScan = useCallback(
    (scannedCode: string) => {
      const normalizedIsbn = normalizeIsbn(scannedCode);

      if (!normalizedIsbn) {
        setInvalidScanMessage("Not a book ISBN. Keep scanning.");
        setTimeout(() => setInvalidScanMessage(null), 2000);
        return;
      }

      // Success feedback
      vibrateOnSuccess();
      setScanSuccess(true);

      // Navigate after brief visual feedback
      setTimeout(() => {
        onOpenChange(false);
        router.push(`/book/${normalizedIsbn}`);
      }, 300);
    },
    [onOpenChange, router]
  );

  const handleError = useCallback((error: CameraError) => {
    setCameraError(error);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset state for next open
    setTimeout(() => {
      setScannerState("initializing");
      setCameraError(null);
      setScanSuccess(false);
      setInvalidScanMessage(null);
    }, 300);
  }, [onOpenChange]);

  const handleManualEntry = useCallback(() => {
    handleClose();
    onManualEntry?.();
  }, [handleClose, onManualEntry]);

  const handleRetryPermission = useCallback(() => {
    setCameraError(null);
    setScannerState("initializing");
  }, []);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      dismissible={false}
    >
      <DrawerContent className="h-[100dvh] rounded-none border-0">
        {/* Hidden title for accessibility */}
        <DrawerTitle className="sr-only">Barcode Scanner</DrawerTitle>
        <DrawerDescription className="sr-only">
          Point your camera at a book barcode to scan its ISBN
        </DrawerDescription>

        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close scanner</span>
          </Button>

          {/* Torch button placeholder - html5-qrcode handles this internally */}
          <div className="h-10 w-10" />
        </div>

        {/* Scanner area */}
        <div className="relative flex h-full flex-col items-center justify-center bg-black">
          {/* Camera error states */}
          {cameraError && (
            <CameraErrorState
              error={cameraError}
              onRetry={handleRetryPermission}
              onManualEntry={handleManualEntry}
            />
          )}

          {/* Scanner */}
          {!cameraError && (
            <>
              <BarcodeScanner
                onScan={handleScan}
                onError={handleError}
                onStateChange={setScannerState}
              />

              {/* Viewfinder overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* Darkened corners */}
                <div className="absolute inset-0 bg-black/50" />

                {/* Clear scanning area */}
                <div
                  className={`relative z-10 h-[120px] w-[300px] rounded-lg border-2 transition-colors duration-200 ${
                    scanSuccess
                      ? "border-green-500 bg-green-500/10"
                      : invalidScanMessage
                      ? "border-red-500 bg-red-500/10"
                      : "border-white/80 bg-transparent"
                  }`}
                  style={{
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  {/* Corner markers */}
                  <div className="absolute -left-0.5 -top-0.5 h-6 w-6 border-l-4 border-t-4 border-white rounded-tl" />
                  <div className="absolute -right-0.5 -top-0.5 h-6 w-6 border-r-4 border-t-4 border-white rounded-tr" />
                  <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-4 border-l-4 border-white rounded-bl" />
                  <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 border-b-4 border-r-4 border-white rounded-br" />
                </div>
              </div>

              {/* Instructions */}
              <div className="absolute bottom-24 left-0 right-0 text-center">
                {scannerState === "initializing" && (
                  <p className="text-sm text-white/80">Starting camera...</p>
                )}
                {scannerState === "scanning" && !invalidScanMessage && (
                  <p className="text-sm text-white/80">Point camera at barcode</p>
                )}
                {invalidScanMessage && (
                  <p className="text-sm text-red-400">{invalidScanMessage}</p>
                )}
                {scanSuccess && (
                  <p className="text-sm text-green-400">ISBN detected!</p>
                )}
              </div>

              {/* Manual entry fallback */}
              <div className="absolute bottom-8 left-0 right-0 text-center">
                <Button
                  variant="link"
                  onClick={handleManualEntry}
                  className="text-white/70 hover:text-white"
                >
                  Enter ISBN manually
                </Button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Camera error state component
function CameraErrorState({
  error,
  onRetry,
  onManualEntry,
}: {
  error: CameraError;
  onRetry: () => void;
  onManualEntry: () => void;
}) {
  const getErrorContent = () => {
    switch (error) {
      case "NotAllowedError":
        return {
          icon: <CameraOff className="h-12 w-12" />,
          title: "Camera Access Denied",
          description:
            "Please enable camera access in your browser settings to scan barcodes.",
          showRetry: true,
        };
      case "NotFoundError":
        return {
          icon: <CameraOff className="h-12 w-12" />,
          title: "No Camera Found",
          description:
            "We couldn't find a camera on your device. You can enter the ISBN manually instead.",
          showRetry: false,
        };
      case "NotReadableError":
        return {
          icon: <AlertCircle className="h-12 w-12" />,
          title: "Camera in Use",
          description:
            "Your camera is being used by another app. Please close other camera apps and try again.",
          showRetry: true,
        };
      default:
        return {
          icon: <AlertCircle className="h-12 w-12" />,
          title: "Camera Error",
          description:
            "Something went wrong with the camera. Please try again or enter the ISBN manually.",
          showRetry: true,
        };
    }
  };

  const { icon, title, description, showRetry } = getErrorContent();

  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center text-white">
      <div className="text-white/60">{icon}</div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-xs text-sm text-white/70">{description}</p>
      <div className="mt-4 flex gap-3">
        {showRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try Again
          </Button>
        )}
        <Button variant="outline" onClick={onManualEntry} className="border-white/30 text-white hover:bg-white/10">
          Enter Manually
        </Button>
      </div>
    </div>
  );
}

// Scan button for search page
export function ScanButton({ onClick }: { onClick: () => void }) {
  const isMobile = useIsMobile();

  // Only show on mobile devices
  if (!isMobile) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      className="shrink-0"
      title="Scan barcode"
    >
      <Camera className="h-4 w-4" />
      <span className="sr-only">Scan barcode</span>
    </Button>
  );
}
