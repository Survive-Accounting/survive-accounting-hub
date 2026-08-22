// LAB ITEMS — what the filming QUEUE holds. An ExhibitProbeRef (the
// addressable exhibit+probe unit, see probes.ts) OR a native exhibit MODE the
// Cycle offers without a probe (definitions / self-test / build). The Lab is
// the only consumer; the reference shape stays pure in probes.ts.
import type { ExhibitId, ExhibitProbeRef, ProbeId } from "./probes";

export type CycleMode = "definitions" | "selftest" | "build";

export interface LabItem {
  exhibit: ExhibitId;
  probe?: ProbeId;
  mode?: CycleMode;
  stepsOff?: string[];
  seed?: Record<string, string | number | boolean>;
}

export const itemLabel = (it: LabItem): string => `${it.exhibit} · ${it.probe ?? it.mode ?? "?"}`;

/** A queue item that IS a reference (has a probe) → the pure ref. */
export const toRef = (it: LabItem): ExhibitProbeRef | null => (it.probe ? { exhibit: it.exhibit, probe: it.probe, ...(it.stepsOff ? { stepsOff: it.stepsOff } : {}), ...(it.seed ? { seed: it.seed } : {}) } : null);
