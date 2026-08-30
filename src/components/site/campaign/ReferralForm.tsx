// THE REFERRAL FORM — everything optional except the submitter's own name.
//
// ── THE RULE THAT SHAPES IT ───────────────────────────────────────────────────────────────────
// "Someone who only wants to leave a comment should be able to submit without the form implying
// they left something out." So: no required marks except on the name, no red on an empty field,
// no "optional" repeated after every label (that repetition is itself an implication that the
// blank ones are unfinished), and a submit button that is live the moment a name exists. The two
// halves are separated by quiet dividers — "If you have a referral" and "Or just talk to me" —
// which say plainly that either half alone is a complete answer.
//
// The campus control is the site's own SearchPicker, with a free-text escape for a campus that is
// not on the list, because "not listed" is the campus Lee most needs to hear about.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { listCampaignCampuses, submitCampaignReferral, CAMPAIGN_CONTACT_PHONE } from "@/lib/campaign.functions";

const RELATIONSHIPS = ["active member", "alumni", "advisor", "parent", "student", "faculty", "other"] as const;

export function ReferralForm({ id, heading }: { id?: string; heading: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subscribe, setSubscribe] = useState(true);
  const [campusId, setCampusId] = useState<string | null>(null);
  const [campusText, setCampusText] = useState("");
  const [notListed, setNotListed] = useState(false);
  const [refName, setRefName] = useState("");
  const [refContact, setRefContact] = useState("");
  const [relationship, setRelationship] = useState("");
  const [comments, setComments] = useState("");
  const [wantsCall, setWantsCall] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { savedReferral: boolean; subscribed: boolean }>(null);

  const campusesQ = useQuery({
    queryKey: ["campaign-campuses"],
    queryFn: () => listCampaignCampuses(),
    staleTime: 600_000,
    networkMode: "always",
  });
  const campusItems = useMemo(
    () => (campusesQ.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [campusesQ.data],
  );

  const ready = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setErr(null);
    try {
      const res = await submitCampaignReferral({ data: {
        submitterName: name.trim(),
        submitterEmail: email.trim(),
        subscribe,
        campusId: notListed ? null : campusId,
        campusText: notListed ? campusText.trim() : (campusItems.find((c) => c.value === campusId)?.label ?? ""),
        referralName: refName.trim(),
        referralContact: refContact.trim(),
        relationship,
        comments: comments.trim(),
        wantsCall,
      } });
      setDone({ savedReferral: res.savedReferral, subscribed: res.subscribed });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't send — try again, or just text me.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section id={id} className="sa-anchor mt-16" style={{ fontFamily: BRAND_SANS }}>
        <div className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            Got it — thank you. I&apos;ll follow up personally.
          </p>
          <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.82 }}>
            If you&apos;d rather just talk: <a href="tel:+16012018759" className="font-black underline underline-offset-4" style={{ color: "var(--accent)" }}>{CAMPAIGN_CONTACT_PHONE}</a>
          </p>
          {done.savedReferral && (
            <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              I&apos;ll reach out within a day and mention your name. If it turns into a chapter that
              signs up, I&apos;ll let you know.
            </p>
          )}
          {done.subscribed && (
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              I&apos;ll send you an update partway through the semester.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id={id} className="sa-anchor mt-16" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{heading}</h2>

      <div className="mt-5 flex flex-col gap-4 rounded-2xl p-5 sm:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <Field label="Your name" htmlFor="rf-name" required>
          <input id="rf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" className="sa-field" style={FIELD} />
        </Field>

        <Field label="Your email" htmlFor="rf-email">
          <input id="rf-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@email.com" className="sa-field" style={FIELD} />
          <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[13.5px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
            <input type="checkbox" checked={subscribe} onChange={(e) => setSubscribe(e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, accentColor: "var(--accent)" }} />
            <span>Send me updates on how this campaign goes</span>
          </label>
        </Field>

        <Divider>If you have a referral</Divider>

        <Field label="Campus" htmlFor="rf-campus">
          {notListed ? (
            <input id="rf-campus" value={campusText} onChange={(e) => setCampusText(e.target.value)} placeholder="Which school?" className="sa-field" style={FIELD} autoFocus />
          ) : (
            <SearchPicker
              items={campusItems}
              value={campusId}
              placeholder={campusesQ.isLoading ? "Loading campuses…" : "Find their campus"}
              searchPlaceholder={`Search ${campusItems.length} campuses…`}
              disabled={campusesQ.isLoading}
              ariaLabel="Their campus"
              onPick={setCampusId}
            />
          )}
          <button
            type="button"
            onClick={() => { setNotListed((v) => !v); setCampusId(null); setCampusText(""); }}
            className="mt-2 text-[12.5px] underline underline-offset-4"
            style={{ color: "var(--text-muted)", background: "none", border: 0, minHeight: 36, cursor: "pointer" }}
          >
            {notListed ? "Pick from the list instead" : "Not listed?"}
          </button>
        </Field>

        <Field label="Their name" htmlFor="rf-refname">
          <input id="rf-refname" value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="Who should I talk to?" className="sa-field" style={FIELD} />
        </Field>

        <Field label="Their email or phone" htmlFor="rf-refcontact" hint="if you have it">
          <input id="rf-refcontact" value={refContact} onChange={(e) => setRefContact(e.target.value)} placeholder="" className="sa-field" style={FIELD} />
        </Field>

        <Field label="How you know them">
          <div className="flex flex-wrap gap-1.5">
            {RELATIONSHIPS.map((r) => {
              const on = relationship === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRelationship(on ? "" : r)}
                  className="rounded-full px-3.5 text-[13px] font-bold focus-visible:ring-2"
                  style={{
                    minHeight: 40,
                    background: on ? "rgba(252,163,17,0.14)" : "rgba(0,0,0,0.24)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}`,
                    color: on ? "var(--accent)" : "var(--brand-cream)", cursor: "pointer",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </Field>

        <Divider>Or just talk to me</Divider>

        <Field label="Comments" htmlFor="rf-comments">
          <textarea
            id="rf-comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={6}
            placeholder="Ideas, critique, words of encouragement — all welcome."
            className="sa-field"
            style={{ ...FIELD, minHeight: 150, padding: "12px", lineHeight: 1.5, resize: "vertical" }}
          />
        </Field>

        <Field label="Want to talk?">
          <div className="flex flex-col gap-1.5 sm:flex-row">
            {[
              { v: true, label: "Let's set up a call" },
              { v: false, label: "Not right now" },
            ].map(({ v, label }) => {
              const on = wantsCall === v;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setWantsCall(on ? null : v)}
                  className="flex items-center gap-2.5 rounded-xl px-3.5 text-left text-[13.5px] font-bold focus-visible:ring-2 sm:flex-1"
                  style={{
                    minHeight: 46,
                    background: on ? "rgba(252,163,17,0.10)" : "rgba(0,0,0,0.24)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}`,
                    color: "var(--brand-cream)", cursor: "pointer",
                  }}
                >
                  <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: 14, height: 14, border: `2px solid ${on ? "var(--accent)" : "var(--text-muted)"}`, background: on ? "var(--accent)" : "transparent" }} />
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        {err && <p role="alert" className="text-[13px]" style={{ color: "#F3C6CC" }}>{err}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready}
          className="w-full rounded-xl text-[15.5px] font-black transition-transform hover:scale-[1.01] focus-visible:ring-2 disabled:opacity-40"
          style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
        >
          {busy ? "Sending…" : "Send it to Lee"}
        </button>
      </div>
    </section>
  );
}

const FIELD: React.CSSProperties = {
  minHeight: 48, width: "100%", borderRadius: 12, padding: "0 12px", fontSize: 16,
  background: "rgba(0,0,0,0.32)", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontFamily: BRAND_SANS, outline: "none",
};

/** ONLY THE NAME IS MARKED. Marking the rest "optional" would say, fifteen times, that the form
 *  expects things the reader is not giving it. */
function Field({ label, htmlFor, hint, required, children }: {
  label: string; htmlFor?: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
        {label}
        {required && <span aria-hidden style={{ color: "var(--accent)" }}> *</span>}
        {hint && <span className="ml-1.5 font-bold normal-case" style={{ opacity: 0.8, letterSpacing: 0 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-3" aria-hidden={false}>
      <span className="h-px flex-1" style={{ background: "var(--border-default)" }} />
      <span className="text-[11.5px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>{children}</span>
      <span className="h-px flex-1" style={{ background: "var(--border-default)" }} />
    </div>
  );
}
