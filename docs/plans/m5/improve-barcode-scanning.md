# Plan: Improve Barcode Scanning Detection & Accuracy

## Problem Statement

The current barcode scanner implementation has two significant issues:
1. **Detection Rate**: ~50% of barcodes fail to detect
2. **Accuracy**: ~33% of detected barcodes contain ISBN errors

These issues severely impact user experience and make the feature unreliable.

## Current Implementation Analysis

| Setting | Current Value | Issue |
|---------|--------------|-------|
| FPS | 10 | Low sampling rate - barcodes may pass between frames |
| Scan Box | 280×100px | Small target area - requires precise positioning |
| Formats | EAN-13, EAN-8 | Missing UPC-A (some books use this) |
| Validation | Length check only | No checksum verification |
| Confirmation | Single scan | No multi-sample verification |
| Resolution | Not specified | Camera may use low resolution by default |

## Improvement Strategy

### Phase 1: Quick Wins (Configuration Tuning)

**1.1 Increase FPS to 15**
- More samples per second = higher detection probability
- Balance between CPU usage and detection rate

**1.2 Expand Scan Box to 350×130px**
- Larger target area reduces precision requirements
- Still fits comfortably on mobile screens

**1.3 Add UPC-A Format Support**
- Some books use UPC-A barcodes with "978" prefix
- Negligible performance impact

**1.4 Request Higher Camera Resolution**
```typescript
videoConstraints: {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "environment"
}
```

### Phase 2: ISBN Validation (Accuracy Fix)

**2.1 Implement ISBN-13 Check Digit Validation**
```typescript
function validateIsbn13Checksum(isbn: string): boolean {
  if (isbn.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(isbn[12]) === checkDigit;
}
```

- Reject scans that fail checksum validation
- Continue scanning instead of showing invalid ISBN error
- This alone should eliminate most misread errors

**2.2 Add EAN-13 Prefix Validation**
- Valid book ISBNs start with 978 or 979
- Reject other EAN-13 barcodes early

### Phase 3: Multi-Sample Verification (Reliability)

**3.1 Require 2 Matching Consecutive Reads**
- Store last scanned value
- Only accept if next scan matches previous
- Timeout between samples: 150-200ms max

```typescript
const lastScanRef = useRef<{ isbn: string; timestamp: number } | null>(null);

function handleScanSuccess(decodedText: string) {
  const now = Date.now();
  const last = lastScanRef.current;

  // If same ISBN scanned within 500ms, confirm it
  if (last && last.isbn === decodedText && now - last.timestamp < 500) {
    onScan(decodedText); // Confirmed match
    lastScanRef.current = null;
  } else {
    lastScanRef.current = { isbn: decodedText, timestamp: now };
  }
}
```

- Dramatically reduces false positives from misreads
- Adds ~150-300ms latency (acceptable tradeoff)

### Phase 4: Native BarcodeDetector API (Optional Enhancement)

**4.1 Use Native API Where Available**
- Chrome 83+, Edge 83+, Opera 70+ support `BarcodeDetector` API
- Significantly better accuracy than html5-qrcode
- Hardware-accelerated on many devices

**4.2 Implementation Strategy**
```typescript
const useNativeAPI = 'BarcodeDetector' in window;

if (useNativeAPI) {
  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
  // Use native detection
} else {
  // Fall back to html5-qrcode
}
```

**4.3 Considerations**
- Safari/Firefox don't support it (need fallback)
- Requires manual camera stream handling
- More complex implementation

### Phase 5: UX Improvements

**5.1 Scanning Hints**
- After 5 seconds: "Move closer to the barcode"
- After 10 seconds: "Try better lighting"
- After 15 seconds: "Having trouble? Enter ISBN manually"

**5.2 Visual Feedback**
- Animated scan line to show scanner is active
- Brief flash effect when a partial read occurs
- Clearer success/failure states

**5.3 Torch/Flash Support**
- Enable flashlight toggle for low-light conditions
- html5-qrcode supports this: `scanner.toggleTorch()`

## Implementation Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | ISBN-13 checksum validation | Low | High |
| P0 | Increase FPS to 15 | Trivial | Medium |
| P0 | Expand scan box size | Trivial | Medium |
| P1 | Multi-sample verification (2 reads) | Low | High |
| P1 | Add UPC-A format support | Trivial | Low |
| P1 | Higher camera resolution | Low | Medium |
| P2 | Scanning hints after delay | Low | Medium |
| P2 | Torch toggle support | Low | Medium |
| P3 | Native BarcodeDetector API | High | High |

## Expected Outcomes

After Phase 1-2 implementation:
- Detection rate: 50% → 70-80%
- Accuracy: 67% → 95%+

After Phase 3:
- Accuracy: 95% → 99%+

After Phase 4-5 (optional):
- Detection rate: 80% → 90%+
- Better UX for edge cases

## Files to Modify

1. [barcode-scanner.tsx](../../components/barcode-scanner.tsx) - Core scanner config
2. [scanner-overlay.tsx](../../components/scanner-overlay.tsx) - Multi-sample logic, hints
3. [validations.ts](../../lib/validations.ts) - ISBN checksum validation

## Testing Plan

1. Test with 10+ different books at various angles/distances
2. Test in low-light conditions
3. Test with worn/damaged barcodes
4. Test on iOS Safari and Android Chrome
5. Measure detection rate and accuracy before/after changes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Higher FPS increases battery drain | 15 fps is still conservative |
| Multi-sample adds latency | 150-300ms is acceptable for accuracy |
| Native API browser support | Maintain html5-qrcode fallback |
| Larger scan box harder to position | Corner markers help guide users |
