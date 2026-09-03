// /admin/ideas — THE IDEA BANK, the vault's full view.
//
// Lee (2026-09-03, second pass): "It's already getting really cluttered up
// there … have urgent at the top, and then drafts, and then open. Each of
// these three is a toggle. Only show the title for each prompt; if I click it
// it can show the rest." So: three folds, titles only, everything else behind
// a click. Reviewed (APPROVED) reads as strikethrough; anything can be
// archived (PARKED) from its title line. Reviewed and Archived are two more
// folds at the bottom, closed, so nothing is ever lost.
//
// NO DELETE, anywhere. PARKED is the archive. A PROMPT can be removed.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { armIdeas, listIdeas, organizeIdea, saveIdea, sendIdeaSummary, setUrgent } from "@/lib/ideas.functions";
import { hasPromptSections, ideaUpdateText, promptSection, replacePromptSection } from "@/lib/ideas-prompt";
import {
  CATEGORIES, CATEGORY_LABEL, FOCUS_LABEL, QUEUE_PRIORITIES, SOURCE_ICON, STATUSES, STATUS_COLOR, STATUS_HINT, TIME_LABEL,
  buildFailed, isArmed, isBuilding, isBuilt, isDraft, isProduction, isTodoIdea, isUrgent, prioritize, priorityOf, queuePriorityOf, rankIdeas, rankQueue, summaryOf, testChecklistOf, tldrOf,
  type Focus, type Idea, type QueuePriority, type Recommendation, type TimeBox,
} from "@/components/ideas/model";

export const Route = createFileRoute("/admin/ideas")({
  component: IdeasRoute,
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

type FoldKey = "urgent" | "production" | "queue" | "built" | "drafts" | "open" | "todos" | "reviewed" | "archived";
const PRIORITY_COLOR: Record<QueuePriority, string> = { urgent: "#FF7A59", high: "#FCA311", medium: "#7DD3FC", low: "#9AA3B8" };

function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [prio, setPrio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [folds, setFolds] = useState<Record<FoldKey, boolean>>({ urgent: true, production: true, queue: true, built: true, drafts: true, open: true, todos: false, reviewed: false, archived: false });
  const toggle = (k: FoldKey) => setFolds((f) => ({ ...f, [k]: !f[k] }));
  // ADD TO BUILD QUEUE (Lee, 2026-09-03): tick some, pick a priority, add.
  // The runner on the build machine takes it from there — unattended.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queuePrio, setQueuePrio] = useState<QueuePriority>("medium");
  const [arming, setArming] = useState(false);
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const arm = (ids: string[], armed: boolean, priority: QueuePriority) => {
    setArming(true);
    return armIdeas({ data: { ids, armed, priority } })
      .then(() => { setSelected(new Set()); refresh(); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setArming(false));
  };

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  // THE THREE (plus the quiet ones). An idea lives in exactly one fold.
  const sections = useMemo(() => {
    const live = ideas.filter((i) => i.status !== "PARKED");
    const reviewed = live.filter((i) => i.status === "APPROVED");
    const working = live.filter((i) => i.status !== "APPROVED");
    const queued = working.filter((i) => isArmed(i) && !isBuilt(i) && !isTodoIdea(i));
    const built = working.filter((i) => isBuilt(i) && !isTodoIdea(i));
    const rest = working.filter((i) => !isArmed(i) && !isBuilt(i) && !isProduction(i));
    return {
      production: rankIdeas(working.filter((i) => isProduction(i) && !isTodoIdea(i))),
      urgent: rankIdeas(rest.filter((i) => isUrgent(i) && !isTodoIdea(i))),
      queue: rankQueue(queued),
      built: rankQueue(built),
      drafts: rankIdeas(rest.filter((i) => !isUrgent(i) && isDraft(i) && !isTodoIdea(i))),
      open: rankIdeas(rest.filter((i) => !isUrgent(i) && !isDraft(i) && !isTodoIdea(i))),
      todos: rankIdeas(working.filter(isTodoIdea)),
      reviewed: rankIdeas(reviewed),
      archived: rankIdeas(ideas.filter((i) => i.status === "PARKED")),
    };
  }, [ideas]);

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
  }, [patch]);

  const fold = (key: FoldKey, label: string, list: Idea[], color = GOLD, hint?: string) => (
    <section key={key} style={{ marginBottom: 14 }}>
      <button onClick={() => toggle(key)}
        className="flex items-center gap-2"
        style={{ background: "transparent", border: "none", color: list.length ? CREAM : MUTED, cursor: "pointer", padding: "6px 0", fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        <span style={{ color: MUTED, fontSize: 12, width: 12 }}>{folds[key] ? "▾" : "▸"}</span>
        <span style={{ color }}>{label}</span>
        <span style={{ color: MUTED, fontWeight: 700, fontSize: 12 }}>{list.length}</span>
        {hint && <span style={{ color: MUTED, fontWeight: 400, fontSize: 11, letterSpacing: 0, textTransform: "none" }}>— {hint}</span>}
      </button>
      {folds[key] && (
        list.length === 0
          ? <div style={{ color: MUTED, fontSize: 12.5, padding: "2px 0 6px 20px" }}>nothing here</div>
          : <div className="flex flex-col" style={{ gap: 4, maxWidth: 1040 }}>
              {list.map((i) => (
                <Row key={i.id} idea={i} expanded={open === i.id}
                  selected={selected.has(i.id)} onSelect={() => toggleSelect(i.id)}
                  onArm={(armed, p) => arm([i.id], armed, p)}
                  onToggle={() => setOpen(open === i.id ? null : i.id)} onPatch={(p) => patch(i, p)} onChanged={refresh} />
              ))}
            </div>
      )}
    </section>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 90px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Idea Bank
        </h1>
        <span style={{ fontSize: 12, color: MUTED }}>Ctrl/⌘ I captures from any page · AI titles, sums up and files each one</span>
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

      {ideas.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Nothing here yet. Press Ctrl/⌘ I on any page, or upload a prompt you already wrote.</div>}

      {fold("urgent", "🔥 Urgent", sections.urgent, URGENT)}
      {/* THE PRODUCTION QUEUE — content to film. The 25 Blast Offs (one per
          Exam 1 set) are the standing head of it and live on /v3, the queue
          itself; the ideas here are the slides, exhibits and new CEQs routed
          from review boards with "→ production". Order = Prioritize's. */}
      <div style={{ fontSize: 12, color: MUTED, margin: "2px 0 -8px 20px" }}>
        🎬 The 25 Exam 1 Blast Offs head the production queue — <a href="/v3" style={{ color: GOLD }}>they live on /v3 →</a>. Below: the slides, exhibits and CEQs sent to production from review boards.
      </div>
      {fold("production", "🎬 Production queue", sections.production, "#3BF5A0", "content to film — sent from a review board; drag in Prioritize to reorder")}
      {fold("queue", "⚙ Build queue", sections.queue, GOLD, "armed — the build machine works these in priority order, unattended")}
      {fold("built", "✅ Built — test these", sections.built, "#3BF5A0", "a preview link and a checklist per idea; tick reviewed when it checks out")}
      {fold("drafts", "✎ Drafts", sections.drafts, "#7DD3FC", "words not finished — Ctrl+I to continue one")}
      {fold("open", "Open", sections.open, GOLD, "in order — urgent first, then Prioritize's order, then newest")}
      {fold("todos", "☐ To-dos", sections.todos, "#3BF5A0", "Terry's list — in Obsidian too")}
      {fold("reviewed", "Reviewed", sections.reviewed, MUTED, "shipped and checked — archive when done with them")}
      {fold("archived", "Archived", sections.archived, MUTED, "parked, never deleted — reopen any time")}

      {/* THE ARM BAR — appears when something is ticked. */}
      {selected.size > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 50, background: "#101A2E", border: `1px solid ${GOLD}`, borderRadius: 14, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{selected.size} ticked</span>
          {QUEUE_PRIORITIES.map((p) => (
            <button key={p} onClick={() => setQueuePrio(p)}
              style={{ background: queuePrio === p ? PRIORITY_COLOR[p] : "transparent", color: queuePrio === p ? "#0B1322" : PRIORITY_COLOR[p], border: `1px solid ${PRIORITY_COLOR[p]}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "capitalize" }}>
              {p}
            </button>
          ))}
          <button onClick={() => arm([...selected], true, queuePrio)} disabled={arming}
            style={{ background: GOLD, color: "#0B1322", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: arming ? 0.6 : 1 }}>
            {arming ? "Adding…" : `⚙ Add to build queue`}
          </button>
          <button onClick={() => setSelected(new Set())} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 12 }}>clear</button>
        </div>
      )}

      {uploading && <UploadPrompt onClose={() => setUploading(false)} onSaved={refresh} />}
      {prio && <Prioritize ideas={ideas} onClose={() => setPrio(false)} onSaveOrder={saveOrder} />}
    </div>
  );
}

// -------------------------------------------------------------------- row

function Row({ idea, expanded, selected, onSelect, onArm, onToggle, onPatch, onChanged }: {
  idea: Idea; expanded: boolean; selected: boolean; onSelect: () => void;
  onArm: (armed: boolean, priority: QueuePriority) => Promise<void> | void;
  onToggle: () => void; onPatch: (p: Partial<Idea>) => Promise<void> | void; onChanged: () => void;
}) {
  const armed = isArmed(idea);
  const built = isBuilt(idea);
  const building = isBuilding(idea);
  const failed = buildFailed(idea);
  const qp = queuePriorityOf(idea);
  const checklist = testChecklistOf(idea);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const urgent = isUrgent(idea);
  const draft = isDraft(idea);
  const todo = isTodoIdea(idea);
  const reviewed = idea.status === "APPROVED";
  const archived = idea.status === "PARKED";
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

  const tiny = (on: boolean, color: string): React.CSSProperties => ({
    background: on ? color : "transparent", color: on ? "#0B1322" : color, border: `1px solid ${color}88`,
    borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div className="rounded-xl" style={{ background: PANEL, border: `1px solid ${urgent ? URGENT + "88" : expanded ? GOLD + "55" : EDGE}`, opacity: archived ? 0.6 : 1 }}>
      {/* THE TITLE LINE — the only thing shown until it is clicked. */}
      <div className="flex items-center gap-3" style={{ padding: "8px 12px" }}>
        {!todo && !archived && !reviewed && (
          <input type="checkbox" checked={selected} onChange={onSelect} title="Tick to add to the build queue" style={{ accentColor: GOLD, width: 15, height: 15, cursor: "pointer" }} />
        )}
        <span onClick={onToggle} style={{ color: urgent ? URGENT : GOLD, fontSize: 14, cursor: "pointer" }}>{urgent ? "🔥" : todo ? "☐" : draft ? "✎" : "⚡"}</span>
        <div onClick={onToggle} className="min-w-0" style={{ flex: 1, cursor: "pointer", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: reviewed ? "line-through" : "none", color: reviewed ? MUTED : CREAM }}>
          {idea.title || "(untitled — organising…)"}
          {built && <a href={idea.context?.previewUrl || "#"} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#3BF5A0", textDecoration: idea.context?.previewUrl ? "underline" : "none" }}>BUILT{idea.context?.previewUrl ? " → test it ↗" : ""}</a>}
          {building && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: GOLD }}>BUILDING…</span>}
          {armed && !built && !building && !failed && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: PRIORITY_COLOR[qp] }}>QUEUED · {qp}</span>}
          {failed && <span title={idea.context?.runError} style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#F87171" }}>BUILD FAILED</span>}
          {idea.status === "SUBMITTED" && !armed && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#7DD3FC" }}>SENT</span>}
          {idea.context?.mergedInto && <span title={idea.context.mergedWhy ?? "merged into another idea"} style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: MUTED }}>↳ MERGED</span>}
          {idea.context?.mergedFrom && <span title="another capture was folded into this one" style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#3BF5A0" }}>+{idea.context.mergedFrom.split(",").length}</span>}
          {idea.context?.stalePrompt === "1" && <span title="a capture was merged in since the prompt was drafted — the watch sync redrafts it, or Redraft with AI" style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: GOLD }}>PROMPT STALE</span>}
          {idea.createdBy.toLowerCase() === "king" && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: MUTED }}>KING</span>}
        </div>
        {/* quick actions: sent · reviewed · archive — the same three states
            the Obsidian checklist writes */}
        {!archived && !todo && !reviewed && (
          armed
            ? <button title={built || failed ? "Build it again (a fresh branch)" : "Take it out of the build queue"} style={tiny(false, GOLD)} onClick={() => void onArm(!(built || failed) ? false : true, qp)}>{built || failed ? "re-queue" : "un-queue"}</button>
            : <button title="Add to the build queue (medium priority — tick several and use the bar to set a priority)" style={tiny(false, GOLD)} onClick={() => void onArm(true, "medium")}>⚙ queue</button>
        )}
        {!archived && (
          <button title={reviewed ? "Reviewed — click to reopen" : "Mark reviewed: shipped and checked (strikethrough)"} style={tiny(reviewed, "#3BF5A0")}
            onClick={() => void onPatch({ status: reviewed ? "DRAFTED" : "APPROVED" })}>✓ reviewed</button>
        )}
        <button title={archived ? "Reopen — back to the list" : "Archive — parked, never deleted"} style={tiny(false, MUTED)}
          onClick={() => void onPatch({ status: archived ? "DRAFTED" : "PARKED" })}>{archived ? "reopen" : "archive"}</button>
        <span onClick={onToggle} style={{ color: MUTED, fontSize: 12, cursor: "pointer" }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${EDGE}` }}>
          {/* THE BUILD — what the closet machine did, and how to check it. */}
          {(built || failed || building) && (
            <div style={{ marginTop: 12, border: `1px solid ${built ? "#3BF5A055" : failed ? "#F8717155" : EDGE}`, borderRadius: 12, padding: "10px 12px" }}>
              {building && <div style={{ fontSize: 12.5, color: GOLD }}>Building on the build machine since {idea.context?.runStartedAt ? new Date(idea.context.runStartedAt).toLocaleTimeString() : "just now"}…</div>}
              {failed && <div style={{ fontSize: 12.5, color: "#F87171" }}>Build failed: {idea.context?.runError ?? "unknown"} — fix the prompt if it was the prompt, then re-queue.</div>}
              {built && (
                <>
                  <div style={{ fontSize: 12.5, color: "#3BF5A0", fontWeight: 700 }}>
                    Built on branch <code style={{ fontSize: 11.5 }}>{idea.context?.branch}</code>
                    {idea.context?.previewUrl ? <> · <a href={idea.context.previewUrl} target="_blank" rel="noreferrer" style={{ color: "#3BF5A0" }}>open the preview ↗</a></> : ` · preview ${idea.context?.previewState ?? "pending"}`}
                  </div>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", margin: "10px 0 4px" }}>Testing checklist</div>
                  {checklist.length ? (
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: CREAM }}>
                      {checklist.map((c, k) => {
                        const m = c.match(/^(.*?)\s+—\s+(https?:\/\/\S+)\s*$/);
                        return <li key={k}>{m ? <>{m[1]} — <a href={m[2]} target="_blank" rel="noreferrer" style={{ color: "#7DD3FC" }}>{m[2].replace(/^https?:\/\/[^/]+/, "")}</a></> : c}</li>;
                      })}
                    </ol>
                  ) : <div style={{ fontSize: 12, color: MUTED }}>no checklist came back — see the report</div>}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11.5, color: MUTED, cursor: "pointer" }}>Build report</summary>
                    <pre style={{ marginTop: 6, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 10, padding: 12, fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap", color: CREAM, maxHeight: 320, overflowY: "auto" }}>{idea.context?.report || "—"}</pre>
                  </details>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>When it checks out, click <b style={{ color: CREAM }}>✓ reviewed</b> above. Merging the branch to main is still a person's call.</div>
                </>
              )}
            </div>
          )}
          {idea.context?.mergedInto && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
              Merged into another idea{idea.context.mergedWhy ? ` — ${idea.context.mergedWhy}` : ""}. Its words were added there; this row is parked. Wrong call? Reopen it above.
            </div>
          )}
          {tldr && <div style={{ fontSize: 13, color: CREAM, opacity: 0.85, marginTop: 12 }}>{tldr}</div>}
          {summary && <div style={{ fontSize: 13, lineHeight: 1.55, color: CREAM, marginTop: 8 }}>{summary}</div>}
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            <span style={{ color: STATUS_COLOR[idea.status], fontWeight: 700 }}>{idea.status.toLowerCase()}</span>
            {" "}{SOURCE_ICON[idea.sourceKind]}
            {idea.createdBy ? ` · ${idea.createdBy}` : ""}
            {idea.categories.length ? ` · ${idea.categories.map((c) => CATEGORY_LABEL[c]).join(", ")}` : " · uncategorised"}
            {idea.subcategory ? ` · ${idea.subcategory}` : ""}
            {priorityOf(idea) ? ` · #${Math.round(priorityOf(idea) / 10)}` : ""}
            {" · "}{new Date(idea.createdAt).toLocaleDateString()}
            {idea.context?.session && <> · Project: <span style={{ color: CREAM }}>{idea.context.session}</span></>}
            {idea.context?.page && <> · Page: <span style={{ color: CREAM }}>{idea.context.page}</span></>}
          </div>

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
            <span style={{ fontSize: 11, color: MUTED }}>Saving writes the order onto each idea — the bank and Obsidian's list follow it.</span>
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

/** UPLOAD A PROMPT written elsewhere: pick the file, it saves as DRAFTED at
 *  once, and AI names and files it in the background. */
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
        status: "DRAFTED",
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
