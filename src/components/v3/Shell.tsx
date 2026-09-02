// V3 SHELL — the chrome every V3 screen shares, and nothing else.
//
// WHY V3 EXISTS (Lee, 2026-09-01). The study canvas grew an Obsidian-sized
// outline down the left, a Pipeline, an Exhibit Lab, publishing, takes and a
// videos tab — all reachable from every screen, all competing for the same
// attention. The job right now is one thing: get Blast Off videos filmed. So V3
// is a MENU, not a workspace. You pick a topic, pick a set, pick what you are
// making, and the surface for that is all you see.
//
// THE RULE THIS FILE ENFORCES: the only global navigation is Home and Exhibit
// Lab. No Pipeline, no outline, no publishing. Everything else is reached by
// going somewhere, and the breadcrumb is how you come back — which is why each
// screen is a real URL rather than a mode flag, so browser back works and a
// screen can be linked to.
//
// Nothing here is deleted from the old canvas; /study/canvas is untouched and
// stays the fallback until V3 has actually filmed something.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FlaskConical, Home } from "lucide-react";

export const V3_NAVY = "#14213D";
export const V3_CREAM = "#F5EFE6";
export const V3_GOLD = "#FCA311";
export const V3_MUTED = "rgba(245,239,230,0.62)";
export const V3_EDGE = "rgba(245,239,230,0.16)";
export const V3_DISPLAY = "'League Spartan', 'Rubik', system-ui, sans-serif";
export const V3_BODY = "'Rubik', system-ui, sans-serif";

export interface Crumb {
  label: string;
  /** Absent = the current screen (rendered plain, not a link). */
  to?: string;
}

/** The one chrome. Screens supply their crumbs and their body. `wide` is for
 *  a working surface (the Blast Off editor: list + frame preview side by side)
 *  rather than a menu column. */
export function V3Shell({ crumbs, children, wide = false }: { crumbs: Crumb[]; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ minHeight: "100vh", background: V3_NAVY, color: V3_CREAM, fontFamily: V3_BODY }}>
      <header
        className="flex items-center gap-3"
        style={{ padding: "12px 20px", borderBottom: `1px solid ${V3_EDGE}`, flexWrap: "wrap" }}
      >
        <Link
          to="/v3"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
          style={{ color: V3_CREAM, border: `1px solid ${V3_EDGE}`, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
        >
          <Home style={{ width: 13, height: 13 }} /> Home
        </Link>
        {/* A NEW TAB, not a navigation: Exhibit Lab is its own surface, and
            leaving V3 for it lost the breadcrumb trail (Lee got stuck). The
            booth's Exhibit Mode is where exhibits get talked about. */}
        <Link
          to="/exhibit-lab"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
          style={{ color: V3_GOLD, border: `1px solid ${V3_EDGE}`, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
          title="Opens in a new tab"
        >
          <FlaskConical style={{ width: 13, height: 13 }} /> Exhibit Lab ↗
        </Link>

        {/* BREADCRUMB — the only way back, and the reason each screen is a URL. */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5" style={{ marginLeft: 10, minWidth: 0 }}>
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
              {i > 0 && <span style={{ color: V3_MUTED, fontSize: 12 }}>›</span>}
              {c.to ? (
                <Link to={c.to} style={{ color: V3_MUTED, fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                  {c.label}
                </Link>
              ) : (
                <span style={{ color: V3_CREAM, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </header>

      <main style={{ padding: "34px 20px 90px", maxWidth: wide ? 1440 : 1080, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

/** Shared empty / loading / error copy, so three screens don't invent three. */
export function V3Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "bad" }) {
  return (
    <div style={{ color: tone === "bad" ? "#FF8B7E" : V3_MUTED, fontSize: 14, marginTop: 18 }}>{children}</div>
  );
}
