# NEW-EXHIBIT CHECKLIST

Read this before building any new exhibit card (T-account, journal entry,
trial balance, financial statement, …). The shared layer already banked the
hard-won film-mode wins — a new card **declares**, it does not **implement**.
Reference implementation: `CycleNode.tsx`. Living proof: `/exhibit-demo`.

## What a new card DECLARES (and nothing else)

1. **Content** — its JSX, rendered inside `<ExhibitShell>`.
2. **An `ExhibitDeclaration`** (`exhibit-base.tsx`):
   - `minWidth` / `minHeight` (+ `keepAspect?`) — the intrinsic size floor.
   - `nodes` — highlightable node ids, in display order (omit if none).
   - `adjacency` — `"ring"` or explicit pairs (omit for no edge glow).
3. Wire-up, three lines:
   ```tsx
   const decl: ExhibitDeclaration = { minWidth: …, minHeight: …, nodes, adjacency };
   const ex = useExhibit(decl);
   return <ExhibitShell id={id} decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>…</ExhibitShell>;
   ```
4. On each highlightable node's element: `onClick={ex.film ? ex.nodeClick(nodeId) : yourAuthoringClick}`
   and style from `ex.nodeStyle(nodeId)` (border/boxShadow/opacity). Connectors
   glow via `ex.edgeLit(a, b)`.
5. Custom authoring affordances (inline editors, add/remove buttons, move
   grips) must be gated `!ex.film` **and** carry `sa-chrome` or `card-actions`
   classes so the film CSS kills them even if a gate slips.

## What a card must NEVER implement itself

- **Film detection / geometry locking** — `ExhibitShell` + `film-lock.ts` own
  it. Never render your own resizer; never write w/h outside the shell's
  resizer; never make film-mode drag decisions.
- **Key handling for Space / Enter / Tab / `** — those belong to the film
  controller. A card listens to plain clicks only. If you find yourself
  calling `addEventListener("keydown", …)` in a card, stop.
- **Emphasis state** — no local "selected/lit" state for teaching emphasis;
  `useExhibit` owns lit-sets, multi-select, adjacency, dimming, and the one
  glow look (`EXHIBIT_GLOW`). Glow is shadow/border/opacity ONLY — a
  transform or size change in an emphasis path is the exact bug (A3
  pop-to-centre) this layer exists to prevent.
- **` reset** — automatic via the layer; never bind ` yourself.
- **Layout application** — never reposition/resize from navigation, keypress,
  re-render, or film. Layout applies at author-time save (`applyLayoutToAll`)
  and nowhere else. Apply never touches an exhibit's intrinsic size.
- **Persistence from film** — film surfaces never write. All writes go
  through the command bus (`useCardActions().update`) from authoring.

## Before it ships

- [ ] `./node_modules/.bin/tsc -p tsconfig.json --noEmit` silent
- [ ] `bun test` — green, including these suites which pin the layer's laws:
  `film-lock.test.ts` · `exhibit-highlights.test.ts` · `exhibit-base.test.ts`
- [ ] Registered in `stage-elements.tsx` (Add menu + node-type map)
- [ ] Eyeball on `/exhibit-demo`-style film render: no chrome visible, drag
  dead, clicks glow, ` clears
- [ ] `bun run build` (Vercel's exact command) green
