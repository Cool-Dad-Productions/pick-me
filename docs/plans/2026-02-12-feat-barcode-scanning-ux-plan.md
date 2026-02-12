---
title: "M3: Barcode Scanning UX"
type: feat
date: 2026-02-12
milestone: M3
---

# M3: Barcode Scanning UX

## Overview

Add mobile camera barcode scanning for one-tap ISBN lookup and prediction. Users can scan a book's barcode in a bookstore and instantly see their predicted rating, enabling quick "should I buy this?" decisions.

## Problem Statement / Motivation

Currently, users must manually type ISBNs to look up books. This friction discourages use in bookstores where the primary use case is "scan a book, get a prediction." Mobile barcode scanning removes this friction entirely, making the app genuinely useful while browsing physical bookstores.

**User story:** "As a user browsing in a bookstore, I want to scan a book's barcode and instantly see my predicted rating so I can quickly decide if I should buy it."

## Proposed Solution

Add a camera-based barcode scanner accessible from the search page's ISBN tab. On mobile devices, users tap a scan button to open a full-screen camera overlay. When an ISBN barcode is detected, the app navigates directly to the book detail page where the prediction is displayed.

### Key Design Decisions

1. **Library choice: html5-qrcode** - Best balance of ease-of-use, ISBN barcode support (EAN-13), and built-in features (torch button). Maintenance mode is acceptable for non-mission-critical use.

2. **Mobile-first, desktop-optional** - Scanner button visible only on mobile devices. Desktop users with webcams can use manual ISBN entry.

3. **Full-screen scanner overlay** - Uses Drawer component for native-feeling mobile experience. Prevents accidental dismissal with disabled drag-to-close.

4. **Reuse existing flows** - Scanner feeds ISBNs into existing `/api/books/isbn/[isbn]` endpoint and `/book/[isbn]` detail page.

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Search Page                               │
│  ┌─────────────────┐   ┌─────────────────────────────────────┐  │
│  │   ISBN Tab      │   │  Title/Author Tab                   │  │
│  │  ┌───────────┐  │   │                                     │  │
│  │  │ [ISBN___] │  │   │                                     │  │
│  │  │ [Scan 📷] │◄─┼───┼── Mobile only (useIsMobile hook)    │  │
│  │  └───────────┘  │   │                                     │  │
│  └─────────────────┘   └─────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Opens scanner
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Scanner Overlay (Drawer)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [X Close]                              [Torch 🔦]          ││
│  │                                                              ││
│  │         ┌────────────────────────────┐                       ││
│  │         │    ═══════════════════     │  ◄── Viewfinder      ││
│  │         │    (Scan region)           │                       ││
│  │         └────────────────────────────┘                       ││
│  │                                                              ││
│  │           Point camera at barcode                            ││
│  │                                                              ││
│  │           [Enter ISBN manually]                              ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬─────────────────────────────────┘
                                │ On barcode detection
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Pause scanner                                                │
│  2. Validate ISBN (normalizeIsbn)                                │
│  3. Haptic feedback (vibrate)                                    │
│  4. Visual feedback (green border)                               │
│  5. Stop & cleanup scanner                                       │
│  6. Navigate to /book/[isbn]                                     │
└─────────────────────────────────────────────────────────────────┘
```

### New Files to Create

| File | Purpose |
|------|---------|
| `components/barcode-scanner.tsx` | Main scanner component wrapping html5-qrcode |
| `components/scanner-overlay.tsx` | Full-screen Drawer with viewfinder UI |
| `components/scan-button.tsx` | Trigger button for search page |
| `components/camera-permission.tsx` | Permission request/denied states |
| `lib/haptics.ts` | Vibration feedback utilities |
| `hooks/use-camera-permission.ts` | Permission state management hook |

### Modified Files

| File | Changes |
|------|---------|
| `app/search/page.tsx` | Add scan button to ISBN tab |
| `package.json` | Add html5-qrcode dependency |

### Implementation Phases

#### Phase 1: Core Scanner Component

**Tasks:**
- [ ] Install html5-qrcode: `pnpm add html5-qrcode`
- [ ] Create `components/barcode-scanner.tsx` with:
  - Dynamic import of html5-qrcode (ssr: false)
  - Camera initialization with `facingMode: "environment"`
  - EAN-13 format support for ISBN-13 barcodes
  - Proper cleanup on unmount (stop + clear)
  - Callback props: `onScan(isbn)`, `onError(error)`
- [ ] Create `lib/haptics.ts` with `vibrateOnSuccess()` function
- [ ] Create `hooks/use-camera-permission.ts` to check permission state

**Success criteria:**
- Scanner initializes camera on render
- Detects EAN-13 barcodes and calls onScan
- Camera stops completely on unmount
- No memory leaks or camera indicator stuck on

#### Phase 2: Scanner Overlay UI

**Tasks:**
- [ ] Create `components/scanner-overlay.tsx` with:
  - Full-screen Drawer (vaul) from bottom
  - Close button header
  - Torch toggle button (if supported)
  - Rectangular viewfinder overlay (300x100px scan region)
  - "Point camera at barcode" instruction
  - "Enter ISBN manually" fallback link
- [ ] Create `components/camera-permission.tsx` with:
  - Pre-permission explanation state
  - Permission denied state with retry button
  - Permission blocked state with platform-specific instructions
- [ ] Style viewfinder with semi-transparent dark overlay
- [ ] Add scan line animation (optional)

**Success criteria:**
- Scanner opens as full-screen overlay on mobile
- Cannot accidentally dismiss (no drag-to-close)
- Clear visual guidance for barcode positioning
- Permission states clearly communicated

#### Phase 3: Search Page Integration

**Tasks:**
- [ ] Create `components/scan-button.tsx`:
  - Camera icon button
  - Only renders on mobile (`useIsMobile()` hook)
  - Opens scanner overlay on tap
- [ ] Modify `app/search/page.tsx`:
  - Import ScanButton component
  - Add to ISBN tab (near ISBN input field)
  - Handle scanner results: validate with `normalizeIsbn()`, navigate to `/book/[isbn]`
- [ ] Handle invalid barcode scans (non-ISBN):
  - Show inline error "Not a book ISBN"
  - Continue scanning

**Success criteria:**
- Scan button visible only on mobile
- Tapping opens scanner overlay
- Successful scan navigates to book detail page
- Invalid barcodes show error and continue scanning

#### Phase 4: Polish & Edge Cases

**Tasks:**
- [ ] Add success feedback:
  - Haptic: `navigator.vibrate(100)`
  - Visual: Viewfinder border turns green for 200ms
- [ ] Add scanning hint after 30 seconds of no detection
- [ ] Implement debounce to prevent multiple rapid navigations
- [ ] Handle all camera errors gracefully:
  - NotAllowedError → Permission UI
  - NotFoundError → "No camera" message
  - NotReadableError → "Camera in use" message
- [ ] Test and fix iOS Safari specific issues
- [ ] Test and fix Android Chrome specific issues

**Success criteria:**
- Clear feedback on successful scan
- Helpful hints for struggling users
- All error states handled gracefully
- Works on iOS Safari and Android Chrome

## Alternative Approaches Considered

### 1. @zxing/browser instead of html5-qrcode
**Rejected because:** Larger bundle size, no built-in UI components, requires more custom code for torch/viewfinder. html5-qrcode provides more out-of-box features.

### 2. Native BarcodeDetector API
**Rejected because:** No Safari support (behind flag), no Firefox support. Would require polyfill that adds same bundle size as a library anyway.

### 3. quagga2 library
**Rejected because:** Known issues with Samsung Galaxy devices, lower maintenance activity, more configuration required.

### 4. Separate /scan page instead of overlay
**Rejected because:** Adds navigation complexity, loses context of search page. Overlay provides faster flow and easier "cancel" behavior.

## Acceptance Criteria

### Functional Requirements

- [ ] Scan button appears on mobile devices in the ISBN tab of the search page
- [ ] Tapping scan button opens full-screen camera scanner
- [ ] Scanner detects EAN-13 barcodes (ISBN-13 format)
- [ ] On valid ISBN detection, navigates to `/book/[isbn]`
- [ ] On invalid barcode (non-ISBN), shows error and continues scanning
- [ ] Close button dismisses scanner and returns to search page
- [ ] Camera is fully released when scanner closes
- [ ] Works without errors on iOS Safari 15+
- [ ] Works without errors on Android Chrome 100+

### Non-Functional Requirements

- [ ] Scanner initializes in under 2 seconds on average mobile device
- [ ] Barcode detection occurs within 500ms of barcode entering frame
- [ ] html5-qrcode loaded via dynamic import (not in initial bundle)
- [ ] No camera memory leaks (camera indicator goes away when scanner closes)

### Quality Gates

- [ ] Manual testing on physical iPhone (Safari)
- [ ] Manual testing on physical Android device (Chrome)
- [ ] Permission denied flow manually tested
- [ ] No camera flow manually tested (desktop or no-camera device)

## Dependencies & Prerequisites

### External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| html5-qrcode | ^2.3.8 | Barcode scanning library |

### Existing Code Dependencies

- `components/ui/drawer.tsx` - Overlay container
- `components/ui/button.tsx` - Scan button styling
- `components/ui/use-mobile.tsx` - Mobile detection hook
- `lib/validations.ts` - `normalizeIsbn()` function
- `app/api/books/isbn/[isbn]/route.ts` - ISBN lookup endpoint

### Browser API Requirements

- `navigator.mediaDevices.getUserMedia()` - Camera access
- `navigator.vibrate()` - Haptic feedback (optional, graceful degradation)
- `navigator.permissions.query()` - Permission state check (optional, Safari fallback)

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| html5-qrcode maintenance abandoned | Medium | Medium | Library is stable; could migrate to @zxing/browser if needed |
| Camera permissions confuse users | Medium | Medium | Clear permission UI with platform-specific instructions |
| iOS Safari camera issues | Low | High | Test early and often on real iOS devices |
| Poor barcode detection in low light | Medium | Low | Enable torch button; show manual entry fallback |
| Memory leaks from camera stream | Medium | High | Explicit cleanup in useEffect return; test with DevTools |

## Success Metrics

- **Primary:** Scan-to-prediction conversion rate > 80%
- **Secondary:** Average time from scan button tap to book detail page < 5 seconds
- **Health:** Camera error rate < 5% of scan attempts

## Future Considerations

- **M6 synergy:** Photo of pile of books will use similar camera infrastructure
- **Offline scanning:** Cache recent scans for offline lookup (future)
- **Scan history:** Track recently scanned books for quick re-access (future)
- **Front camera support:** Allow camera switching for accessibility (future)

## Documentation Plan

- [ ] Update README with mobile scanning feature description
- [ ] Add solution document if significant learnings emerge during implementation

## References & Research

### Internal References

- [search/page.tsx](app/search/page.tsx) - ISBN tab integration point
- [validations.ts](lib/validations.ts) - `normalizeIsbn()` function (lines 29-48)
- [use-mobile.tsx](components/ui/use-mobile.tsx) - Mobile detection hook
- [drawer.tsx](components/ui/drawer.tsx) - Vaul drawer component

### External References

- [html5-qrcode Documentation](https://github.com/mebjas/html5-qrcode)
- [html5-qrcode Configuration Options](https://scanapp.org/html5-qrcode-docs/docs/apis/classes/Html5Qrcode)
- [MDN: MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Next.js: Dynamic Imports with ssr:false](https://nextjs.org/docs/pages/guides/lazy-loading)

### Research Sources

- [Scanbot: Open-Source Barcode Scanners Comparison](https://scanbot.io/blog/popular-open-source-javascript-barcode-scanners/)
- [Getting Started with getUserMedia (2025)](https://blog.addpipe.com/getusermedia-getting-started/)
- [Next.js Barcode Scanner Tutorial](https://scanbot.io/techblog/next-js-barcode-scanner-tutorial/)

---

## Appendix: Code Snippets

### A. html5-qrcode Configuration

```typescript
// components/barcode-scanner.tsx
const config: Html5QrcodeScannerConfig = {
  fps: 10,
  qrbox: { width: 300, height: 100 }, // Rectangular for linear barcodes
  aspectRatio: 1.777778, // 16:9 for mobile
  disableFlip: true,
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13, // ISBN-13
    Html5QrcodeSupportedFormats.EAN_8,  // Rare but possible
  ],
};
```

### B. Camera Cleanup Pattern

```typescript
// Proper cleanup to prevent memory leaks
useEffect(() => {
  let scanner: Html5Qrcode | null = null;

  async function initScanner() {
    const { Html5Qrcode } = await import('html5-qrcode');
    scanner = new Html5Qrcode('scanner-element');
    await scanner.start(
      { facingMode: 'environment' },
      config,
      onScanSuccess,
      onScanFailure
    );
  }

  initScanner();

  return () => {
    if (scanner) {
      scanner.stop().then(() => scanner?.clear()).catch(console.error);
    }
  };
}, []);
```

### C. Permission State Hook

```typescript
// hooks/use-camera-permission.ts
export function useCameraPermission() {
  const [state, setState] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    async function check() {
      try {
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
          setState(result.state);
          result.addEventListener('change', () => setState(result.state));
        } else {
          setState('prompt'); // Safari fallback
        }
      } catch {
        setState('prompt');
      }
    }
    check();
  }, []);

  return state;
}
```

### D. Haptic Feedback

```typescript
// lib/haptics.ts
export function vibrateOnSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate(100); // 100ms pulse
  }
}
```
