// THE ACCOUNT TAB — setup, arranged as something to finish.
//
// Four rows, four checkboxes, a count badge on the tab. The arrangement is the argument: a
// student who has not told us their professor is getting the generic outline and does not know a
// better one exists, and a settings form does not communicate that. A row of empty boxes does.
//
// ── ON THE ANIMATION ──────────────────────────────────────────────────────────────────────────
// Checking a row should feel like progress, so the box fills and the tick draws itself in ~500ms.
// It is CSS keyframes on a one-shot class, not a library, and it is behind prefers-reduced-motion
// — this is a study surface, and someone who has asked their phone to stop animating things is
// usually asking for a reason.
import { Check, Upload } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SETUP_ITEMS, type SetupItemId } from "@/lib/learn-setup";

export const ACCOUNT_CSS = `
@keyframes sa-check-pop {
  0%   { transform: scale(0.7); }
  55%  { transform: scale(1.14); }
  100% { transform: scale(1); }
}
@keyframes sa-check-draw {
  from { stroke-dashoffset: 22; }
  to   { stroke-dashoffset: 0; }
}
.sa-check-just { animation: sa-check-pop 460ms cubic-bezier(0.34, 1.4, 0.64, 1); }
.sa-check-just svg { stroke-dasharray: 22; animation: sa-check-draw 460ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .sa-check-just, .sa-check-just svg { animation: none; }
}
`;

export function AccountTab({ state, toggle, justChecked, remaining, email, onSignIn, onSignOut }: {
  state: Partial<Record<SetupItemId, boolean>>;
  toggle: (id: SetupItemId) => void;
  justChecked: SetupItemId | null;
  remaining: number;
  email: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
        Set up your course
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: "var(--lm-muted)" }}>
        {remaining === 0
          ? "All set. Everything here matches your section."
          : `${remaining} thing${remaining === 1 ? "" : "s"} left — each one makes your plan more like your actual exam.`}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {SETUP_ITEMS.map((item) => {
          const done = !!state[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={done}
                className="flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left"
                style={{
                  background: done ? "color-mix(in srgb, var(--lm-accent) 8%, transparent)" : "rgba(255,255,255,0.035)",
                  border: `1px solid ${done ? "color-mix(in srgb, var(--lm-accent) 40%, transparent)" : "var(--lm-border)"}`,
                  cursor: "pointer", minHeight: 60,
                }}
              >
                <span
                  className={`grid shrink-0 place-items-center rounded-md${justChecked === item.id ? " sa-check-just" : ""}`}
                  style={{
                    height: 22, width: 22, marginTop: 1,
                    background: done ? "var(--lm-accent)" : "transparent",
                    border: `2px solid ${done ? "var(--lm-accent)" : "var(--lm-border)"}`,
                    color: "var(--lm-accent-ink)",
                  }}
                >
                  {done && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[14px] font-black" style={{ color: "var(--lm-text)" }}>{item.label}</span>
                    {item.id === "syllabus" && <Upload className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--lm-muted)" }} />}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--lm-muted)" }}>{item.why}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* SAID OUT LOUD. There is nowhere to put a syllabus file yet — no table, and this pass may
          not write one — so the checkbox records an intention, not an upload. Implying otherwise
          would have students believing Lee has a document he has never seen. */}
      <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--lm-muted)" }}>
        These are saved on this device for now. To actually send your syllabus, text it to Lee —
        the Help button up top has his number.
      </p>

      <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--lm-border)" }}>
        {email ? (
          <>
            <p className="text-[12.5px]" style={{ color: "var(--lm-muted)" }}>Signed in as</p>
            <p className="truncate text-[14px] font-bold" style={{ color: "var(--lm-text)" }}>{email}</p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-3 rounded-lg px-3.5 text-[13px] font-bold"
              style={{ minHeight: 44, color: "var(--lm-text)", border: "1px solid var(--lm-border)", background: "transparent", cursor: "pointer" }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px]" style={{ color: "var(--lm-muted)" }}>
              Sign in and your progress follows you to any device.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="mt-3 rounded-lg px-4 text-[13.5px] font-black"
              style={{ minHeight: 44, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
