## What's actually happening

Two separate bugs combine into the "it crashed and the modal is empty" symptom:

1. **The red "crash" overlay** on `/outreach` is a React hydration mismatch. `AdminGate` reads `localStorage` during the very first render — server renders the locked screen, client renders the unlocked dashboard, React throws.
2. **The empty modal after the success toast** is real. `supabase/functions/research-campus/index.ts` calls OpenAI `gpt-4o` with no web-search tool, even though the code comment claims "Claude (web-search-grounded)." For schools the model doesn't already know (Alabama State University is a good example), it returns mostly `null`. `applySuggestions` then fills nothing, the toast still says success, and every field stays blank.

## The fix

### 1. Stop the hydration crash in `src/components/AdminGate.tsx`
Read `localStorage` in a `useEffect` after mount, not during initial state. Render a stable shell on the first paint (matches SSR), then swap to children once the unlocked flag is read. No visual change for someone already unlocked beyond a one-frame flash.

### 2. Rewrite Auto-Research on top of Lovable AI Gateway with Google Search grounding
Replace the OpenAI call in `supabase/functions/research-campus/index.ts` with a Lovable AI Gateway call to `google/gemini-3-flash-preview` and enable the Google Search grounding tool so the model actually browses for catalog/bookstore/syllabus pages.

- Auth: `Lovable-API-Key: ${LOVABLE_API_KEY}` header, `baseURL` `https://ai.gateway.lovable.dev/v1`, endpoint `/chat/completions`.
- Request body: `model: "google/gemini-3-flash-preview"`, `messages: [...]`, `tools: [{ type: "google_search" }]`, `response_format: { type: "json_object" }`.
- Keep the existing prompt, `sanitize()`, and `extractJson()` helpers. Add a truncation guard: if `choices[0].finish_reason === "length"` or the output token count is at the ceiling, return a clear `"AI response was truncated, try again"` error instead of half-parsed JSON.
- Map gateway-specific errors: 429 → `"AI is rate-limited, try again in a moment"`, 402 → `"Workspace AI credits exhausted — add credits in Settings → Workspace → Usage"`.
- OpenAI keeps working as a fallback path is **not** included — we cut over fully to Lovable AI.

### 3. Show "AI couldn't find this" hints on blank fields
In `src/components/outreach/ApproveCampusModal.tsx`, after `runAiResearch` succeeds, render a small muted note under each field where `aiResult` returned `value: null` and the field is still blank and the user hasn't touched it. The note sits in the same slot as `ConfidenceMeter` so layouts don't shift. Examples:

- Program name: `"AI couldn't find this — try the 'Find it' button →"`
- Course code / title: `"AI couldn't find this — use the search buttons below"`
- Textbook status: `"AI couldn't determine — use the search buttons"`

Fields the user has already edited (`aiTouched.has(...)`) skip the hint, same as confidence meters.

### 4. Verify
- After deploy, run Auto-Research against Alabama State University and one well-known SEC school (e.g. University of Alabama). Confirm: no overlay, suggestions populate at least partially, blank fields show the "couldn't find" hint, sources are clickable on populated fields.
- Check `research-campus` edge function logs for any 402/429/truncation paths surfaced cleanly.

## Files touched

- `src/components/AdminGate.tsx` — SSR-safe localStorage read.
- `supabase/functions/research-campus/index.ts` — swap to Lovable AI Gateway + Google Search grounding + truncation guard + better error mapping.
- `src/components/outreach/ApproveCampusModal.tsx` — render "AI couldn't find this" hint slot in the five places `ConfidenceMeter` already renders.

## Out of scope

- No changes to `applySuggestions` semantics (still fills only blank fields, never overwrites human input).
- No changes to the approval flow, autosave, or the rest of the outreach dashboard.
- No removal of `OPENAI_API_KEY` from project secrets — it stays available for any other code paths, just not used by this function anymore.
