// THE TELEPROMPTER SYNC — the capture surface publishes the active slide the
// way the Studio does (`sa-film-active` in localStorage), so /v3/teleprompter
// on the other monitor follows it. SLOT (2026-09-04): no-op until it lands.
export function useCapturePrompterSync(_setId: string, _frameId: string | null): void {
  // intentionally empty — see the slot note above
}
