Speed up Lee's per-campus faculty workflow inside `ApproveCampusModal` (the "Approve Campus" review screen).

## 1. Grad-cap Google shortcut next to "Scrape URLs"

In `src/components/outreach/ScrapeFacultyButton.tsx`, render a small 🎓 icon-button immediately after the "Scrape URLs" button. Clicking it opens (in a new tab):

```
https://www.google.com/search?q={encoded school name}%20accounting%20faculty%20directory
```

- Pass `campusName` (already a prop) — no other wiring needed.
- Tooltip: "Open Google faculty search".
- Always visible (not gated by `hideScrapeUrls`).

## 2. Background scrapes

In `ScrapeFacultyButton.run()`, stop awaiting the scrape before closing the dialog. Flow becomes:

1. User clicks "Scrape pages".
2. Dialog closes immediately and a toast appears: "Scraping {campusName} in background…".
3. The `scrape({ data: ... })` promise runs in the background; on resolve, show the existing success/warning toast and call `onScraped?.()` so the triage panel refreshes if the modal is still open. On reject, show the existing error toast.

Track in-flight scrapes in a small module-level `Set<string>` keyed by `campusId` so a second click on the same campus is blocked (toast: "Already scraping this campus"). No global queue UI — just toasts.

Also save the pasted URL list to `campuses.faculty_page_url` (current behavior already happens server-side in `scrapeCampusFaculty`) before the dialog closes so the next time Lee opens it the URL is remembered even if the scrape is still running.

## 3. Speed Mode (Lee only) inside `ApproveCampusModal`

Add a header toggle visible only when `getAdminWho() === "lee"`. Persist the choice in `localStorage` (`sa-speed-mode`).

When Speed Mode is ON, the modal collapses to a single tall pane:

```text
┌─ Campus header ──────────────────────────────┐
│ {school name}        [🎓] [Scrape URLs]      │
│ [Speed Mode ✓]   [Quick Approve]  [Next →]   │
├──────────────────────────────────────────────┤
│ FacultyTriagePanel (full height, scrolls)    │
└──────────────────────────────────────────────┘
```

- The 4-step Tabs are hidden; only `FacultyTriagePanel` and the scrape controls render.
- All other sections (program, courses, textbooks, debug, "Mark Needs Lee") are hidden.
- The footer also hides the normal Approve button — Quick Approve replaces it.

### Quick Approve
Calls the same `onApprove(campus.id, { approval_status: "approved", ready_for_outreach: true })` path the current Approve button uses (Lee already bypasses `canApprove` checks per the earlier admin-override change). Shows "Approved {campus.name}" toast and does NOT close — it transitions straight into Next.

### Next
- Closes the current modal and asks the parent for the next campus.
- New prop on `ApproveCampusModal`: `onNext?: (currentCampusId: string) => void`.
- In `src/routes/outreach.tsx`, implement `onNext`:
  - Compute the next campus from the queue/table currently shown. Use the same ordering as `CampusQueuePanel` (campuses queryClient cache, filtered to those claimed by Lee, then unclaimed, sorted by tuition desc).
  - `setReviewing({ id: nextId })`. If no next campus, toast "No more campuses in queue" and close.

When Speed Mode is OFF, the modal renders exactly as today (no change to existing tabs/buttons).

## 4. Persisted background scrape state across modal switches

Because clicking Next closes the modal mid-scrape, move the in-flight tracker out of the button into a module-level singleton in `ScrapeFacultyButton.tsx` (or a tiny `src/lib/faculty-scrape-queue.ts`):

```ts
const inflight = new Map<string, Promise<void>>();
export function isScrapingCampus(id: string) { return inflight.has(id); }
```

The "Scrape URLs" button label shows "Scraping…" with a spinner if `isScrapingCampus(campusId)` is true on mount (poll once per second via `useEffect` interval while open, cleared on unmount). On completion the toast still fires globally via Sonner, so Lee sees results even after he's moved on to the next campus.

## Files touched

- `src/components/outreach/ScrapeFacultyButton.tsx` — grad-cap button, background scrape, inflight tracker.
- `src/components/outreach/ApproveCampusModal.tsx` — Speed Mode toggle (Lee-only), collapsed layout, Quick Approve, Next, `onNext` prop.
- `src/routes/outreach.tsx` — pass `onNext` that advances through the current queue order.

## Not in scope

- No new edge function, schema, or migration.
- No changes to triage panel internals.
- No background scrape UI list — just toasts + per-button spinner.
