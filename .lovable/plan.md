# Fix Lead Finder routing + give it the collapsible sidebar shell

## Root cause

`/outreach/leadfinder` and `/outreach/leadfinder/$campusId` are children of `/outreach` in the generated route tree, but `src/routes/outreach.tsx` never renders an `<Outlet />`. The child route matches, but the parent paints its own tabs UI instead — so clicking "Lead Finder" in the sidebar or "Review" on a campus row just sits on the dashboard. The standalone leadfinder page is alive (it has its own navy header / Toaster / AdminGate), it just never gets mounted.

## Fix

Convert `/outreach` into a true layout route and let the leadfinder live inside the same sidebar shell so it inherits the existing `SidebarTrigger` collapse toggle for more screen real estate.

### 1. Split `src/routes/outreach.tsx` into a layout + index

- `src/routes/outreach.tsx` becomes the layout: keeps `AdminGate` + `SidebarProvider` + `Sidebar` + `SidebarInset` + header (with `SidebarTrigger`), and renders `<Outlet />` in the main content area instead of the `<Tabs>` block. Sidebar items still drive a `tab` state — but clicking Home/Campuses/Campaigns/Students navigates to `/outreach` (the index) and sets the tab via search param or local state lifted through context. Simplest: keep `tab` state in the layout, and only render the tabs UI when the index route is active by reading `useRouterState({ select: s => s.location.pathname })`. When pathname is exactly `/outreach`, render the existing tabs body; otherwise render `<Outlet />`. This preserves all current behavior with the smallest diff.
- The "Lead Finder" sidebar button still calls `navigate({ to: "/outreach/leadfinder" })`.

### 2. Strip the duplicate chrome from the leadfinder pages

`src/routes/outreach.leadfinder.$campusId.tsx` and `src/routes/outreach.leadfinder.index.tsx` currently wrap themselves in `AdminGate` and full-screen layouts. Inside the new layout they should:

- Drop the outer `AdminGate` and `<Toaster>` (the layout already provides both).
- Remove `min-h-screen` wrappers; use `flex-1` so they fill the `SidebarInset` content area.
- Keep the navy header, the campus title, the `FacultyTriagePanel`, and the sticky bottom action bar — those are the working "speed mode" tool the user wants. The sticky bar stays pinned to the bottom of the content area.
- The "← Dashboard" button still navigates to `/outreach`.

### 3. Collapse toggle for more room

The existing `SidebarTrigger` in the layout header already collapses the sidebar to an icon strip (`Sidebar collapsible="icon"`). Once leadfinder renders inside `SidebarInset`, the user gets the toggle for free. No new control needed — the header `SidebarTrigger` is visible on every route under `/outreach`.

### 4. Verify

- Click "Lead Finder" in the sidebar → `/outreach/leadfinder` redirects to the first pending campus and the triage tool renders inside the shell.
- Click "Review" on a campus row → opens `/outreach/leadfinder/$campusId` with the scrape + triage flow.
- Toggle the sidebar from the header → leadfinder expands to fill the screen.
- "← Dashboard" / "Back to Outreach Dashboard" links return to `/outreach` and show the tabs UI again.

## Files touched

- `src/routes/outreach.tsx` — add `<Outlet />`, conditionally render tabs only on `/outreach`.
- `src/routes/outreach.leadfinder.$campusId.tsx` — drop `AdminGate`/`Toaster`/`min-h-screen` wrappers, fit inside `SidebarInset`.
- `src/routes/outreach.leadfinder.index.tsx` — same cleanup.

No backend, schema, or business-logic changes.
