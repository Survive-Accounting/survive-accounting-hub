// /admin/ideas — the vault's full view.
//
// The drawer is for capture; this is for everything after: find an idea,
// attach the prompt you wrote with Claude, change its status, and — when you
// cannot decide what is next — ask Prioritize.
//
// NO DELETE, anywhere. PARKED is the archive: it is how an idea stops
// resurfacing without the decision being destroyed.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { listIdeas, saveIdea } from "@/lib/ideas.functions";
import {
  CATEGORIES, CATEGORY_LABEL, FOCUS_LABEL, PEOPLE, PERSON_LABEL, SOURCE_ICON, STATUSES, STATUS_COLOR, STATUS_HINT, TIME_LABEL,
  filterIdeas, prioritize, sortIdeas,
  type Category, type Focus, type Idea, type Recommendation, type SortKey, type Status, type TimeBox,
} from "@/components/ideas/model";

export const Route = createFileRoute("/admin/ideas")({
  component: IdeasRoute,
  // ADD TO HOME SCREEN: on a phone this opens standalone, like an app, with
  // no install and no store. That alone covers most of "capture from
  // anywhere" and needs no integrations.
  head: () => ({
    meta: [
      { title: "Ideas to Save — Survive" },
      { name: "robots", content: "noindex" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Ideas" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [{ rel: "manifest", href: "/ideas.webmanifest" }],
  }),
});

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const PANEL = "rgba(16,24,44,0.92)";
const EDGE = "rgba(244,239,230,0.16)";
const BG = "#070B14";

function IdeasRoute() { return <AdminGate><Ideas /></AdminGate>; }

function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [sort, setSort] = useState<SortKey>("date");
  const [person, setPerson] = useState<string | null>(null);
  const [unsorted, setUnsorted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [prio, setPrio] = useState(false);

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const shown = useMemo(() => sortIdeas(filterIdeas(ideas, { category: cat, status, q, person, unsorted }), sort), [ideas, cat, status, q, sort, person, unsorted]);

  const patch = useCallback((i: Idea, p: Partial<Idea>) => {
    const next = { ...i, ...p };
    setIdeas((v) => v.map((x) => (x.id === i.id ? next : x)));
    // EVERY field goes back, always. saveIdea is a whole-row upsert with zod
    // defaults, so omitting attachments or audio here would silently erase a
    // voice note the moment Lee changed a status.
    saveIdea({ data: {
      id: next.id, title: next.title, body: next.body, categories: next.categories,
      subcategory: next.subcategory, status: next.status, sourcePath: next.sourcePath,
      context: next.context, promptMd: next.promptMd, promptFilename: next.promptFilename,
      createdBy: next.createdBy, sourceKind: next.sourceKind, attachments: next.attachments,
      audioPath: next.audioPath, transcriptStatus: next.transcriptStatus,
    } }).then(refresh).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 90px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Ideas to Save
        </h1>
        <span style={{ fontSize: 12, color: MUTED }}>{ideas.length} total · ⌘I captures from anywhere</span>
        <button onClick={() => setPrio(true)} className="ml-auto"
          style={{ background: GOLD, color: "#0B1322", border: "none", borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          Prioritize →
        </button>
      </header>

      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search titles and bodies…"
          style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 16, padding: "9px 12px", outline: "none", flex: "1 1 200px", minWidth: 0, minHeight: 40 }} />
        <Select value={cat ?? ""} onChange={(v) => setCat((v || null) as Category | null)}
          options={[["", "All categories"], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]] as [string, string])]} />
        <Select value={status ?? ""} onChange={(v) => setStatus((v || null) as Status | null)}
          options={[["", "All statuses"], ...STATUSES.map((s) => [s, s] as [string, string])]} />
        <Select value={sort} onChange={(v) => setSort(v as SortKey)}
          options={[["date", "Newest"], ["category", "By category"], ["status", "By status"]]} />
        {/* Everyone shares the vault; this is filtering, not permissions. */}
        <Select value={person ?? ""} onChange={(v) => setPerson(v || null)}
          options={[["", "Everyone"], ...PEOPLE.map((x) => [x, PERSON_LABEL[x]] as [string, string])]} />
        {/* An uncategorised idea is fine — this is where they wait. */}
        <button onClick={() => setUnsorted((v) => !v)}
          style={{ background: unsorted ? GOLD : "transparent", color: unsorted ? "#0B1322" : CREAM, border: `1px solid ${unsorted ? GOLD : EDGE}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 38 }}>
          Unsorted
        </button>
        <span style={{ fontSize: 11.5, color: MUTED }}>{shown.length} shown</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 13 }}>
          {ideas.length === 0 ? "Nothing captured yet. Press ⌘I anywhere in admin." : "Nothing matches those filters."}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 6, maxWidth: 980 }}>
          {shown.map((i) => (
            <Row key={i.id} idea={i} expanded={open === i.id}
              onToggle={() => setOpen(open === i.id ? null : i.id)} onPatch={(p) => patch(i, p)} />
          ))}
        </div>
      )}

      {prio && <Prioritize ideas={ideas} onClose={() => setPrio(false)} />}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 16, padding: "8px 10px", outline: "none", minHeight: 40 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// -------------------------------------------------------------------- row

function Row({ idea, expanded, onToggle, onPatch }: {
  idea: Idea; expanded: boolean; onToggle: () => void; onPatch: (p: Partial<Idea>) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [md, setMd] = useState(idea.promptMd ?? "");

  /** Upload a .md written elsewhere. Attaching one is what moves an idea from
   *  IDEA to DRAFTED — the status follows the artifact rather than being
   *  another thing to remember. */
  const upload = (f: File) => {
    f.text().then((text) => onPatch({
      promptMd: text, promptFilename: f.name,
      status: idea.status === "IDEA" ? "DRAFTED" : idea.status,
    }));
  };

  /** Download the .md, named from the title — the other half of "write it on
   *  one machine, open it on another". */
  const download = () => {
    const name = (idea.promptFilename || `${idea.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "prompt"}.md`);
    const url = URL.createObjectURL(new Blob([idea.promptMd ?? ""], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="rounded-xl" style={{ background: PANEL, border: `1px solid ${expanded ? GOLD + "55" : EDGE}` }}>
      <div className="flex items-center gap-3" style={{ padding: "10px 14px", cursor: "pointer" }} onClick={onToggle}>
        <span style={{ color: GOLD }}>⚡</span>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{idea.title || "(untitled)"}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            <span style={{ color: STATUS_COLOR[idea.status], fontWeight: 700 }}>{idea.status.toLowerCase()}</span>
            {" "}{SOURCE_ICON[idea.sourceKind]}
            {idea.createdBy ? ` · ${idea.createdBy}` : ""}
            {idea.attachments.length ? ` · ${idea.attachments.length} file${idea.attachments.length === 1 ? "" : "s"}` : ""}
            {idea.promptMd ? " · has prompt.md" : ""}
            {idea.sourcePath ? ` · from ${idea.sourcePath}` : ""}
            {" · "}{new Date(idea.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: MUTED, textAlign: "right", minWidth: 150 }}>
          {idea.categories.map((c) => CATEGORY_LABEL[c]).join(" · ")}
          {idea.subcategory ? <div style={{ color: GOLD }}>{idea.subcategory}</div> : null}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${EDGE}` }}>
          {idea.body && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: CREAM, whiteSpace: "pre-wrap", margin: "12px 0" }}>{idea.body}</div>
          )}

          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Status</span>
            {STATUSES.map((s) => (
              <button key={s} title={STATUS_HINT[s]} onClick={() => onPatch({ status: s })}
                style={{
                  background: idea.status === s ? STATUS_COLOR[s] : "transparent",
                  color: idea.status === s ? "#0B1322" : STATUS_COLOR[s],
                  border: `1px solid ${STATUS_COLOR[s]}`, borderRadius: 999,
                  padding: "2px 9px", fontSize: 10.5, fontWeight: 800, cursor: "pointer",
                }}>{s}</button>
            ))}
          </div>

          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Categories</span>
            {CATEGORIES.map((c) => {
              const on = idea.categories.includes(c);
              return (
                <button key={c} onClick={() => onPatch({ categories: on ? idea.categories.filter((x) => x !== c) : [...idea.categories, c] })}
                  style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>

          {/* THE PROMPT — written elsewhere with Claude, kept here. */}
          <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
            <input ref={file} type="file" accept=".md,.markdown,.txt" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <Btn onClick={() => file.current?.click()}>{idea.promptMd ? "Replace .md" : "Upload .md"}</Btn>
            <Btn onClick={() => setPaste((v) => !v)}>{paste ? "Cancel paste" : "Paste markdown"}</Btn>
            {idea.promptMd && <Btn onClick={download}>Download .md</Btn>}
            {idea.promptFilename && <span style={{ fontSize: 11, color: MUTED }}>{idea.promptFilename}</span>}
          </div>

          {paste && (
            <div style={{ marginTop: 8 }}>
              <textarea value={md} onChange={(e) => setMd(e.target.value)} rows={8}
                placeholder="Paste the prompt markdown here…"
                style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12.5, padding: 10, fontFamily: "ui-monospace, monospace", outline: "none" }} />
              <Btn onClick={() => { onPatch({ promptMd: md, status: idea.status === "IDEA" ? "DRAFTED" : idea.status }); setPaste(false); }}>Attach</Btn>
            </div>
          )}

          {/* ATTACHMENTS — each individually downloadable, because the actual
              workflow is: write the prompt on a laptop, open it on a phone in
              another room, paste it into Claude Code. */}
          {(idea.attachments.length > 0 || idea.audioPath) && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
              {idea.audioPath && (
                <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: MUTED }}>🎙 voice note</span>
                  {idea.transcriptStatus && idea.transcriptStatus !== "ok" && (
                    <span style={{ fontSize: 10.5, color: "#FCA311" }}>transcript {idea.transcriptStatus} — the audio is the idea</span>
                  )}
                </div>
              )}
              {idea.attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" download={a.name}
                  style={{ fontSize: 11.5, color: "#7DD3FC", textDecoration: "underline" }}>
                  📎 {a.name} <span style={{ color: MUTED }}>({Math.max(1, Math.round(a.size / 1024))} KB)</span>
                </a>
              ))}
            </div>
          )}

          {idea.promptMd && !paste && (
            <pre style={{ marginTop: 10, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, padding: 12, fontSize: 11.5, lineHeight: 1.5, maxHeight: 340, overflowY: "auto", whiteSpace: "pre-wrap", color: CREAM }}>
              {idea.promptMd}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const Btn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 9, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{children}</button>
);

// ------------------------------------------------------------- prioritize

function Prioritize({ ideas, onClose }: { ideas: Idea[]; onClose: () => void }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [time, setTime] = useState<TimeBox | null>(null);
  const rec: Recommendation | null = focus && time ? prioritize(ideas, focus, time) : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.72)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl" style={{ background: "#101A2E", border: `1px solid ${EDGE}`, padding: 22, width: "min(620px, 96vw)", maxHeight: "86vh", overflowY: "auto" }}>
        <div className="flex items-center" style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>What's next?</h2>
          <button onClick={onClose} className="ml-auto" style={{ background: "transparent", border: "none", color: MUTED, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <Q label="What are you working on this week?">
          {(Object.keys(FOCUS_LABEL) as Focus[]).map((f) => (
            <Choice key={f} on={focus === f} onClick={() => setFocus(f)}>{FOCUS_LABEL[f]}</Choice>
          ))}
        </Q>
        <Q label="How much time do you have?">
          {(Object.keys(TIME_LABEL) as TimeBox[]).map((t) => (
            <Choice key={t} on={time === t} onClick={() => setTime(t)}>{TIME_LABEL[t]}</Choice>
          ))}
        </Q>

        {rec && (
          <div style={{ marginTop: 18, borderTop: `1px solid ${EDGE}`, paddingTop: 16 }}>
            {rec.items.map(({ idea, why }, n) => (
              <div key={idea.id} className="flex" style={{ gap: 12, marginBottom: 14 }}>
                <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, minWidth: 18 }}>{n + 1}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{idea.title}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{why}</div>
                </div>
              </div>
            ))}
            {/* The tool is allowed to say "none of these" — often the right answer. */}
            {rec.goFilm && (
              <div style={{ background: "rgba(252,163,17,0.10)", border: `1px solid ${GOLD}55`, borderRadius: 12, padding: "12px 14px", fontSize: 13, color: CREAM }}>
                {rec.goFilm}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const Q = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 7 }}>{label}</div>
    <div className="flex flex-wrap" style={{ gap: 6 }}>{children}</div>
  </div>
);

const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999, padding: "5px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{children}</button>
);
