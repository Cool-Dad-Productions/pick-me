"use client";

import { useState, useEffect } from "react";

export type CameraPermissionState = "unknown" | "prompt" | "granted" | "denied";

/**
 * Hook to check and track camera permission state.
 * Falls back to 'prompt' on browsers that don't support permissions API (Safari).
 */
export function useCameraPermission(): CameraPermissionState {
  const [state, setState] = useState<CameraPermissionState>("unknown");

  useEffect(() => {
    async function checkPermission() {
      try {
        // Check if permissions API is available (not in Safari)
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          setState(result.state as CameraPermissionState);

          // Listen for permission changes
          const handleChange = () => {
            setState(result.state as CameraPermissionState);
          };
          result.addEventListener("change", handleChange);

          return () => result.removeEventListener("change", handleChange);
        } else {
          // Safari fallback - assume prompt state
          setState("prompt");
        }
      } catch {
        // Permissions API not supported or error
        setState("prompt");
      }
    }

    checkPermission();
  }, []);

  return state;
}
