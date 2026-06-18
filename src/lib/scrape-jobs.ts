// Global, in-memory queue of recent scrape jobs (faculty + RMP) across campuses.
// Lets Lee click through many campuses quickly and still see in the left
// sidebar which jobs are running, which succeeded, and which failed.
//
// Not persisted — wiped on full reload. That's fine; this is a session HUD.
import { useEffect, useState } from "react";

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

const MAX_JOBS = 40;
const jobs: ScrapeJob[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

let heartbeat: ReturnType<typeof setInterval> | null = null;
function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!jobs.some((j) => j.status === "running")) {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      return;
    }
    emit();
  }, 1000);
}

export function startScrapeJob(input: {
  campusId: string;
  campusName: string;
  kind: ScrapeJobKind;
}): {
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
} {
  const job: ScrapeJob = {
    id: `${input.campusId}-${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    campusId: input.campusId,
    campusName: input.campusName,
    kind: input.kind,
    status: "running",
    startedAt: Date.now(),
  };
  jobs.unshift(job);
  while (jobs.length > MAX_JOBS) jobs.pop();
  ensureHeartbeat();
  emit();

  const finish = (status: ScrapeJobStatus, message?: string) => {
    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx === -1) return;
    jobs[idx] = { ...jobs[idx], status, message, endedAt: Date.now() };
    emit();
  };
  return {
    succeed: (m) => finish("success", m),
    fail: (m) => finish("error", m),
  };
}

export function clearFinishedScrapeJobs() {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].status !== "running") jobs.splice(i, 1);
  }
  emit();
}

export function useScrapeJobs(): ScrapeJob[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return jobs.slice();
}
