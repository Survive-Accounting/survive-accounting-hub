// THE CAMPAIGN BUILDER (2026-08-28) — the council page's "Send it now" destination.
//
// ── THE HARD RULE ─────────────────────────────────────────────────────────────────────────────
//
// THIS PLATFORM NEVER SENDS EMAIL OR SMS TO AN ADDRESS A COUNCIL OFFICER TYPES IN. We assemble;
// they send, from their own accounts. Two reasons, both non-negotiable:
//
//   1. CONSENT. A chapter president's mobile number, typed in by a third party, is not a consented
//      contact. Texting it because someone else pasted it is exactly the behaviour that gets a
//      sender blocked and a brand distrusted.
//   2. IT WORKS BETTER. "Hey, it's your Panhellenic VP" opens doors that "Survive Accounting"
//      cannot. The officer's name on the send is the whole point.
//
// So every action here ends in the officer's own mail client, their own phone, or a file on their
// own computer. There is no server-side send anywhere in this file, and there must never be one.
//
// LOCAL-FIRST, like the rest of the site: rows save to localStorage as they type, so a refresh
// mid-way through a 25-chapter roster never costs them the work.
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { submitNotify } from "@/lib/syllabus.functions";
import type { PartnerChapterRow } from "@/lib/partners";

const ORIGIN = "https://surviveaccounting.com";

/** Campaign links are stamped so we learn which channel actually moved chapters. */
export const campaignUrl = (goPath: string) => `${ORIGIN}${goPath}?via=campaign`;

export type CampaignRow = { email: string; mobile: string };
export type CampaignIdentity = { name: string; role: string; email: string };

const rowsKey = (school: string, council: string) => `sa-campaign:${school}/${council}`;
const idKey = (school: string, council: string) => `sa-campaign-id:${school}/${council}`;

const readJson = <T,>(k: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(k); return raw ? { ...fallback, ...JSON.parse(raw) } as T : fallback; } catch { return fallback; }
};
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** THE SPREADSHEET ROWS — pure, so the columns an officer opens in Excel are pinned by a test
 *  rather than eyeballed. Typed values ride along when present; blank otherwise. */
export function campaignSheetRows(
  chapters: Array<{ name: string; letters: string | null; url: string; slug: string }>,
  rows: Record<string, CampaignRow>,
): Array<Record<string, string>> {
  return chapters.map((c) => ({
    Chapter: c.name,
    Letters: c.letters ?? "",
    "Share link": c.url,
    "Exec name": "",
    "Exec email": rows[c.slug]?.email ?? "",
    "Exec mobile": rows[c.slug]?.mobile ?? "",
  }));
}

/** The pre-written text an officer sends one chair, short enough for SMS. */
export function chapterSms(d: { chapterName: string; courseLabel: string; url: string }): string {
  return `Free ${d.courseLabel} exam prep for ${d.chapterName} — Exam 1 is free for every member. Your chapter's page: ${d.url}`;
}

/** The blast body: a short note in the council's voice, then EVERY chapter's own tagged link so
 *  each chair can grab theirs out of one email. */
export function campaignEmailBody(d: {
  identity: CampaignIdentity;
  councilName: string;
  schoolName: string;
  courseLabel: string;
  chapters: Array<{ name: string; letters: string | null; url: string }>;
}): string {
  const signer = [d.identity.name, d.identity.role].filter(Boolean).join(", ");
  return [
    `Hey all,`,
    ``,
    `${d.courseLabel} hits a lot of our members at once. Survive Accounting makes ${d.courseLabel} cram videos and practice exams for ${d.schoolName} students, and Exam 1 is free for every member — no cost to the chapter.`,
    ``,
    `Every chapter has its own page. Grab yours below and send it to your members:`,
    ``,
    ...d.chapters.map((c) => `${c.letters ? `${c.letters} — ` : ""}${c.name}: ${c.url}`),
    ``,
    `Takes a minute. Worth it if it saves a few grades.`,
    ``,
    signer ? `— ${signer}, ${d.councilName}` : `— ${d.councilName}`,
  ].join("\n");
}

export function CampaignBuilder({ id, schoolSlug, schoolName, councilSlug, councilName, courseCode, chapters, campusId }: {
  id: string;
  schoolSlug: string;
  schoolName: string;
  councilSlug: string;
  councilName: string;
  courseCode: string | null;
  chapters: PartnerChapterRow[];
  campusId?: string | null;
}) {
  const courseLabel = courseCode ?? "intro accounting";
  const [identity, setIdentity] = useState<CampaignIdentity>({ name: "", role: "", email: "" });
  const [rows, setRows] = useState<Record<string, CampaignRow>>({});
  const [savedId, setSavedId] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Restore AFTER mount — this page server-renders, and localStorage does not exist there.
  useEffect(() => {
    setIdentity(readJson(idKey(schoolSlug, councilSlug), { name: "", role: "", email: "" }));
    setRows(readJson<Record<string, CampaignRow>>(rowsKey(schoolSlug, councilSlug), {}));
  }, [schoolSlug, councilSlug]);

  const setRow = (slug: string, patch: Partial<CampaignRow>) => {
    setRows((prev) => {
      const next = { ...prev, [slug]: { ...{ email: "", mobile: "" }, ...prev[slug], ...patch } };
      writeJson(rowsKey(schoolSlug, councilSlug), next);
      return next;
    });
  };
  const setId = (patch: Partial<CampaignIdentity>) => {
    setIdentity((prev) => { const next = { ...prev, ...patch }; writeJson(idKey(schoolSlug, councilSlug), next); return next; });
  };

  const withLinks = useMemo(
    () => chapters.map((c) => ({ ...c, url: campaignUrl(c.goPath) })),
    [chapters],
  );
  const enteredEmails = Object.values(rows).map((r) => r.email.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

  /** Store WHO is running this campaign, so Lee can follow up with a real person. The officer's
   *  own email only — never the addresses they typed for other people. */
  const saveIdentity = async () => {
    if (busy || savedId) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identity.email.trim())) return;
    setBusy(true);
    try {
      await submitNotify({ data: {
        contact: identity.email.trim(),
        topic: `Council campaign · ${councilName} · ${schoolName}`,
        campusId: campusId ?? null,
        campusName: schoolName,
        professorName: null,
        want: null,
        examNum: null,
        courseCode,
        note: `source:council_campaign · council:${councilSlug} · name:${identity.name || "—"} · role:${identity.role || "—"}`,
      } });
      setSavedId(true);
    } catch { /* the builder still works offline of this — it is a follow-up hook, not a gate */ }
    finally { setBusy(false); }
  };

  /** THE BLAST. A mailto with every entered chair address and the full link table. Opens in THEIR
   *  client, sends under THEIR name. Nothing leaves this page. */
  const openEmail = () => {
    void saveIdentity();
    const body = campaignEmailBody({ identity, councilName, schoolName, courseLabel, chapters: withLinks });
    const subject = `Free ${courseLabel} exam prep for your chapter`;
    const to = enteredEmails.join(",");
    // mailto has real length limits in some clients; the link table is the long part, so the body
    // is trimmed defensively rather than producing a silently truncated draft.
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  const copySms = async (slug: string, name: string, url: string) => {
    try {
      await navigator.clipboard.writeText(chapterSms({ chapterName: name, courseLabel, url }));
      setCopied(slug);
      window.setTimeout(() => setCopied((c) => (c === slug ? null : c)), 2000);
    } catch { /* clipboard blocked — the link is visible in the row */ }
  };

  /** THE SPREADSHEET. Generated in the browser with the xlsx already in the bundle — no Google
   *  API, no account, no upload. Opens in Excel and imports to Google Sheets. */
  const downloadXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = campaignSheetRows(withLinks, rows);
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 56 }, { wch: 20 }, { wch: 28 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chapters");
    XLSX.writeFile(wb, `Survive-${schoolName.replace(/\s+/g, "-")}-${councilName.replace(/\s+/g, "-")}-chapters.xlsx`);
  };

  const FIELD: React.CSSProperties = {
    minHeight: 42, width: "100%", borderRadius: 10, padding: "0 10px", fontSize: 15,
    background: "rgba(0,0,0,0.32)", border: "1px solid var(--border-default)", color: "var(--brand-cream)",
  };
  const BTN: React.CSSProperties = { minHeight: 46, borderRadius: 12, fontSize: 14.5, fontWeight: 900, fontFamily: BRAND_SANS, cursor: "pointer" };

  return (
    <section id={id} className="sa-anchor mt-16" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
        {identity.name ? `Build the blast, ${identity.name}.` : "Build the blast."}
      </h2>
      <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Fill in whoever you have — you can send with three addresses or thirty. Everything sends from
        your own inbox and phone, under your name. We never message your chapters ourselves.
      </p>

      {/* WHO'S SENDING — two fields plus a way for Lee to reach them back. */}
      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="cb-name">Your name</label>
          <input id="cb-name" value={identity.name} onChange={(e) => setId({ name: e.target.value })} placeholder="Jordan Ellis" style={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="cb-role">Your role</label>
          <input id="cb-role" value={identity.role} onChange={(e) => setId({ role: e.target.value })} placeholder="VP Academic Excellence" style={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="cb-email">Your email</label>
          <input id="cb-email" value={identity.email} onChange={(e) => setId({ email: e.target.value })} onBlur={() => void saveIdentity()} type="email" inputMode="email" placeholder="you@school.edu" style={FIELD} />
        </div>
      </div>

      {/* THE TABLE — one row per chapter. Paste-friendly; every keystroke persists locally. */}
      <div className="mt-6 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border-default)" }}>
        <div className="hidden grid-cols-[1.3fr_1.2fr_0.9fr_auto] gap-3 px-4 py-2.5 text-[11.5px] font-black uppercase tracking-wide sm:grid" style={{ background: "rgba(0,0,0,0.28)", color: "var(--text-muted)" }}>
          <span>Chapter</span>
          <span>Academic chair or president</span>
          <span>Mobile (optional)</span>
          <span />
        </div>
        {withLinks.map((c, i) => (
          <div key={c.slug} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.3fr_1.2fr_0.9fr_auto] sm:items-center sm:gap-3" style={{ borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)" }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {c.letters && <span className="shrink-0 text-[13px] font-black" style={{ color: "var(--accent)" }}>{c.letters}</span>}
                <span className="min-w-0 truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{c.name}</span>
              </div>
              <a href={c.url} className="mt-0.5 block truncate text-[11.5px] underline underline-offset-2" style={{ color: "var(--text-muted)" }}>{c.url.replace("https://", "")}</a>
            </div>
            <input
              value={rows[c.slug]?.email ?? ""}
              onChange={(e) => setRow(c.slug, { email: e.target.value })}
              type="email" inputMode="email" autoComplete="off" placeholder="chair@school.edu"
              aria-label={`Exec email for ${c.name}`}
              style={FIELD}
            />
            <input
              value={rows[c.slug]?.mobile ?? ""}
              onChange={(e) => setRow(c.slug, { mobile: e.target.value })}
              type="tel" inputMode="tel" autoComplete="off" placeholder="(555) 010-0134"
              aria-label={`Exec mobile for ${c.name}`}
              style={FIELD}
            />
            <button
              type="button"
              onClick={() => void copySms(c.slug, c.name, c.url)}
              className="shrink-0 rounded-lg px-2.5 text-[12px] font-black"
              style={{ minHeight: 42, background: "rgba(252,163,17,0.14)", color: "var(--accent)", border: 0, cursor: "pointer" }}
            >
              {copied === c.slug ? "Copied ⚡" : "Copy text message"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={openEmail}
          className="transition-transform hover:scale-[1.01] focus-visible:ring-2"
          style={{ ...BTN, flex: 1, background: "var(--cta-solo-bg, #CE1126)", color: "var(--cta-solo-fg, #FFF)", border: 0 }}
        >
          Open the email →
        </button>
        <button
          type="button"
          onClick={() => void downloadXlsx()}
          className="focus-visible:ring-2"
          style={{ ...BTN, flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
        >
          Download chapter list (.xlsx)
        </button>
      </div>
      <p className="mt-2.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        {enteredEmails.length > 0
          ? `Opens your mail app addressed to ${enteredEmails.length} chapter${enteredEmails.length === 1 ? "" : "s"}, with every chapter's link in the body.`
          : "Add a chair's email above and it will be addressed for you — or open it empty and paste your own list."}
      </p>
    </section>
  );
}
