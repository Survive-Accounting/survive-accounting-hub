// THE FILM PAGE'S STATS LINK (Lee, 2026-09-15: "This can all be baked into a Stats link at the top of the /film
// page") and the Stitch Room — beside the breadcrumbs, main window only, so they never film.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { money, statsFor } from "@/lib/film-stitch";
import { listFilmStitches } from "@/lib/film-stitch.functions";

import { openStitchRoom } from "../../blastoff/capture/stitch-queue";
import { FilmStats } from "./FilmStats";
import { ROOM } from "./room-theme";

export function FilmTopLinks() {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["film-stitches"], queryFn: () => listFilmStitches(), staleTime: 30_000, retry: false });
  const today = statsFor(q.data ?? [], "today");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const link: React.CSSProperties = { all: "unset", cursor: "pointer", color: ROOM.gold, fontWeight: 800 };
  return (
    <>
      <span>·</span>
      <button type="button" style={link} onClick={() => { setOpen(true); void q.refetch(); }} title="Videos and pay — today, this week, this month, all time">
        Stats{q.data ? ` · ${money(today.payCents)} today` : ""}
      </button>
      <span>·</span>
      <button type="button" style={link} onClick={() => openStitchRoom()} title="The popout: stitched videos, trims, downloads, the post queue">⚡ Stitch Room</button>
      {open && (
        <div role="dialog" aria-label="Filming stats" onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16, whiteSpace: "normal" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "85vh", overflowY: "auto", background: ROOM.bg, border: `1px solid ${ROOM.edge}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <b style={{ fontSize: 17, color: ROOM.cream }}>Your filming · pay per slide</b>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setOpen(false)} style={{ font: "inherit", fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${ROOM.edge}`, background: "transparent", color: ROOM.cream }}>✕</button>
            </div>
            {q.isError && <div style={{ color: ROOM.red, fontSize: 13, marginBottom: 10 }}>{q.error instanceof Error ? q.error.message : String(q.error)}</div>}
            <FilmStats records={q.data ?? []} onOpen={(r) => openStitchRoom(`${r.setId}#${r.takeIndex}`)} />
          </div>
        </div>
      )}
    </>
  );
}
