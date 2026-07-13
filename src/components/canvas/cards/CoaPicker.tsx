// COA picker — the "Choose account" panel. Five teaching types first; click a
// type to expand its accounts; pick one. Search is ALWAYS on (A9 — the toggle
// retired); normal-balance chips gated by the card's settings. Paper styling.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";

import { PAPER } from "../theme";
import type { CoaGroup } from "../je-logic";

export function CoaPicker({
  groups,
  showChips,
  onPick,
  onClose,
}: {
  groups: CoaGroup[];
  showChips: boolean;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () => (needle ? groups.flatMap((g) => g.accounts.filter((a) => a.name.toLowerCase().includes(needle)).map((a) => ({ ...a, group: g.label }))) : []),
    [groups, needle],
  );

  return (
    <div
      // pure content — positioning/portal belongs to CardPopover (never clips inside a card)
      className="nodrag nowheel max-h-64 w-64 overflow-y-auto rounded-lg p-1.5 shadow-xl"
      style={{ background: "#FFFFFF", border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 16px 40px -12px rgba(20,33,61,0.45)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1">
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5" style={{ border: `1px solid ${PAPER.line}` }}>
          <Search className="h-3 w-3 shrink-0" style={{ color: PAPER.inkMuted }} />
          <input
            className="w-full bg-transparent text-[11.5px] outline-none"
            style={{ color: PAPER.ink }}
            placeholder="Search accounts…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); e.stopPropagation(); }}
          />
        </label>
        <button className="shrink-0 rounded p-0.5" style={{ color: PAPER.inkMuted }} onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {groups.length === 0 && (
        <p className="px-1 py-2 text-[11px] italic" style={{ color: PAPER.inkMuted }}>
          Chart of accounts unavailable — type the account name instead.
        </p>
      )}

      {needle
        ? hits.map((a) => (
            <AccountRow key={`${a.group}-${a.name}`} name={a.name} sub={a.group} normal={a.normal} showChip={showChips} onPick={onPick} />
          ))
        : groups.map((g) => (
            <div key={g.label}>
              <button
                className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[12px] font-bold"
                style={{ color: PAPER.navy }}
                onClick={() => setOpen(open === g.label ? null : g.label)}
              >
                {open === g.label ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="flex-1">{g.label}</span>
                {showChips && <NormalChip normal={g.normal} />}
                <span className="text-[9.5px] font-normal tabular-nums" style={{ color: PAPER.inkMuted }}>{g.accounts.length}</span>
              </button>
              {open === g.label && g.accounts.map((a) => (
                <AccountRow key={a.name} name={a.name} normal={a.normal} showChip={showChips} indent onPick={onPick} />
              ))}
            </div>
          ))}
      {needle && hits.length === 0 && (
        <p className="px-1 py-2 text-[11px] italic" style={{ color: PAPER.inkMuted }}>No matches — free-type it.</p>
      )}
    </div>
  );
}

function AccountRow({ name, sub, normal, showChip, indent, onPick }: {
  name: string; sub?: string; normal: "debit" | "credit"; showChip: boolean; indent?: boolean; onPick: (name: string) => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] hover:bg-black/5 ${indent ? "pl-5" : ""}`}
      style={{ color: PAPER.ink }}
      onClick={() => onPick(name)}
      title={name}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {sub && <span className="shrink-0 text-[9px]" style={{ color: PAPER.inkMuted }}>{sub}</span>}
      {showChip && <NormalChip normal={normal} />}
    </button>
  );
}

function NormalChip({ normal }: { normal: "debit" | "credit" }) {
  const dr = normal === "debit";
  return (
    <span
      className="shrink-0 rounded px-1 text-[8.5px] font-bold"
      style={{ color: dr ? PAPER.navy : PAPER.red, border: `1px solid ${dr ? "rgba(20,33,61,0.35)" : "rgba(194,24,50,0.35)"}` }}
      title={dr ? "normal balance: debit (+ on the left)" : "normal balance: credit (+ on the right)"}
    >
      {dr ? "+DR" : "+CR"}
    </span>
  );
}
