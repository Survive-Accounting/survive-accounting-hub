// BETA INVITE (Lee, 2026-09-17) — one form on /admin/site-qa: a friend's email in, a link out. The link makes their
// browser a beta tester (beta-invite.server.ts): the real site, everything they create is test data, no texts,
// rep phone code 000000, and emails still reach them.
import { useState } from "react";

import { mintBetaInvite } from "@/lib/test-mode.functions";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const START_AT: { label: string; to: string }[] = [
  { label: "Home", to: "/" },
  { label: "Ole Miss /learn", to: "/learn/ole-miss" },
  { label: "Rep apply (Test University)", to: "/rep/join/test-university" },
  { label: "Chapter (Test University)", to: "/learn/test-university/test-chapter" },
];

export function BetaInviteCard() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [to, setTo] = useState("/");
  const [url, setUrl] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true); setWarn(null); setUrl(null); setCopied(false);
    try {
      const r = await mintBetaInvite({ data: { email, name: name || undefined } });
      const link = to === "/" ? r.url : `${r.url}&to=${encodeURIComponent(to)}`;
      setUrl(link);
      if (!r.testModeOn) setWarn("TEST_MODE_ENABLED is off on this deployment — the link will open the real site with no test session.");
    } catch (e) { setWarn(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-bold">Beta invite</h2>
        <span className="text-xs text-slate-600">The real site for a friend. Everything they create is test data; no texts go out; the rep phone code is 000000; emails still reach them.</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-semibold">Their email
          <input id="beta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" className="mt-1 w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" />
        </label>
        <label className="flex flex-col text-xs font-semibold">First name
          <input id="beta-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" className="mt-1 w-32 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" />
        </label>
        <label className="flex flex-col text-xs font-semibold">Starts on
          <select id="beta-to" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal">
            {START_AT.map((s) => <option key={s.to} value={s.to}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)} onClick={() => void make()} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? "Making…" : "Make the link"}</button>
      </div>
      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="max-w-full break-all rounded bg-white px-2 py-1 text-xs">{url}</code>
          <button type="button" onClick={() => void copyToClipboard(url).then((ok) => setCopied(ok))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold">{copied ? "Copied" : "Copy"}</button>
        </div>
      )}
      {warn && <p className="mt-2 text-xs font-semibold text-red-700">{warn}</p>}
    </section>
  );
}
