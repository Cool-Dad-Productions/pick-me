"use client";

/**
 * Triggers a short vibration for success feedback.
 * Gracefully degrades on devices/browsers without vibration support.
 */
export function vibrateOnSuccess(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(100); // 100ms pulse
  }
}
