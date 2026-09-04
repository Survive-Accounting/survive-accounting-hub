// THE POP-OUT — the same /film page opened as its own 9:16 window, snapped to
// capture size so OBS window-captures it at native 1080×1920 with no crop.
// SLOT (2026-09-04): reports "not available" until it lands.
export interface CapturePopout {
  /** True inside the popped-out window (chrome hidden by default there). */
  isPopout: boolean;
  /** Open the popout from a click (browsers block it otherwise); null when unavailable. */
  open: (() => void) | null;
  /** A one-line status for the chrome ("1080×1920 · exact", or why not). */
  status: string | null;
}

export function useCapturePopout(): CapturePopout {
  return { isPopout: false, open: null, status: null };
}
