// /admin/ideas — THE IDEA BANK, the vault's full view.
//
// The modal is for capture; this is for everything after. Rebuilt 2026-09-03
// on Lee's word: "make it more simple … a category All and some pills for
// different categories with a numeric on it … urgent at the very top no matter
// what … we don't need to see the full transcript … TLDR and summary above,
// the prompt is all we want to copy and paste."
//
// What a row shows, collapsed: urgent flag · title (AI-written) · TLDR ·
// status · who · categories · date. Opened: the summary, the categories, the
// status, the PROMPT in an editable box with Copy, and the transcript folded
// away under "in their words". Every idea can be marked urgent (pins it and
// texts Lee) and sent to King/Lee as a summary email.
//
// NO DELETE, anywhere. PARKED is the archive: it is how an idea stops
// resurfacing without the decision being destroyed. A PROMPT can be removed.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { listIdeas, organizeIdea, saveIdea, sendIdeaSummary, setUrgent } from "@/lib/ideas.functions";
import { hasPromptSections, ideaUpdateText, promptSection, replacePromptSection } from "@/lib/ideas-prompt";
import {
  CATEGORIES, CATEGORY_LABEL, FOCUS_LABEL, SOURCE_ICON, STATUSES, STATUS_COLOR, STATUS_HINT, TIME_LABEL,
  countByCategory, isDraft, isTodoIdea, isUrgent, prioritize, priorityOf, rankIdeas, sortIdeas, summaryOf, tldrOf,
  type Category, type Focus, type Idea, type Recommendation, type SortKey, type Status, type TimeBox,
} from "@/components/ideas/model";

export const Route = createFileRoute("/admin/ideas")({
  component: IdeasRoute,
  // ADD TO HOME SCREEN: on a phone this opens standalone, like an app, with
  // no install and no store.
  head: () => ({
    meta: [
      { title: "Idea Bank — Survive" },
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
const URGENT = "#FF7A59";
const APP_URL = "https://surviveaccounting.com/admin/ideas";

function IdeasRoute() { return <AdminGate><Ideas /></AdminGate>; }

type Pill = "ALL" | "URGENT" | "TODO" | "DRAFTS" | Category;

function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pill, setPill] = useState<Pill>("ALL");
  const [status, setStatus] = useState<Status | null>(null);
  const [sort, setSort] = useState<SortKey>("priority");
  const [open, setOpen] = useState<string | null>(null);
  const [prio, setPrio] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  // Counts on the pills — over everything not parked, so the numbers mean
  // "how much is here", not "how much matches the other filter".
  const live = useMemo(() => ideas.filter((i) => i.status !== "PARKED"), [ideas]);
  const counts = useMemo(() => countByCategory(live), [live]);
  const urgentCount = live.filter(isUrgent).length;
  const todoCount = live.filter(isTodoIdea).length;
  const draftCount = live.filter(isDraft).length;

  const shown = useMemo(() => {
    let out = ideas;
    if (pill === "URGENT") out = out.filter(isUrgent);
    else if (pill === "TODO") out = out.filter(isTodoIdea);
    else if (pill === "DRAFTS") out = out.filter(isDraft);
    else if (pill !== "ALL") out = out.filter((i) => i.categories.includes(pill));
    // To-dos are Terry's; they only show on their own pill.
    if (pill !== "TODO") out = out.filter((i) => !isTodoIdea(i));
    // Parked stays out of sight unless you ask for it by status.
    if (status) out = out.filter((i) => i.status === status);
    else out = out.filter((i) => i.status !== "PARKED");
    // Urgent is pinned whatever the sort.
    const sorted = sortIdeas(out, sort);
    return sort === "priority" ? sorted : [...sorted.filter(isUrgent), ...sorted.filter((i) => !isUrgent(i))];
  }, [ideas, pill, status, sort]);

  const patch = useCallback((i: Idea, p: Partial<Idea>) => {
    const next = { ...i, ...p };
    setIdeas((v) => v.map((x) => (x.id === i.id ? next : x)));
    // EVERY field goes back, always. saveIdea is a whole-row upsert with zod
    // defaults, so omitting attachments or audio here would silently erase a
    // voice note the moment Lee changed a status.
    return saveIdea({ data: {
      id: next.id, title: next.title, body: next.body, categories: next.categories,
      subcategory: next.subcategory, status: next.status, sourcePath: next.sourcePath,
      context: next.context, promptMd: next.promptMd, promptFilename: next.promptFilename,
      createdBy: next.createdBy, sourceKind: next.sourceKind, attachments: next.attachments,
      audioPath: next.audioPath, transcriptStatus: next.transcriptStatus,
    } }).then(refresh).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  /** Prioritize's drag-and-drop order → context.priority (higher first). */
  const saveOrder = useCallback(async (ordered: Idea[]) => {
    const n = ordered.length;
    for (let k = 0; k < n; k++) {
      const i = ordered[k];
      await patch(i, { context: { ...i.context, priority: String((n - k) * 10) } });
    }
    setSort("priority");
  }, [patch]);

  const pillBtn = (key: Pill, label: string, n: number, color = GOLD) => {
    const on = pill === key;
    return (
      <button key={key} onClick={() => setPill(on && key !== "ALL" ? "ALL" : key)}
        style={{ background: on ? color : "transparent", color: on ? "#0B1322" : color === GOLD ? CREAM : color, border: `1px solid ${on ? color : EDGE}`, borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 34 }}>
        {label} <span style={{ opacity: on ? 0.8 : 0.6, fontWeight: 900 }}>{n}</span>
      </button>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 90px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Idea Bank
        </h1>
        <span style={{ fontSize: 12, color: MUTED }}>{live.length} live · Ctrl/⌘ I captures from any page · AI titles, sums up and files each one</span>
        <button onClick={() => setUploading(true)} className="ml-auto"
          style={{ background: "transparent", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ↑ Upload a prompt
        </button>
        <button onClick={() => setPrio(true)}
          style={{ background: GOLD, color: "#0B1322", border: "none", borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          Prioritize →
        </button>
      </header>

      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* THE PILLS — All, then each category with its count. Urgent, to-dos
          and drafts sit apart. Click a lit pill to go back to All. */}
      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {pillBtn("ALL", "All", live.filter((i) => !isTodoIdea(i)).length)}
        {CATEGORIES.map((c) => pillBtn(c, CATEGORY_LABEL[c], counts[c] ?? 0))}
        <span style={{ width: 1, height: 22, background: EDGE, margin: "0 4px" }} />
        {pillBtn("URGENT", "🔥 Urgent", urgentCount, URGENT)}
        {pillBtn("DRAFTS", "✎ Drafts", draftCount, "#7DD3FC")}
        {pillBtn("TODO", "☐ To-dos", todoCount, "#3BF5A0")}
      </div>
      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Select value={status ?? ""} onChange={(v) => setStatus((v || null) as Status | null)}
          options={[["", "All statuses (parked hidden)"], ...STATUSES.map((s) => [s, s] as [string, string])]} />
        <Select value={sort} onChange={(v) => setSort(v as SortKey)}
          options={[["priority", "Urgent · priority · newest"], ["date", "Newest"], ["category", "By category"], ["status", "By status"]]} />
        <span style={{ fontSize: 11.5, color: MUTED }}>{shown.length} shown</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 13 }}>
          {ideas.length === 0 ? "Nothing here yet. Press Ctrl/⌘ I on any page, or upload a prompt you already wrote." : "Nothing on this pill."}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 6, maxWidth: 1040 }}>
          {shown.map((i) => (
            <Row key={i.id} idea={i} expanded={open === i.id}
              onToggle={() => setOpen(open === i.id ? null : i.id)} onPatch={(p) => patch(i, p)} onChanged={refresh} />
          ))}
        </div>
      )}

      {uploading && <UploadPrompt onClose={() => setUploading(false)} onSaved={refresh} />}
      {prio && <Prioritize ideas={ideas} onClose={() => setPrio(false)} onSaveOrder={saveOrder} />}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 14, padding: "7px 10px", outline: "none", minHeight: 38 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// -------------------------------------------------------------------- row

function Row({ idea, expanded, onToggle, onPatch, onChanged }: {
  idea: Idea; expanded: boolean; onToggle: () => void; onPatch: (p: Partial<Idea>) => Promise<void> | void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const urgent = isUrgent(idea);
  const draft = isDraft(idea);
  const todo = isTodoIdea(idea);
  const tldr = tldrOf(idea);
  const summary = summaryOf(idea);
  // THE PROMPT BOX — just the ## Prompt section when the draft has sections
  // (that is what gets pasted into Claude Code); the whole text otherwise.
  const md = idea.promptMd ?? "";
  const promptOnly = md && hasPromptSections(md) ? promptSection(md, "## Prompt") : md;
  const [promptEdit, setPromptEdit] = useState(promptOnly);
  useEffect(() => { setPromptEdit(promptOnly); }, [promptOnly]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label); setNote(null);
    try { const r = await fn(); if (r) setNote(r); onChanged(); }
    catch (e) { setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  };
  const other = (getAdminWho() === "lee" ? "king" : "lee") as "lee" | "king";
  const otherName = other === "king" ? "King" : "Lee";

  const copy = () => {
    navigator.clipboard.writeText(promptEdit || md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => setNote("⚠ Clipboard blocked — select and copy from the box"));
  };
  const download = () => {
    const name = (idea.promptFilename || `${idea.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "prompt"}.md`);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const commitPrompt = () => {
    if (promptEdit === promptOnly) return;
    void onPatch({ promptMd: replacePromptSection(md, promptEdit), status: idea.status === "IDEA" ? "DRAFTED" : idea.status });
  };

  const chip = (text: string, color: string) => (
    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color, border: `1px solid ${color}66`, borderRadius: 5, padding: "1px 6px", marginRight: 6, verticalAlign: "middle" }}>{text}</span>
  );

  return (
    <div className="rounded-xl" style={{ background: PANEL, border: `1px solid ${urgent ? URGENT + "88" : expanded ? GOLD + "55" : EDGE}` }}>
      <div className="flex items-center gap-3" style={{ padding: "10px 14px", cursor: "pointer" }} onClick={onToggle}>
        <span style={{ color: urgent ? URGENT : GOLD, fontSize: 15 }}>{urgent ? "🔥" : todo ? "☐" : "⚡"}</span>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {urgent && chip("urgent", URGENT)}{draft && chip("draft", "#7DD3FC")}{idea.context?.urgentSuggested === "1" && !urgent && chip("AI: looks urgent", URGENT)}
            {idea.title || "(untitled — organising…)"}
          </div>
          {tldr && <div style={{ fontSize: 12.5, color: CREAM, opacity: 0.8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tldr}</div>}
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
            <span style={{ color: STATUS_COLOR[idea.status], fontWeight: 700 }}>{idea.status.toLowerCase()}</span>
            {" "}{SOURCE_ICON[idea.sourceKind]}
            {idea.createdBy ? ` · ${idea.createdBy}` : ""}
            {idea.categories.length ? ` · ${idea.categories.map((c) => CATEGORY_LABEL[c]).join(", ")}` : " · uncategorised"}
            {idea.subcategory ? ` · ${idea.subcategory}` : ""}
            {idea.promptMd ? " · prompt ✓" : ""}
            {priorityOf(idea) ? ` · #${Math.round(priorityOf(idea) / 10)}` : ""}
            {" · "}{new Date(idea.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span style={{ color: MUTED, fontSize: 12 }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${EDGE}` }}>
          {summary && <div style={{ fontSize: 13, lineHeight: 1.55, color: CREAM, margin: "12px 0 0" }}>{summary}</div>}
          {idea.context?.session && <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Claude Code session: <span style={{ color: CREAM }}>{idea.context.session}</span></div>}

          {/* IN THEIR WORDS — the transcript, folded. It is the source of truth
              but not the thing to read every time. */}
          {idea.body && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11.5, color: MUTED, cursor: "pointer" }}>In their words ({idea.body.split(/\s+/).length} words)</summary>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: CREAM, opacity: 0.85, whiteSpace: "pre-wrap", marginTop: 8 }}>{idea.body}</div>
            </details>
          )}

          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Status</span>
            {STATUSES.map((s) => (
              <button key={s} title={STATUS_HINT[s]} onClick={() => void onPatch({ status: s })}
                style={{
                  background: idea.status === s ? STATUS_COLOR[s] : "transparent",
                  color: idea.status === s ? "#0B1322" : STATUS_COLOR[s],
                  border: `1px solid ${STATUS_COLOR[s]}`, borderRadius: 999,
                  padding: "2px 9px", fontSize: 10.5, fontWeight: 800, cursor: "pointer",
                }}>{s}</button>
            ))}
            <span style={{ width: 1, height: 18, background: EDGE, margin: "0 4px" }} />
            {/* URGENT — pinned to the top, and Lee gets a text. */}
            <button
              onClick={() => run("urgent", async () => {
                const r = await setUrgent({ data: { id: idea.id, urgent: !urgent } });
                return !urgent ? (r.texted ? "🔥 marked urgent — Lee texted" : `🔥 marked urgent — text did not go (${r.textError ?? "unknown"})`) : "urgent cleared";
              })}
              style={{ background: urgent ? URGENT : "transparent", color: urgent ? "#0B1322" : URGENT, border: `1px solid ${URGENT}`, borderRadius: 999, padding: "2px 10px", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
              {busy === "urgent" ? "…" : urgent ? "🔥 urgent" : "mark urgent"}
            </button>
          </div>

          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Categories</span>
            {CATEGORIES.map((c) => {
              const on = idea.categories.includes(c);
              return (
                <button key={c} onClick={() => void onPatch({ categories: on ? idea.categories.filter((x) => x !== c) : [...idea.categories, c] })}
                  style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>

          {/* THE PROMPT — what gets pasted into Claude Code. Editable; leaving
              the box saves it. Below it, the tools. */}
          {!todo && (
            <div style={{ marginTop: 14 }}>
              <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Prompt</span>
                {md ? (
                  <>
                    <Btn onClick={copy}>{copied ? "✓ Copied" : "Copy prompt"}</Btn>
                    <Btn onClick={() => run("redraft", async () => { await organizeIdea({ data: { id: idea.id, draftPrompt: true, redraft: true } }); return "✨ redrafted — title, TLDR and summary refreshed too"; })}>
                      {busy === "redraft" ? "Redrafting…" : "✨ Redraft with AI"}
                    </Btn>
                  </>
                ) : (
                  <Btn onClick={() => run("draft", async () => { await organizeIdea({ data: { id: idea.id, draftPrompt: true } }); return "✨ drafted"; })}>
                    {busy === "draft" ? "Drafting…" : "✨ Draft prompt with AI"}
                  </Btn>
                )}
                <Btn onClick={() => run("send", async () => { const r = await sendIdeaSummary({ data: { id: idea.id, to: other } }); return `✉ sent to ${r.to}${r.drafted ? " (prompt drafted first)" : ""}`; })}>
                  {busy === "send" ? "Sending…" : `✉ Send summary to ${otherName}`}
                </Btn>
                {md && <Btn onClick={download}>Download .md</Btn>}
                {md && (
                  <button
                    onClick={() => { if (window.confirm("Remove this prompt? The idea stays; the prompt text is gone (draft it again any time).")) void onPatch({ promptMd: null, promptFilename: null, status: idea.status === "DRAFTED" ? "IDEA" : idea.status }); }}
                    style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.5)", color: "#F87171", borderRadius: 9, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                    Remove prompt
                  </button>
                )}
                {idea.context?.lastSentTo && <span style={{ fontSize: 11, color: MUTED }}>last sent to {idea.context.lastSentTo}</span>}
              </div>
              {md ? (
                <textarea
                  value={promptEdit}
                  onChange={(e) => setPromptEdit(e.target.value)}
                  onBlur={commitPrompt}
                  rows={Math.min(24, Math.max(6, promptEdit.split("\n").length + 1))}
                  spellCheck={false}
                  style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12, lineHeight: 1.5, padding: 10, outline: "none", resize: "vertical", fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace" }}
                />
              ) : (
                <div style={{ fontSize: 12, color: MUTED }}>{draft ? "A draft — finish the words first (Ctrl+I shows your drafts)." : "No prompt yet — AI drafts one right after a save; if it did not, draft it here."}</div>
              )}
              {md && hasPromptSections(md) && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11.5, color: MUTED, cursor: "pointer" }}>Testing checklist · email preview</summary>
                  <pre style={{ marginTop: 6, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, padding: 12, fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap", color: CREAM }}>{promptSection(md, "## Testing checklist") || "—"}</pre>
                  <pre style={{ marginTop: 6, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, padding: 12, fontSize: 11.5, lineHeight: 1.5, maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap", color: MUTED }}>
                    {ideaUpdateText({ title: idea.title, body: idea.body, categories: idea.categories, subcategory: idea.subcategory, sourcePath: idea.sourcePath, pageTitle: idea.context?.title ?? "", promptMd: md, createdBy: idea.createdBy, appUrl: APP_URL })}
                  </pre>
                </details>
              )}
            </div>
          )}

          {(idea.attachments.length > 0 || idea.audioPath) && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
              {idea.audioPath && (
                <span style={{ fontSize: 11.5, color: MUTED }}>🎙 voice note{idea.transcriptStatus && idea.transcriptStatus !== "ok" ? ` — transcript ${idea.transcriptStatus}, the audio is the idea` : ""}</span>
              )}
              {idea.attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" download={a.name}
                  style={{ fontSize: 11.5, color: "#7DD3FC", textDecoration: "underline" }}>
                  📎 {a.name} <span style={{ color: MUTED }}>({Math.max(1, Math.round(a.size / 1024))} KB)</span>
                </a>
              ))}
            </div>
          )}
          {note && <div style={{ fontSize: 11.5, color: note.startsWith("⚠") ? "#F87171" : "#3BF5A0", marginTop: 8 }}>{note}</div>}
        </div>
      )}
    </div>
  );
}

const Btn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 9, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{children}</button>
);

// ------------------------------------------------------------- prioritize

/** PRIORITIZE — AI-style ranking for the week you describe, then DRAG the rows
 *  into the order you actually want and save it. The order lands on each idea
 *  (context.priority) so the bank and the Obsidian index both follow it. */
function Prioritize({ ideas, onClose, onSaveOrder }: { ideas: Idea[]; onClose: () => void; onSaveOrder: (ordered: Idea[]) => Promise<void> }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [time, setTime] = useState<TimeBox | null>(null);
  const rec: Recommendation | null = focus && time ? prioritize(ideas, focus, time) : null;
  const [order, setOrder] = useState<Idea[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Start from the recommendation; without one, the current bank order.
  const list = order ?? (rec ? rec.items.map((r) => r.idea) : rankIdeas(ideas.filter((i) => (i.status === "IDEA" || i.status === "DRAFTED") && !isTodoIdea(i))).slice(0, 12));
  const why = new Map((rec?.items ?? []).map((r) => [r.idea.id, r.why]));

  const moveTo = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const cur = [...list];
    const from = cur.findIndex((i) => i.id === fromId), to = cur.findIndex((i) => i.id === toId);
    if (from < 0 || to < 0) return;
    const [x] = cur.splice(from, 1);
    cur.splice(to, 0, x);
    setOrder(cur);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.72)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl" style={{ background: "#101A2E", border: `1px solid ${EDGE}`, padding: 22, width: "min(680px, 96vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center" style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>What's next?</h2>
          <button onClick={onClose} className="ml-auto" style={{ background: "transparent", border: "none", color: MUTED, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <Q label="What are you working on this week?">
          {(Object.keys(FOCUS_LABEL) as Focus[]).map((f) => (
            <Choice key={f} on={focus === f} onClick={() => { setFocus(f); setOrder(null); }}>{FOCUS_LABEL[f]}</Choice>
          ))}
        </Q>
        <Q label="How much time do you have?">
          {(Object.keys(TIME_LABEL) as TimeBox[]).map((t) => (
            <Choice key={t} on={time === t} onClick={() => { setTime(t); setOrder(null); }}>{TIME_LABEL[t]}</Choice>
          ))}
        </Q>

        <div style={{ marginTop: 18, borderTop: `1px solid ${EDGE}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>
            {rec ? "The suggested order for that week — " : "The bank as it stands — "}drag rows to reorder, then save. Urgent stays pinned above all of this.
          </div>
          {list.map((idea, n) => (
            <div
              key={idea.id}
              draggable
              onDragStart={() => setDragId(idea.id)}
              onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== idea.id) moveTo(dragId, idea.id); }}
              onDragEnd={() => setDragId(null)}
              className="flex"
              style={{ gap: 12, marginBottom: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${dragId === idea.id ? GOLD : EDGE}`, background: dragId === idea.id ? "rgba(252,163,17,0.08)" : "transparent", cursor: "grab", alignItems: "flex-start" }}
            >
              <span style={{ color: MUTED, fontSize: 14, letterSpacing: "-2px" }} aria-hidden>⋮⋮</span>
              <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, minWidth: 18 }}>{n + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{isUrgent(idea) ? "🔥 " : ""}{idea.title}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{why.get(idea.id) ?? tldrOf(idea) ?? ""}</div>
              </div>
            </div>
          ))}
          {rec?.goFilm && (
            <div style={{ background: "rgba(252,163,17,0.10)", border: `1px solid ${GOLD}55`, borderRadius: 12, padding: "12px 14px", fontSize: 13, color: CREAM, marginTop: 6 }}>
              {rec.goFilm}
            </div>
          )}
          <div className="flex items-center" style={{ marginTop: 14, gap: 10 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Saving writes the order onto each idea — the bank and Obsidian's index follow it.</span>
            <button onClick={() => { setSaving(true); onSaveOrder(list).then(onClose).finally(() => setSaving(false)); }} disabled={saving || !list.length} className="ml-auto"
              style={{ background: GOLD, color: "#0B1322", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save this order"}
            </button>
          </div>
        </div>
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
  <button onClick={onClick} style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", minHeight: 36 }}>{children}</button>
);

// ------------------------------------------------------- upload a prompt

/** UPLOAD A PROMPT written elsewhere. Lee (2026-09-03): "let me upload a
 *  prompt and it saves automatically … generate a good title, TLDR and
 *  summary of it, put it in the correct category." So: pick the file, it
 *  saves as DRAFTED at once, and AI names and files it in the background. */
function UploadPrompt({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const take = async (f: File) => {
    setBusy("Saving…"); setErr(null);
    try {
      const text = await f.text();
      const id = `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await saveIdea({ data: {
        id,
        title: f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
        body: "",
        categories: [],
        subcategory: "",
        status: "DRAFTED",              // the prompt exists — that IS drafted
        sourcePath: "/admin/ideas",
        context: { title: "Uploaded prompt" },
        promptMd: text,
        promptFilename: f.name,
        createdBy: getAdminWho() ?? "",
        sourceKind: "web",
        attachments: [],
        audioPath: null,
        transcriptStatus: null,
      } });
      onSaved();
      setBusy("Saved. Naming and filing it…");
      await organizeIdea({ data: { id, draftPrompt: false } });
      onSaved();
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.72)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl"
        style={{ background: "#101A2E", border: `1px solid ${EDGE}`, padding: 22, width: "min(520px, 96vw)" }}>
        <div className="flex items-center" style={{ marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>Upload a prompt</h2>
          <button onClick={onClose} className="ml-auto" style={{ background: "transparent", border: "none", color: MUTED, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 16px" }}>
          A .md you already wrote. It saves the moment you pick it; AI gives it a title, a TLDR, a summary and a category.
        </p>
        <input ref={file} type="file" accept=".md,.markdown,.txt" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); }} />
        <button onClick={() => file.current?.click()} disabled={!!busy}
          style={{ background: "transparent", border: `1px dashed ${busy ? GOLD : EDGE}`, color: busy ? GOLD : CREAM, borderRadius: 12, padding: "16px", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", width: "100%", minHeight: 56 }}>
          {busy ?? "Choose a .md file"}
        </button>
        {err && <div style={{ color: "#F87171", fontSize: 12, marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
