// ?copyedit — click any text on the page, change it, save (Lee, 2026-09-04). Two jobs:
//
//  1. APPLY, on every page, for everyone: fetch this path's overrides after hydration and
//     swap each element's copy — only when the element still says what it said when Lee
//     changed it (a code rewrite makes an override step aside; the panel shows it as stale).
//  2. EDIT, with ?copyedit in the address and the team passcode: a panel; click any text to
//     edit it in place; Save writes the list. Nothing is saved until Save.
//
// v1 applies on the client, so the original copy can show for a beat before the override
// lands on a cold load. Keyed copy through the loader is the v2 if that beat matters.
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminGate, isAdminUnlocked } from "@/components/AdminGate";
import { getCopyOverrides, saveCopyOverrides, type CopyOverride } from "@/lib/copyedit.functions";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#0B0F1E", MINT = "#3BF5A0", ORANGE = "#FF9F43";
const ATTR = "data-sa-copyedit";
const TEXT_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "SPAN", "A", "BUTTON", "LI", "LABEL", "SMALL", "STRONG", "EM", "B", "I", "DIV", "TD", "TH", "FIGCAPTION", "BLOCKQUOTE", "SUMMARY", "DT", "DD"]);

/** "body>div:nth-of-type(1)>main>h1:nth-of-type(1)" — stable across renders, blind to classes. */
export function domPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.tagName !== "BODY") {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    cur = parent;
  }
  return `body>${parts.join(">")}`;
}
function byPath(path: string): HTMLElement | null {
  try { return document.querySelector(path.replace(/^body>/, "body > ").replace(/>/g, " > ")) as HTMLElement | null; } catch { return null; }
}
/** A text leaf: a text-ish tag whose children are inline formatting only (no blocks, no widgets). */
function isTextLeaf(el: Element): boolean {
  if (!TEXT_TAGS.has(el.tagName)) return false;
  if (el.closest(`[${ATTR}]`)) return false;
  if (!(el.textContent ?? "").trim()) return false;
  return Array.from(el.children).every((c) => ["B", "STRONG", "EM", "I", "SPAN", "BR", "SMALL", "SUP", "SUB", "U", "MARK"].includes(c.tagName) && c.children.length === 0);
}

export function CopyEdit() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const editing = typeof search === "string" && /(^|[?&])copyedit(=|&|$)/.test(search);
  const [overrides, setOverrides] = useState<CopyOverride[] | null>(null);

  // 1. APPLY — every page, everyone.
  useEffect(() => {
    let on = true;
    setOverrides(null);
    getCopyOverrides({ data: { path: pathname } }).then((r) => {
      if (!on) return;
      setOverrides(r.overrides);
      for (const o of r.overrides) { const el = byPath(o.path); if (el && !el.hasAttribute("contenteditable") && el.innerHTML === o.from) el.innerHTML = o.to; }
    }).catch(() => { if (on) setOverrides([]); });
    return () => { on = false; };
  }, [pathname]);

  if (!editing) return null;
  return <Panel pathname={pathname} initial={overrides} />;
}

function Panel({ pathname, initial }: { pathname: string; initial: CopyOverride[] | null }) {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, []);
  const [list, setList] = useState<CopyOverride[]>([]);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<HTMLElement | null>(null);
  useEffect(() => { if (initial) setList(initial); }, [initial]);

  /** What the element said before ANY override — so a second edit keeps the code's text as `from`. */
  const originalOf = useCallback((path: string, currentHtml: string): string => list.find((o) => o.path === path)?.from ?? currentHtml, [list]);

  const commit = useCallback((el: HTMLElement) => {
    el.removeAttribute("contenteditable"); el.style.outline = "";
    const path = el.getAttribute(ATTR) ?? domPath(el);
    const to = el.innerHTML;
    setList((l) => {
      const prev = l.find((o) => o.path === path);
      const from = prev?.from ?? el.getAttribute("data-sa-copy-from") ?? to;
      const rest = l.filter((o) => o.path !== path);
      if (to === from) return rest;                       // put back to the code's copy = no override
      return [...rest, { path, from, to, at: new Date().toISOString() }];
    });
    setDirty(true);
    el.removeAttribute("data-sa-copy-from");
  }, []);

  // 2. EDIT — click a text leaf to edit it in place; blur commits to the working list.
  useEffect(() => {
    if (!unlocked) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null; if (!t) return;
      if (t.closest(`[${ATTR}-panel]`)) return;
      const leaf = (t.closest("p,h1,h2,h3,h4,h5,h6,a,button,li,label,span,small,div,td,th,figcaption,blockquote,summary,dt,dd") as Element | null);
      if (!leaf || !isTextLeaf(leaf)) return;
      e.preventDefault(); e.stopPropagation();
      const el = leaf as HTMLElement;
      if (active.current === el) return;
      if (active.current) commit(active.current);
      active.current = el;
      const path = domPath(el);
      el.setAttribute("data-sa-copy-from", originalOf(path, el.innerHTML));
      el.setAttribute("contenteditable", "true"); el.style.outline = `2px solid ${GOLD}`; el.style.outlineOffset = "2px";
      el.focus();
      const onBlur = () => { el.removeEventListener("blur", onBlur); if (active.current === el) active.current = null; commit(el); };
      el.addEventListener("blur", onBlur);
    };
    // Capture phase so a link or a button's own handler never fires while editing.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [unlocked, commit, originalOf]);

  const save = async () => {
    if (active.current) commit(active.current);
    setBusy(true); setNote(null);
    try {
      const r = await saveCopyOverrides({ data: { path: pathname, overrides: list } });
      setDirty(false); setNote(`Saved — ${r.count} change${r.count === 1 ? "" : "s"} on ${pathname}. Live for everyone on the next load.`);
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  };
  const reset = (o: CopyOverride) => {
    const el = byPath(o.path); if (el && el.innerHTML === o.to) el.innerHTML = o.from;
    setList((l) => l.filter((x) => x.path !== o.path)); setDirty(true);
  };
  const stale = (o: CopyOverride) => { const el = byPath(o.path); return !el || (el.innerHTML !== o.to && el.innerHTML !== o.from); };
  const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

  return (
    <div {...{ [`${ATTR}-panel`]: "" }} style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2147483000, width: 340, maxHeight: "70vh", overflowY: "auto", background: INK, color: CREAM, border: `1px solid ${GOLD}66`, borderRadius: 14, padding: 14, fontFamily: "'Rubik', system-ui, sans-serif", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", fontSize: 13 }}>
      {!unlocked ? (
        <div>
          <div style={{ fontWeight: 700 }}>✎ Copy edit</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>The team passcode, then click any text on the page.</div>
          <div style={{ marginTop: 6, color: "#0B0F1E" }}><AdminGate><span /></AdminGate></div>
          <button type="button" onClick={() => setUnlocked(isAdminUnlocked())} style={btn}>I've unlocked — continue</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>✎ Copy edit</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{pathname}</div>
            <span style={{ flex: 1 }} />
            <a href={pathname} style={{ fontSize: 11.5, color: MUTED }}>exit</a>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 }}>Click any text, type, click away. Nothing is live until <b style={{ color: CREAM }}>Save</b>.</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {list.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No changes on this page yet.</div>}
            {list.map((o) => (
              <div key={o.path} style={{ border: `1px solid ${stale(o) ? ORANGE + "88" : EDGE}`, borderRadius: 9, padding: "6px 8px" }}>
                <div style={{ fontSize: 11, color: MUTED, textDecoration: "line-through" }}>{strip(o.from)}</div>
                <div style={{ fontSize: 12.5 }}>{strip(o.to)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                  {stale(o) && <span style={{ fontSize: 10.5, color: ORANGE }}>stale — the code's copy changed; this no longer applies</span>}
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => reset(o)} style={{ ...btn, padding: "2px 8px", fontSize: 11 }}>put back</button>
                </div>
              </div>
            ))}
          </div>
          {note && <div style={{ marginTop: 8, fontSize: 12, color: note.startsWith("Saved") ? MINT : ORANGE }}>{note}</div>}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || !dirty} onClick={() => void save()} style={{ ...btn, background: GOLD, color: INK, opacity: busy || !dirty ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => window.location.reload()} style={btn}>Discard</button>
          </div>
        </>
      )}
    </div>
  );
}

const btn: React.CSSProperties = { font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" };
