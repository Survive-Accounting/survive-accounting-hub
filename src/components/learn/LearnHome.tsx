// HOME (learn v3.1, 09-03) — extremely simple, on purpose.
//
//   Free ACCY 201 prep at Ole Miss
//   Cram · Easy Points        [shorts row]
//   Cram · Analyzing …        [shorts row]
//   Practice                  [question cards]
//
// Lee: the plan cards and the topic pills were "too complicated, so much space". Gone. What is
// left is the title and the content itself, in the homepage's palette and type. Where a student
// starts from here is a separate story — nothing on this page adds a CTA.
import { forwardRef } from "react";
import { Check, Lock } from "lucide-react";

import { INK } from "@/components/learn/learn-theme";
import { fmtRuntime, muxThumb } from "@/components/learn/cram-media";
import type { RailKey } from "@/components/learn/LearnRail";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";

export type HomeSet = { set: StudentSet; topic: StudentTopic; n: number; of: number; locked: boolean; done: boolean; watched: number; playable: boolean };

/** "Free ACCY 201 prep at Ole Miss" — the page title, from what we know of the campus. */
export function learnTitle(courseCode: string | null, schoolName: string | null): string {
  const what = courseCode ? `Free ${courseCode} prep` : "Free intro accounting prep";
  return schoolName ? `${what} at ${schoolName}` : what;
}

export const LearnHome = forwardRef<HTMLDivElement, {
  sets: HomeSet[];
  courseCode: string | null;
  schoolName: string | null;
  narrow: boolean;
  onOpenSet: (setId: string, practice?: boolean) => void;
  onLocked: (topic: StudentTopic) => void;
  rowRef: (key: RailKey) => (el: HTMLElement | null) => void;
  account: { email: string | null; userId: string | null; onSignIn: () => void; signOut: () => void };
}>(function LearnHome({ sets, courseCode, schoolName, narrow, onOpenSet, onLocked, rowRef, account }, ref) {
  const byTopic: { topic: StudentTopic; sets: HomeSet[] }[] = [];
  for (const s of sets) { const g = byTopic.find((x) => x.topic.id === s.topic.id); if (g) g.sets.push(s); else byTopic.push({ topic: s.topic, sets: [s] }); }
  const practice = sets.filter((s) => s.set.ceqCount > 0);
  const pad = narrow ? "0 16px" : "0 32px";

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <h1 className="lk-disp" style={{ padding: narrow ? "14px 16px 6px" : "18px 32px 8px", fontSize: narrow ? 22 : 28, lineHeight: 1.15, letterSpacing: "-0.015em", color: INK.text }}>
        {learnTitle(courseCode, schoolName)}
      </h1>

      <div className="flex flex-col" style={{ gap: narrow ? 26 : 34, padding: "10px 0 40px" }}>
        {byTopic.map(({ topic, sets: ts }, i) => (
          <section key={topic.id} ref={i === 0 ? rowRef("cram") : undefined} style={{ padding: pad }} className="flex flex-col gap-3">
            <RowHead title="Cram" sub={topic.name} />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              {ts.map((s) => <Short key={s.set.id} s={s} narrow={narrow} onOpen={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />)}
            </div>
          </section>
        ))}

        {practice.length > 0 && (
          <section ref={rowRef("practice")} style={{ padding: pad }} className="flex flex-col gap-3">
            <RowHead title="Practice" />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              {practice.map((s) => (
                <button key={s.set.id} type="button" onClick={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id, true))} className="lk-card lk-body flex shrink-0 flex-col gap-2 p-3.5 text-left" style={{ width: narrow ? 230 : 290, color: INK.text, cursor: "pointer" }}>
                  <div className="flex items-center gap-2 text-[13.5px] font-bold"><span className="min-w-0 flex-1 truncate">{s.set.name}</span>{s.locked && <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: INK.muted }} />}</div>
                  <div className="text-[12px]" style={{ color: INK.muted }}>{s.set.ceqCount} question{s.set.ceqCount === 1 ? "" : "s"}{s.set.shortLabel ? ` · ${s.set.shortLabel}` : ""}</div>
                  {s.set.firstStem && <div className="line-clamp-2 text-[12.5px] leading-relaxed" style={{ color: INK.muted }}>{s.set.firstStem}</div>}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="lk-body text-[12.5px]" style={{ padding: pad, color: INK.muted }}>
          {account.userId
            ? <>Signed in as {account.email}. <button type="button" onClick={account.signOut} className="underline underline-offset-2" style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", font: "inherit" }}>Sign out</button></>
            : <>Have an account? <button type="button" onClick={account.onSignIn} className="underline underline-offset-2" style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", font: "inherit" }}>Sign in</button></>}
        </div>
      </div>
    </div>
  );
});

function RowHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="lk-disp" style={{ fontSize: 19, color: INK.text }}>{title}</span>
      {sub && <span className="lk-body truncate text-[13px]" style={{ color: INK.muted }}>{sub}</span>}
    </div>
  );
}

function Short({ s, narrow, onOpen }: { s: HomeSet; narrow: boolean; onOpen: () => void }) {
  const pid = s.set.playbackId;
  const hasThumb = !!pid && pid !== "__demo__" && !s.locked;
  return (
    <button type="button" onClick={onOpen} className="lk-short" data-on={false} style={{ width: narrow ? 118 : 152, height: narrow ? 210 : 270, opacity: s.locked ? 0.7 : 1 }} title={s.set.name}>
      {hasThumb && <img src={muxThumb(pid!, 320)} alt="" loading="lazy" />}
      {!pid && !s.locked && <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold" style={{ color: INK.dim }}>Cram video coming soon</span>}
      {s.locked && <Lock className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" style={{ color: INK.muted }} />}
      {s.set.runtimeSec != null && pid && <span className="lk-short-d">{fmtRuntime(s.set.runtimeSec)}</span>}
      {s.done && <span className="absolute left-2 top-2 z-[1] grid h-6 w-6 place-items-center rounded-full" style={{ background: INK.green, color: "#0B1220" }}><Check className="h-3.5 w-3.5" /></span>}
      {!s.done && s.watched > 0 && <span className="absolute inset-x-0 bottom-0 z-[1] h-[3px]" style={{ background: "rgba(255,255,255,0.2)" }}><span className="block h-full" style={{ width: `${Math.round(s.watched * 100)}%`, background: "var(--lk-acc)" }} /></span>}
      <span className="lk-short-t" style={{ zIndex: 1 }}>{s.set.name}</span>
    </button>
  );
}
