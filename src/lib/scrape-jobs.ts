// Persistent queue of recent faculty + RMP scrape jobs across campuses,
// backed by the `scrape_jobs` table so jobs survive:
//   - Cloudflare Worker timeouts mid-scrape (watchdog flips them to error)
//   - Full page reloads / cross-tab usage (realtime streams updates back in)
//
// API surface is intentionally compatible with the previous in-memory module:
//   const job = startScrapeJob({ campusId, campusName, kind });
//   job.succeed("…msg…")  |  job.fail("…msg…")
//   useScrapeJobs() -> ScrapeJob[]   (newest first)
//   clearFinishedScrapeJobs()        (deletes finished rows)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ScrapeJobKind = "faculty" | "rmp";
export type ScrapeJobStatus = "running" | "success" | "error";

export type ScrapeJob = {
  id: string;
  campusId: string;
  campusName: string;
  kind: ScrapeJobKind;
  status: ScrapeJobStatus;
  message?: string;
  startedAt: number;
  endedAt?: number;
};

// Show at most this many recent jobs in the HUD (anything older stays in DB).
const MAX_JOBS = 40;
// If the awaited server-fn promise hasn't settled in this long, the client
// gives up and force-fails the row (belt-and-suspenders with the DB watchdog).
const CLIENT_TIMEOUT_MS = 8 * 60 * 1000;

// Local mirror, populated from Supabase + kept in sync via realtime.
let jobs: ScrapeJob[] = [];
const listeners = new Set<() => void>();
let loaded = false;
let loading: Promise<void> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!jobs.some((j) => j.status === "running")) {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      return;
    }
    emit(); // keeps the "Xs / Xm ago" timer ticking
  }, 1000);
}

type Row = {
  id: string;
  campus_id: string;
  campus_name: string;
  kind: ScrapeJobKind;
  status: ScrapeJobStatus;
  message: string | null;
  started_at: string;
  finished_at: string | null;
};

function rowToJob(r: Row): ScrapeJob {
  return {
    id: r.id,
    campusId: r.campus_id,
    campusName: r.campus_name,
    kind: r.kind,
    status: r.status,
    message: r.message ?? undefined,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.finished_at ? new Date(r.finished_at).getTime() : undefined,
  };
}

function upsertLocal(j: ScrapeJob) {
  const idx = jobs.findIndex((x) => x.id === j.id);
  if (idx >= 0) jobs[idx] = j;
  else jobs = [j, ...jobs];
  // Sort newest-first by start time, trim to MAX_JOBS in the HUD.
  jobs.sort((a, b) => b.startedAt - a.startedAt);
  if (jobs.length > MAX_JOBS) jobs = jobs.slice(0, MAX_JOBS);
  if (jobs.some((x) => x.status === "running")) ensureHeartbeat();
  emit();
}

function removeLocal(id: string) {
  const before = jobs.length;
  jobs = jobs.filter((j) => j.id !== id);
  if (jobs.length !== before) emit();
}

async function loadInitial() {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("id,campus_id,campus_name,kind,status,message,started_at,finished_at")
      .order("started_at", { ascending: false })
      .limit(MAX_JOBS);
    if (!error && data) {
      jobs = (data as Row[]).map(rowToJob);
      if (jobs.some((j) => j.status === "running")) ensureHeartbeat();
      emit();
    }
    loaded = true;
  })();
  return loading;
}

function ensureRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel("scrape_jobs_hud")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "scrape_jobs" },
      (payload) => upsertLocal(rowToJob(payload.new as Row)),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "scrape_jobs" },
      (payload) => upsertLocal(rowToJob(payload.new as Row)),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "scrape_jobs" },
      (payload) => {
        const old = payload.old as { id?: string } | null;
        if (old?.id) removeLocal(old.id);
      },
    )
    .subscribe();
}

export function startScrapeJob(input: {
  campusId: string;
  campusName: string;
  kind: ScrapeJobKind;
}): {
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
} {
  // Optimistic local row so the HUD shows the job instantly; the DB insert
  // races below and the realtime UPDATE will replace it by `id`.
  const tempId = `tmp-${input.campusId}-${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = Date.now();
  upsertLocal({
    id: tempId,
    campusId: input.campusId,
    campusName: input.campusName,
    kind: input.kind,
    status: "running",
    startedAt,
  });

  let realId: string | null = null;
  let settled = false;
  const insertPromise = supabase
    .from("scrape_jobs")
    .insert({
      campus_id: input.campusId,
      campus_name: input.campusName,
      kind: input.kind,
      status: "running",
    })
    .select("id")
    .single()
    .then(({ data, error }) => {
      if (error || !data) return;
      realId = data.id;
      // Swap the temp row for the real one (preserves position).
      const idx = jobs.findIndex((j) => j.id === tempId);
      if (idx >= 0) {
        jobs[idx] = { ...jobs[idx], id: data.id };
        emit();
      }
    });

  const finish = async (status: ScrapeJobStatus, message?: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutHandle);
    // Update local mirror immediately.
    const targetId = realId ?? tempId;
    const idx = jobs.findIndex((j) => j.id === targetId);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], status, message, endedAt: Date.now() };
      emit();
    }
    // Make sure the insert has landed so we have a real id to update.
    try { await insertPromise; } catch { /* ignore */ }
    if (!realId) return;
    await supabase
      .from("scrape_jobs")
      .update({
        status,
        message: message ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", realId);
  };

  // Client-side safety net — if the awaited promise never resolves, force-fail
  // the row so the HUD doesn't show a permanent spinner.
  const timeoutHandle = setTimeout(() => {
    if (settled) return;
    finish("error", "Timed out (client watchdog after 8 min)");
  }, CLIENT_TIMEOUT_MS);

  return {
    succeed: (m) => { void finish("success", m); },
    fail: (m) => { void finish("error", m); },
  };
}

export async function clearFinishedScrapeJobs() {
  const ids = jobs.filter((j) => j.status !== "running").map((j) => j.id);
  // Optimistic local clear.
  jobs = jobs.filter((j) => j.status === "running");
  emit();
  if (ids.length === 0) return;
  // Only delete real DB rows (skip any leftover temp ids).
  const realIds = ids.filter((id) => !id.startsWith("tmp-"));
  if (realIds.length === 0) return;
  await supabase.from("scrape_jobs").delete().in("id", realIds);
}

/** Manually trigger the server-side watchdog (8-min stale → error). */
export async function runScrapeJobsWatchdog(): Promise<number> {
  const { data, error } = await supabase.rpc("fail_stale_scrape_jobs");
  if (error) return 0;
  return (data as number) ?? 0;
}

export function useScrapeJobs(): ScrapeJob[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // Kick off load + realtime on first mount.
    void loadInitial();
    ensureRealtime();
    return () => { listeners.delete(l); };
  }, []);
  return jobs.slice();
}
