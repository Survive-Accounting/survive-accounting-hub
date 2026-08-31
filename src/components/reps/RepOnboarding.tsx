// REP ONBOARDING (V2) — the application, framed as setup. Four short numbered sections on one
// page (a wizard would hide how short this is), a live "You could reach N chapters" counter, one
// submit. Completing it is what submits the rep for Lee's review — copy says so plainly.
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  CAMPUS_ROLE_CHIPS, COURSE_STATUSES, reachCount,
  type CourseStatus, type ReachLevel, type ReachMap,
} from "@/lib/rep-shared";
import { getRepOnboarding, submitRepOnboarding, type OnboardingChapter } from "@/lib/rep-onboarding.functions";

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 48, borderRadius: 10, padding: "0 12px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 5 };

function SectionHead({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="mt-7">
      <p className="text-[11px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>Step {n}</p>
      <h2 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h2>
      {sub && <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

export function RepOnboarding({ legacyToken, onSubmitted }: { legacyToken?: string | null; onSubmitted: () => void }) {
  const [loaded, setLoaded] = useState<null | "error" | { campusName: string | null; courseCode: string | null; chapters: OnboardingChapter[] }>(null);
  const [gradYear, setGradYear] = useState<number | null>(null);
  const [courseStatus, setCourseStatus] = useState<CourseStatus | null>(null);
  const [ownChapter, setOwnChapter] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [reach, setReach] = useState<ReachMap>({});
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getRepOnboarding({ data: { legacyToken } }).then((r) => {
      if (!r.ok) { setLoaded("error"); return; }
      setLoaded({ campusName: r.campusName, courseCode: r.courseCode, chapters: r.chapters });
      setGradYear(r.prefill.graduationYear);
      setCourseStatus(r.prefill.courseStatus);
      setOwnChapter(r.prefill.ownChapterId);
      setRoles(r.prefill.roles);
      setReach(r.prefill.reach);
      setPitch(r.prefill.pitch ?? "");
    }).catch(() => setLoaded("error"));
  }, [legacyToken]);

  const counts = useMemo(() => reachCount(reach), [reach]);
  const canSubmit = !!gradYear && !!courseStatus && counts.total > 0 && !busy;

  const cycle = (chapterId: string) => {
    // tap cycles: none → member → knows someone → none (also covered by the explicit buttons)
    setReach((m) => {
      const cur = m[chapterId];
      const next: ReachLevel | null = cur === undefined ? "member" : cur === "member" ? "knows_someone" : null;
      const out = { ...m };
      if (next) out[chapterId] = next; else delete out[chapterId];
      return out;
    });
  };
  const setLevel = (chapterId: string, level: ReachLevel | null) => {
    setReach((m) => {
      const out = { ...m };
      if (level) out[chapterId] = level; else delete out[chapterId];
      return out;
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    void submitRepOnboarding({ data: {
      legacyToken, graduationYear: gradYear!, courseStatus: courseStatus!,
      ownChapterId: ownChapter, roles, reach, pitch: pitch.trim() || null,
    } }).then((r) => {
      if (r.ok) onSubmitted();
      else setErr(r.error ?? "Couldn't submit — try again.");
    }).catch(() => setErr("Couldn't reach the server."))
      .finally(() => setBusy(false));
  };

  if (loaded === null) return <p className="pt-16 text-center text-[14px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>Loading setup…</p>;
  if (loaded === "error") return <p className="pt-16 text-center text-[14px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>Couldn't load setup — refresh to try again.</p>;

  const byCouncil = new Map<string, OnboardingChapter[]>();
  for (const c of loaded.chapters) {
    const k = c.council ?? "Other";
    byCouncil.set(k, [...(byCouncil.get(k) ?? []), c]);
  }

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      <div className="pt-8">
        <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>One-time setup · {loaded.campusName}</p>
        <h1 className="mt-1 text-[26px] font-black leading-[1.12]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Which chapters can you reach?</h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--text-muted)" }}>Four quick questions. This is what Lee reviews before turning on your chapters — he'll call you after you submit.</p>
      </div>

      {/* STEP 1 — who you are (name/email/phone already on file from signup) */}
      <SectionHead n={1} title="Who you are" />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <label style={LABEL} htmlFor="ob-year">Graduation year</label>
          <select id="ob-year" value={gradYear ?? ""} onChange={(e) => setGradYear(e.target.value ? Number(e.target.value) : null)} className="sa-field w-full" style={{ ...FIELD, padding: "0 8px" }}>
            <option value="">Pick…</option>
            {[2026, 2027, 2028, 2029, 2030].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL} htmlFor="ob-course">{loaded.courseCode ?? "The intro course"} — you?</label>
          <select id="ob-course" value={courseStatus ?? ""} onChange={(e) => setCourseStatus((e.target.value || null) as CourseStatus | null)} className="sa-field w-full" style={{ ...FIELD, padding: "0 8px" }}>
            <option value="">Pick…</option>
            {COURSE_STATUSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* STEP 2 — your organization */}
      <SectionHead n={2} title="Your organization" />
      <div className="mt-2.5 grid gap-2.5">
        <div>
          <label style={LABEL} htmlFor="ob-chapter">Which chapter are you in?</label>
          <select id="ob-chapter" value={ownChapter ?? ""} onChange={(e) => setOwnChapter(e.target.value || null)} className="sa-field w-full" style={{ ...FIELD, padding: "0 8px" }}>
            <option value="">Not in a chapter</option>
            {loaded.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.council ? ` (${c.council})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Any campus role?</label>
          <div className="flex flex-wrap gap-1.5">
            {CAMPUS_ROLE_CHIPS.map((r) => {
              const on = roles.includes(r.slug);
              return (
                <button key={r.slug} type="button" onClick={() => setRoles((xs) => on ? xs.filter((x) => x !== r.slug) : [...xs, r.slug])}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                  style={on ? { background: "var(--accent)", color: "#0B1220" } : { background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
                  {r.label}
                </button>
              );
            })}
            <button type="button" onClick={() => setRoles([])}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={roles.length === 0 ? { background: "var(--accent)", color: "#0B1220" } : { background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
              None of these
            </button>
          </div>
        </div>
      </div>

      {/* STEP 3 — the coverage map (the important one) */}
      <SectionHead n={3} title="Your reach — the important one" sub="For each chapter: are you a member, do you know someone there, or no connection? Tap a row to cycle, or use the buttons." />
      <div className="sticky top-2 z-20 mt-3 rounded-xl px-4 py-2.5 text-[14px] font-black" style={{ background: "var(--accent)", color: "#0B1220", fontFamily: BRAND_DISPLAY }}>
        You could reach {counts.total} chapter{counts.total === 1 ? "" : "s"}
        <span className="ml-2 text-[12px] font-bold" style={{ opacity: 0.75 }}>{counts.member} member · {counts.knows} know someone</span>
      </div>
      <div className="mt-3 grid gap-4">
        {[...byCouncil.entries()].map(([council, list]) => (
          <div key={council}>
            <p className="mb-1.5 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>{council}</p>
            <div className="grid gap-1.5">
              {list.map((c) => {
                const level = reach[c.id];
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-surface)", border: `1px solid ${level ? "var(--accent)" : "var(--border-default)"}` }}>
                    <button type="button" onClick={() => cycle(c.id)} className="min-w-0 flex-1 text-left">
                      <span className="truncate text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
                        {c.letters && <span style={{ color: "var(--accent)", marginRight: 6 }}>{c.letters}</span>}{c.name}
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-pressed={level === "member"} onClick={() => setLevel(c.id, level === "member" ? null : "member")}
                        className="rounded-lg px-2 py-1 text-[11px] font-black" style={level === "member" ? { background: "var(--accent)", color: "#0B1220" } : { background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
                        Member
                      </button>
                      <button type="button" aria-pressed={level === "knows_someone"} onClick={() => setLevel(c.id, level === "knows_someone" ? null : "knows_someone")}
                        className="rounded-lg px-2 py-1 text-[11px] font-black" style={level === "knows_someone" ? { background: "var(--accent)", color: "#0B1220" } : { background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
                        Know someone
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* STEP 4 — how */}
      <SectionHead n={4} title="How would you get this in front of them?" sub="A sentence is plenty. “Post in our GroupMe and tell our scholarship chair” is a great answer." />
      <textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} placeholder="How would you do it?"
        className="sa-field mt-2 w-full" style={{ ...FIELD, minHeight: 84, padding: "10px 12px" }} />

      {err && <p className="mt-3 text-[13px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
      <button type="button" onClick={submit} disabled={!canSubmit} aria-busy={busy}
        className="mt-5 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40"
        style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}>
        {busy ? "Submitting…" : counts.total > 0 ? `Submit — ${counts.total} chapter${counts.total === 1 ? "" : "s"} for review` : "Submit for review"}
      </button>
      <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Lee calls every rep before turning chapters on — usually within a couple days.</p>
    </div>
  );
}
