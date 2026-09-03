// The URL of the standalone CEQ edit screen — ONE side of one CEQ edit card
// on a Results board.
//
// Only the URL is spelled here. The /v3/$topic/$set/blast-off/edit route
// itself is a later slice of this feature, so until it ships these links land
// on "not found" — loudly, rather than pretending to open an editor.
//
// Its own module (not inside ReviewBoard.tsx) so it can be unit-tested
// without mounting React.

/** Which column of the CEQ edit card the editor should open on. */
export type CeqEditSide = "current" | "proposed";

/**
 * `editHref("/v3/easy-points/internal-vs-external-users/blast-off/edit",
 *           "proposed", item)`
 * → `.../edit?side=proposed&item=<board item id>&ceq=<ceq node id>`
 *
 * `base` is always built from the route's own params (blastOffPath), never
 * hardcoded to one set. `ceq` is omitted when the board item carries no CEQ
 * id — the edit screen must then fail loud rather than guess a question.
 */
export function editHref(base: string, side: CeqEditSide, item: { id: string; ceqIds: string[] }): string {
  const q = new URLSearchParams({ side, item: item.id });
  if (item.ceqIds[0]) q.set("ceq", item.ceqIds[0]);
  return `${base}?${q.toString()}`;
}
