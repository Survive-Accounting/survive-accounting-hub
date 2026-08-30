# Growth Dashboard — UI/UX Audit
**Scope:** every route under `/admin/growth`. **Standard:** can someone open this page and know what to do next without asking? **Users:** Lee (founder, status + building), King (lead VA, enrichment + sending all day, often on a phone), EJ (joins soon, learns it cold). Read-only audit — no code was changed. Ordered by impact.

**Reachability at a glance.** In the nav: Cold Outreach, Campuses (index), Campaigns, Activity, Results (top tabs); Tranches, Campus table, Chapters, Councils, National Orgs, Contacts, Contact Intel (More ▾). **Orphaned (URL-only, nothing links to them):** `king` (King HQ), `greek`, `prebuild`, `outreach`.

---

## Critical — blocks work

- **"Send now" fires real email with no confirmation.** · `admin.growth.campaigns.tsx:162-168` (`CampaignRow`, `approve_now` → `sendCampaign` real Resend send) · It's the only irreversible action on the page, yet Cancel and "Pause all" both `window.confirm` and Send does not — one misclick sends a live campaign. · **Fix:** wrap `approve_now` in a `window.confirm("Send N emails + M DMs for <campus> now?")` matching the Cancel guard. · **S**

- **The hidden `/outreach` queue writes phantom "sent" rows.** · `admin.growth.outreach.tsx` + `components/growth/OutreachActions.tsx:126,133` (`quick("ig_dm","sent")` / `quick("email","sent")` write events with no `message_id`) · This is *why* the route is out of nav — one accidental visit already put four fake emails on the daily counter. The route is still URL-reachable and the buttons still corrupt metrics. · **Fix:** delete `admin.growth.outreach.tsx` and the `OutreachActions` "sent" quick-buttons; real send-state now comes from the Schedule's `outreach_touch`. · **S**

- **Every data page is error-blind — a failed fetch reads as "done" or hangs forever.** · `admin.growth.index.tsx:317,383` (error → `rows=[]` → "No campuses match."), `results.tsx:23` + `king.tsx:43` + `prebuild.tsx:33` (bare `Loader2` spins forever on error), `chapters.tsx:247` / `orgs.tsx:132` / `contacts.tsx:379` / `campuses.tsx:237` drawers (`!data ? "Loading…"` never resolves on null/error) · King or EJ hits a transient error, sees "No campuses" or an empty feed, and *stops working* thinking the job is done; or a drawer sticks on "Loading…" and they wait forever. · **Fix:** every `useQuery` render-guard branches on `isError` (short message + Retry button) and drawers key on `isSuccess && !data` ("Not found") vs `isError`, not `!data`. One shared `<QueryState>` helper covers all of them. · **M**

---

## High — meaningful friction

- **Enrichment opens through a mostly-dead 3-door menu.** · `admin.growth.coldoutreach.tsx:196-233` (`DoorTile`) — campus click → menu where 2 of 3 tiles ("Campus Data", "View Results") are disabled "Soon", only "Add Contacts" works · King does this dozens of times a day; it's a guaranteed extra click through two dead buttons. · **Fix:** campus click opens Add Contacts directly; drop the door (or restore the two doors from `tranches.tsx`, where `CampusPanel` actually works, before deleting that file). · **S**

- **`ContactPips` are unlabeled colored number-circles — meaning is hover-only, invisible on touch.** · `ContactPips` in `coldoutreach.tsx:180-199` and `tranches.tsx:189-207` (council/greek/club/IG counts, distinguished only by color; `title` tooltip is the only label) · This is the single most-repeated "unlabeled number" in the product and King is on a phone where hover doesn't exist. · **Fix:** add a one-line legend row above the list (●Councils ●Chapters ●Clubs ●IG) or short text labels under each pill. · **S**

- **Fixing a contact (add a personal IG / correct an email) costs ~5 clicks and a hidden control.** · `ExistingRow` in `coldoutreach.tsx` — the Edit pencil is `opacity-0 … group-hover:opacity-100`, invisible on touch and to keyboard; the whole path is campus → door → Add Contacts → hover-reveal Edit → type → Save · Two of the six core loops (add IG, fix email) blow the 3-click budget. · **Fix:** make Edit always visible; expose email/IG inline on the existing-contact row so a correction is one field + Enter. · **S–M**

- **The magnifier looks broken.** · `SearchPair`/`FindBtn` in `coldoutreach.tsx` (and the same icon on `tranches.tsx`) — a bare `Search` icon that opens a Google tab with no label or affordance · Lee's own words: "does nothing visible." · **Fix:** replace with the labeled "Search for… ▾" role dropdown (Scholarship Chair → President → VP → Treasurer → Organization) already specced for v2. · **S**

- **King HQ is unreachable from the nav.** · `admin.growth.king.tsx` is in neither `TABS` nor `MORE_TABS`; only the identity auto-redirect in `index.tsx:125-130` exposes it, and once the `sessionStorage` flag is set even King has no link back · EJ and Lee have no way to find the page that shows commission and territory. · **Fix:** add "King HQ" to `MORE_TABS` (or a top tab for King's identity). · **S**

- **Two campus tables, no signal which is canonical.** · `admin.growth.index.tsx` ("Campuses") vs `admin.growth.campuses.tsx` ("Campus table", More ▾) — different data sources, columns, vocab (seats vs Revenue$, Park vs readiness-dots), and detail UI (bottom sheet vs right drawer) · A new user can't tell which to trust. · **Fix:** delete `campuses.tsx` (see Delete); index is the V2 board. · **M**

- **Discovered contacts can't be acted on — three contact systems with no bridge.** · `intelligence.tsx` (read-only discovered contacts) has no "promote to Contacts / add to campus"; `contacts.tsx` (manual CRM) and the enrichment modal (`growth_contact_qc`) are separate universes · A user discovers a contact in one place and must re-type it in another — the biggest structural "what do I do next?" gap. · **Fix:** add a one-click "Use this contact" on each Intelligence row that writes it into `growth_contact_qc` for that campus (the enrichment store the schedule reads). · **M**

- **Chapters is King/EJ's highest-use table but is an 8-column desktop grid on mobile.** · `admin.growth.chapters.tsx` (8-col `<table>` in `overflow-x-auto`) · Daily driver, unusable one-handed on a phone. · **Fix:** a stacked card layout below `sm:` (chapter · campus · status · "N due"), table only on `md:+`. · **M**

---

## Medium — polish

- **Unlabeled refresh icons everywhere.** · bare `RotateCw` with no `aria-label`/`title` in `chapters.tsx:103`, `councils.tsx:44`, `orgs.tsx:46`, `contacts.tsx:81`, `campuses.tsx:130`, `outreach.tsx:84` (only `intelligence.tsx` labels it) · **Fix:** add `title="Refresh"` + `aria-label`. · **S**

- **Small amber/orange text on navy fails contrast.** · `amber-500/80` "not found" tags, role-account text, `text-[9px]` pips across `coldoutreach.tsx` · Lee flagged this; also a WCAG issue on the dark theme. · **Fix:** bump to `amber-400` at full opacity and ≥11px, or use a filled chip. · **S**

- **`MoreMenu` has no outside-click or Escape close.** · `admin.growth.tsx:126-167` · Stays open awkwardly. · **Fix:** close on outside-click + `Esc`. · **S**

- **Identity badge is hidden on mobile.** · `admin.growth.tsx:110` (`hidden … sm:inline`) · On a phone nobody can see whether they're acting as Lee/King/EJ — which changes what data they see. · **Fix:** show a compact identity chip at all widths. · **S**

- **Internal jargon leaks to the UI.** · `intelligence.tsx` shows `COUNCIL_DISTRIBUTION` / `CAMPUS_REP_RECRUITMENT`, "§15/§16/§18", "0.7 unknown multiplier"; `prebuild.tsx` shows a `greekStatus` color dot with no legend + "{n} rdy"; `campaigns.tsx:153` shows raw `templateKey` · Opaque to EJ. · **Fix:** map the campaign/status enums to friendly labels; add a one-line legend for the prebuild dot. · **S**

- **Councils rows aren't clickable though chapters/orgs rows are.** · `councils.tsx` (hover only, no drawer) · Inconsistent interaction model. · **Fix:** either open a drawer or drop the hover affordance. · **S**

- **Activity: `enrichment` events can't be filtered; empty CSV silently "exports 0 rows".** · `activity.tsx:32-41` (ALL_KINDS omits `enrichment`), `ActivityFeed` `exportCsv` · **Fix:** add enrichment to the filter list; disable Export when the feed is empty. · **S**

- **Empty states with no next action.** · `councils.tsx` "No councils.", `campaigns.tsx:100` "Launch one from a campus's Add-contacts drawer." (text, no link), `tranches.tsx:103` points to `/admin/growth/prebuild` as plain text · **Fix:** make each empty state a button/link to the action it names. · **S**

- **Naming drift inside the same drawer set.** · chapters drawer section "Execs & people" vs contacts drawer "Relationships" vs elsewhere "Contacts"; orgs table column "People" vs its drawer stat "Members" · **Fix:** see Terminology map. · **S**

---

## Delete

- **`admin.growth.tranches.tsx`** — superseded by `coldoutreach`, which is a strict superset (autosave, inline edit, role-account, personal-IG, readiness Org/Person, schedule link, richer search). Same server fns, so no data risk. **Caveat:** its Campus Data / View Results doors actually open a `CampusPanel`; port those into coldoutreach (currently "Soon") first, then delete. Also removes the last "Tranche"-worded surface. · **M**

- **`admin.growth.campuses.tsx`** ("Campus table") — legacy V1 duplicate of the index board on a different data source and vocabulary. Nothing links to it except More ▾. · **M**

- **`admin.growth.outreach.tsx`** — the phantom-`sent` hazard above; its job is now the Schedule. · **S**

- **Keep but wire, don't delete:** `greek` (one-time classifier, still needed for the unknown tail — add to More ▾ or accept as a bookmarked tool) and `prebuild` (rare founder setup — link it from Cold Outreach instead of a plain-text URL mention). Neither is dead; both are just unlinked.

---

## Terminology map
*current terms → proposed term → where to change*

| Concept | Current (seen in) | Proposed | Files |
|---|---|---|---|
| Campus grouping | **Tranche** (coldoutreach, tranches, prebuild, king "campus territory", schedule) | **Batch** | `admin.growth.coldoutreach.tsx`, `.schedule.tsx`, `tranches.tsx`*, `prebuild.tsx`, `king.tsx`, nav label in `admin.growth.tsx` |
| Campus size | **seats / eligible** (prebuild) · **est. students / ~N students** (coldoutreach, tranches) | **est. students** | `prebuild.tsx` |
| Email metric | **Emails** (index col) · **Emails sent** (results) · **Emails delivered** (king) | **Emails sent** | `index.tsx`, `king.tsx` |
| National org | **Organization** (orgs header/search) · **National Orgs** (nav) | **National Orgs** | `orgs.tsx` |
| Person record | **Execs & people** (chapters drawer) · **Relationships** (contacts drawer) · **People** vs **Members** (orgs table vs drawer) | **Contacts** / **People** | `chapters.tsx`, `contacts.tsx`, `orgs.tsx` |
| Council group | **IFC & Panhellenic Councils** (tranches) · **Councils & Greek Life Office** (coldoutreach) | **Councils & Greek Life** | moot once `tranches.tsx` is deleted |
| Clubs | **Women in Business, Finance & Investing Clubs** (tranches) · **Business Clubs** (coldoutreach) | **Business Clubs** | moot once `tranches.tsx` is deleted |

**Already consistent — leave alone:** "campus" (never "school"), "contact" (never "lead"), the Organization/Person/Not-found toggle.

---

## Appendix A — Core-loop click cost
| Loop | Clicks now | Verdict |
|---|---|---|
| Find today's outreach + send first message | 2 (Schedule tab → Copy DM) | ✅ |
| Log a reply | 2 (Replied → Log) | ✅ |
| See how many campuses are ready | 0 (header "N / M ready") | ✅ |
| Enrich one campus (councils, 10 chapters, 1 club) | ~2 to open + fills + 1 save | ⚠ the door is a wasted click — remove |
| **Add a personal IG to an existing contact** | **~5** (campus→door→Add Contacts→hover Edit→Save) | ❌ inline the field |
| **Correct a wrong email** | **~5** (same path) | ❌ inline the field |

## Appendix B — Mobile matrix
**Usable now:** Cold Outreach (bottom sheet), Schedule, index board, King HQ, Results, Activity. **Usable but shouldn't rely on hover:** Cold Outreach / Tranches pips (touch can't reveal the tooltip). **Needs work but matters:** Chapters (King/EJ daily, 8-col table). **Desk-only, lower priority:** Councils, Orgs, Contacts, Intelligence, Campus table (all wide tables).

## Appendix C — Accessibility
Amber-on-navy contrast (Medium above); Edit pencil is hover-only `opacity-0` (keyboard/touch invisible — High above); icon-only refresh buttons lack `aria-label` (Medium above); `text-[9px]` pips and `size-5` tap targets are below comfortable touch size; focus states are browser-default (acceptable, not styled).
