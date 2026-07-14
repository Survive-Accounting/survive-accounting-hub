// TEMPLATE VARIABLES (design elements run) — headings and text elements accept
// tokens; docs store the RAW token, rendering substitutes from the PREVIEW
// STUDENT (canvas settings, localStorage). Live per-student resolution arrives
// with auth/World v1 (roadmap). Unset token → the token itself, dimmed — an
// authoring hint, never a blank hole.
import type { ReactNode } from "react";

import { NEON } from "./theme";

export const TOKEN_KEYS = ["first_name", "university", "professor", "course_code", "exam_date"] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];

export type PreviewStudent = Record<TokenKey, string>;

const LS_KEY = "sa-canvas-preview-student";

/** Sensible defaults — Max at Ole Miss, near-date exam. */
export function defaultPreviewStudent(): PreviewStudent {
  const exam = new Date(Date.now() + 12 * 86400_000);
  return {
    first_name: "Max",
    university: "Ole Miss",
    professor: "Prof. Gochnauer",
    course_code: "ACCY 201",
    exam_date: exam.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

export function loadPreviewStudent(): PreviewStudent {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaultPreviewStudent(), ...(JSON.parse(raw) as Partial<PreviewStudent>) };
  } catch { /* fall through */ }
  return defaultPreviewStudent();
}

export function savePreviewStudent(s: PreviewStudent): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** first_name renders CLEANED: trimmed, first letter capitalized. */
function cleanValue(key: TokenKey, v: string): string {
  const t = v.trim();
  if (key === "first_name" && t) return t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

const TOKEN_RE = /\{(first_name|university|professor|course_code|exam_date)\}/g;

/** Substitute tokens → React nodes. Unset values render the raw token dimmed. */
export function renderTokens(text: string, student: PreviewStudent): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, "g");
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = m[1] as TokenKey;
    const val = cleanValue(key, student[key] ?? "");
    out.push(
      val ? (
        <span key={`t${i++}`}>{val}</span>
      ) : (
        <span key={`t${i++}`} style={{ opacity: 0.35, fontStyle: "italic" }} title="Unset preview value — edit the Preview student in canvas settings">
          {m[0]}
        </span>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Plain-string substitution (title attributes, measurements). Unset → token kept. */
export function substituteTokens(text: string, student: PreviewStudent): string {
  return text.replace(TOKEN_RE, (tok, key: TokenKey) => cleanValue(key, student[key] ?? "") || tok);
}

/** The {x} insert menu — token list with example values. */
export function TokenMenu({ student, onInsert }: { student: PreviewStudent; onInsert: (token: string) => void }) {
  return (
    <div
      className="nodrag w-52 rounded-lg p-1.5 shadow-xl"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 px-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Insert variable</div>
      {TOKEN_KEYS.map((k) => (
        <button
          key={k}
          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-white/5"
          onClick={() => onInsert(`{${k}}`)}
        >
          <span className="text-[11px] font-semibold" style={{ color: NEON.cyan }}>{`{${k}}`}</span>
          <span className="ml-auto truncate text-[10px]" style={{ color: NEON.muted }}>{cleanValue(k, student[k] ?? "") || "—"}</span>
        </button>
      ))}
    </div>
  );
}
