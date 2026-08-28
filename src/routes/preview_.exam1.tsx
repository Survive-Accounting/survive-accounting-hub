// /preview/exam1 — PRIVATE PLAYER V2 "TONIGHT'S PLAN" BETA (2026-08-27).
//
// The full future Exam 1 journey for Lee and selected beta testers: full-screen plan builder
// (mode · goal) → Tonight's Plan → the REAL guided player walking the plan-filtered path.
// Reached from /preview/home's STUDY SOLO door; no public navigation links here, and the
// public "/" keeps routing ordinary visitors to the September 1 waitlist.
//
// PREVIEW-ONLY, like /preview/home: noindex, unlinked, no loader. The player itself is the live
// LandingPage — Player V2 is a planning layer over it (see components/player-v2/PlayerV2.tsx),
// never a fork.
import { createFileRoute } from "@tanstack/react-router";

import { PlayerV2Preview } from "@/components/player-v2/PlayerV2";

export const Route = createFileRoute("/preview_/exam1")({
  head: () => ({
    meta: [
      { title: "Player V2 beta — Survive Accounting" },
      // A private beta must never surface in search.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlayerV2Preview,
});
