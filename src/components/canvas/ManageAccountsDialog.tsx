// MANAGE ACCOUNTS (content reset) — Lee-facing curation of a course's COA set.
// Left: the master chart_of_accounts (search all 173) with add buttons.
// Right: this course's curated set with remove buttons. Creating a brand-new
// account inserts into the MASTER and the set in one go (existing names are
// reused, never duplicated). The master itself is never mutated otherwise.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";

import { addCourseAccount, createAccount, listCoa, listCourseAccounts, removeCourseAccount, type CoaRowOut } from "@/lib/canvas.functions";
import { NEON } from "./theme";

const ACCOUNT_TYPES = [
  "asset", "liability", "equity", "revenue", "expense",
  "contra_asset", "contra_liability", "contra_equity", "contra_revenue", "liability_adjunct",
] as const;

export function ManageAccountsDialog({ courseId, courseName, onClose }: {
  courseId: string;
  courseName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<(typeof ACCOUNT_TYPES)[number]>("asset");
  const [newNormal, setNewNormal] = useState<"debit" | "credit">("debit");
  const [err, setErr] = useState<string | null>(null);

  const master = useQuery({ queryKey: ["coa-master"], queryFn: () => listCoa(), staleTime: 600_000 });
  const setQuery = useQuery({
    queryKey: ["course-coa", courseId],
    queryFn: () => listCourseAccounts({ data: { course_id: courseId } }),
  });
  const inSet = useMemo(() => new Set((setQuery.data ?? []).map((r) => r.id)), [setQuery.data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["course-coa", courseId] });
    void qc.invalidateQueries({ queryKey: ["coa-master"] });
  };
  const add = useMutation({
    mutationFn: (account_id: string) => addCourseAccount({ data: { course_id: courseId, account_id } }),
    onSuccess: invalidate,
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const remove = useMutation({
    mutationFn: (account_id: string) => removeCourseAccount({ data: { course_id: courseId, account_id } }),
    onSuccess: invalidate,
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const create = useMutation({
    mutationFn: () =>
      createAccount({ data: { course_id: courseId, canonical_name: newName.trim(), account_type: newType, normal_balance: newNormal } }),
    onSuccess: () => { setNewName(""); invalidate(); },
    onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const needle = q.trim().toLowerCase();
  const masterRows = (master.data ?? []).filter((r) => !needle || r.canonical_name.toLowerCase().includes(needle));

  const row = (r: CoaRowOut, action: "add" | "remove") => (
    <div key={r.id} className="flex items-center gap-2 rounded px-1.5 py-1" style={{ border: `1px solid ${NEON.borderSoft}` }}>
      <span className="min-w-0 flex-1 truncate text-[11.5px]">{r.canonical_name}</span>
      <span className="shrink-0 text-[9px] uppercase" style={{ color: NEON.muted }}>{r.account_type}</span>
      <span className="shrink-0 rounded px-1 text-[8.5px] font-bold" style={{ color: r.normal_balance === "credit" ? NEON.pinkSoft : NEON.cyan, border: `1px solid ${NEON.borderSoft}` }}>
        {r.normal_balance === "credit" ? "+CR" : "+DR"}
      </span>
      {action === "add" ? (
        <button
          className="shrink-0 rounded px-1 disabled:opacity-25"
          style={{ color: NEON.green }}
          title={inSet.has(r.id) ? "Already in this course's set" : `Add to ${courseName}`}
          disabled={inSet.has(r.id) || add.isPending}
          onClick={() => add.mutate(r.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          className="shrink-0 rounded px-1 disabled:opacity-25"
          style={{ color: NEON.red }}
          title="Remove from this course's set (master untouched)"
          disabled={remove.isPending}
          onClick={() => remove.mutate(r.id)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 z-[70] grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[720px] max-w-[94vw] flex-col rounded-xl p-4"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>
            Manage accounts — {courseName}
          </span>
          <button className="ml-auto" style={{ color: NEON.muted }} onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
        </div>
        {err && <p className="mb-2 rounded px-2 py-1 text-[11px]" style={{ color: NEON.red, border: `1px solid rgba(255,92,122,0.4)` }}>{err}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <div className="flex min-h-0 flex-col">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
              Master chart ({master.data?.length ?? "…"})
            </div>
            <label className="mb-1.5 flex items-center gap-1 rounded px-2 py-1" style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.3)" }}>
              <Search className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
              <input
                className="w-full bg-transparent text-[11.5px] outline-none"
                placeholder="Search the master list…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {masterRows.map((r) => row(r, "add"))}
              {master.isLoading && <p className="text-[11px] italic" style={{ color: NEON.muted }}>Loading…</p>}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>
              {courseName}'s set ({setQuery.data?.length ?? "…"})
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {(setQuery.data ?? []).map((r) => row(r, "remove"))}
              {setQuery.data?.length === 0 && (
                <p className="py-2 text-[11px] italic leading-relaxed" style={{ color: NEON.muted }}>
                  Empty — add accounts from the master list, or create a new one below. The JE picker shows exactly this set.
                </p>
              )}
              {setQuery.isError && <p className="text-[11px]" style={{ color: NEON.red }}>{(setQuery.error as Error).message}</p>}
            </div>
          </div>
        </div>

        {/* create brand-new → master AND this set */}
        <div className="mt-3 flex items-end gap-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
          <label className="min-w-0 flex-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
            new account
            <input
              className="mt-0.5 w-full rounded bg-black/30 px-2 py-1 text-[11.5px] font-normal normal-case outline-none"
              style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
              placeholder="e.g. Petty Cash"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <select value={newType} onChange={(e) => setNewType(e.target.value as never)} className="rounded bg-black/40 px-1 py-1 text-[11px] outline-none" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={newNormal} onChange={(e) => setNewNormal(e.target.value as never)} className="rounded bg-black/40 px-1 py-1 text-[11px] outline-none" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
            <option value="debit">+DR</option>
            <option value="credit">+CR</option>
          </select>
          <button
            className="rounded px-2.5 py-1 text-[11px] font-bold disabled:opacity-40"
            style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
            disabled={newName.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "adding…" : "add to master + set"}
          </button>
        </div>
      </div>
    </div>
  );
}
