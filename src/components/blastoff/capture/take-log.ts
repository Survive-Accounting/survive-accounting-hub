// THE TAKE LOG (G) — while OBS records, this window writes down when each slide arrived, measured from
// the F4 that started the recording (take-slice.ts has the why; the table is take_logs). The window
// that OWNS the take writes it — the pop-out when it is live, else /film itself — the same owner the
// F3 scrap uses, so the scraps and the timeline always share one take_ref.
//
// A new F4 starts a new log. Saves are batched (every few seconds while slides change) and flushed
// when the window closes. A save that fails says so, loudly, once — a continuous take whose timeline
// isn't saving is a recording that can't be sliced, and that is worth knowing before minute twenty.
import { useEffect, useRef } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { saveTakeLog } from "@/lib/take-log.functions";

import { rollAtFor, takeRefOf } from "../frame-events";
import type { Arrival } from "../take-slice";
import { readRoll } from "./prompter-sync";

const SAVE_EVERY_MS = 4000;

export function useTakeLog({ setId, takeIndex, owns, frameId, takeOf, onError }: {
  setId: string;
  /** ?take=N — which split the recording is of; undefined films the whole set. */
  takeIndex: number | undefined;
  owns: boolean;
  frameId: string | null;
  /** The split a slide belongs to (its index in planTakes(filmFrames())). */
  takeOf: (frameId: string) => number;
  onError: (message: string) => void;
}): void {
  const log = useRef<{ rollAt: number; takeRef: string; arrivals: Arrival[]; dirty: boolean } | null>(null);
  const shown = useRef<{ id: string | null; at: number }>({ id: frameId, at: Date.now() });
  const takeOfRef = useRef(takeOf); takeOfRef.current = takeOf;
  const errRef = useRef(onError); errRef.current = onError;
  const warned = useRef(false);

  /** The log for the recording in progress — a fresh one on a new F4, with the slide on screen at 0. */
  const current = () => {
    const rollAt = rollAtFor(readRoll(), setId, Date.now());
    if (rollAt === null) return null;
    if (!log.current || log.current.rollAt !== rollAt) {
      const on = shown.current.id;
      log.current = { rollAt, takeRef: takeRefOf(setId, takeIndex, rollAt), arrivals: on ? [{ frameId: on, take: takeOfRef.current(on), atMs: Math.max(0, Math.round(shown.current.at - rollAt)) }] : [], dirty: true };
    }
    return log.current;
  };

  const save = () => {
    const l = log.current;
    if (!l || !l.dirty) return;
    l.dirty = false;
    void saveTakeLog({ data: { takeRef: l.takeRef, setId, rolledAt: new Date(l.rollAt).toISOString(), arrivals: l.arrivals, who: getAdminWho() } })
      .then((r) => { if (!r.ok) { l.dirty = true; if (!warned.current) { warned.current = true; errRef.current(`⚠ take timeline not saving — ${r.error}`); } } })
      .catch((e) => { l.dirty = true; if (!warned.current) { warned.current = true; errRef.current(`⚠ take timeline not saving — ${e instanceof Error ? e.message : String(e)}`); } });
  };

  // Each slide change, while a roll is live.
  useEffect(() => {
    shown.current = { id: frameId, at: Date.now() };
    if (!owns || !frameId) return;
    const l = current();
    if (!l) return;
    const last = l.arrivals[l.arrivals.length - 1];
    if (last?.frameId === frameId) return;
    l.arrivals.push({ frameId, take: takeOfRef.current(frameId), atMs: Math.max(0, Math.round(Date.now() - l.rollAt)) });
    l.dirty = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameId, owns, setId, takeIndex]);

  // Notice a new F4 even when no slide changes, and save what's pending.
  useEffect(() => {
    if (!owns) return;
    const t = window.setInterval(() => { current(); save(); }, SAVE_EVERY_MS);
    const flush = () => save();
    window.addEventListener("pagehide", flush);
    return () => { window.clearInterval(t); window.removeEventListener("pagehide", flush); save(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owns, setId, takeIndex]);
}
