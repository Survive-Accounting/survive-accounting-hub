// Survive analytics — the ONE browser event layer (PostHog).
//
// Design rules (see SITE_QA_IMPLEMENTATION.md §PostHog):
//  • PostHog owns product analytics — page views, funnels, replays. We do NOT
//    build a pageview warehouse of our own.
//  • This module is the single, coherent event taxonomy. Prefer PROPERTIES over
//    new event names — one `exam_opened` with a `campus_id` beats twenty events.
//  • It fails GRACEFULLY and SILENTLY: with no VITE_PUBLIC_POSTHOG_KEY set,
//    nothing initializes, `track()` is a no-op, and the app is unaffected. Any
//    error inside PostHog is swallowed — analytics must never break a page.
//  • posthog-js is loaded via dynamic import, so when analytics is disabled its
//    code is never fetched.
//
// Required env (browser-safe, so VITE_-prefixed — never put a secret here):
//   VITE_PUBLIC_POSTHOG_KEY   — the PROJECT (write-only) key. Safe client-side.
//   VITE_PUBLIC_POSTHOG_HOST  — optional, defaults to https://us.i.posthog.com

import type { PostHog } from "posthog-js";

/** The Survive event taxonomy. Keep this small and coherent — add a property
 *  before you add an event. */
export const SA_EVENTS = [
  "school_selected",
  "professor_selected",
  "exam_opened",
  "topic_opened",
  "problem_type_opened",
  "question_answered",
  "study_mode_selected",
  "progress_save_started",
  "progress_saved",
  "chapter_member_joined",
  "chapter_claim_started",
  "chapter_claimed",
  "share_link_copied",
  "flyer_downloaded",
  "meeting_slide_downloaded",
  "qr_landing",
  "checkout_started",
  "purchase_completed",
  // Launch polish (08-25): onboarding + prompts + help.
  "school_picker_opened",
  "school_not_listed",
  "personalized_loading_started",
  "personalized_loading_completed",
  "topic_preview_opened",
  "topic_started",
  "easy_points_started",
  "study_reminder_opened",
  "study_reminder_sent",
  "professor_prompt_shown",
  "professor_prompt_selected",
  "professor_prompt_skipped",
  "syllabus_prompt_shown",
  "syllabus_prompt_selected",
  "syllabus_prompt_skipped",
  "help_opened",
  "help_text_clicked",
  "help_email_clicked",
  // Two-portal home + demo chapter experiment (08-26). Properties, not more events:
  // portal_door_selected {door} · demo_mode_flipped {mode} · demo_adventure {action, source}.
  "portal_door_selected",
  "demo_mode_flipped",
  "demo_adventure",
  // Guided Exam 1 path (08-26).
  "exam_path_started",
  "path_step_started",
  "path_step_completed",
  "path_auto_advance_shown",
  "path_auto_advanced",
  "path_auto_advance_paused",
  "path_back_clicked",
  "path_next_clicked",
  "topic_completed",
  "exam_completed",
  "retry_missed_clicked",
  "intro_reset_clicked",
  // Two-door homepage hero (08-27). Names locked by the redesign spec; context rides as
  // properties: {campus_id, course_code, returning, source}.
  "homepage_study_solo_clicked",
  "homepage_chapter_clicked",
  "homepage_course_scope_opened",
  // Player V2 "Tonight's Plan" beta (08-27, /preview/exam1 only). Properties:
  // {mode, goal, estimated_minutes, included_step_count, from_mode, to_mode, from_goal, to_goal,
  //  topic, added_depth, estimated_minutes_added}.
  "player_v2_opened",
  "study_mode_viewed",
  "study_mode_selected",
  "goal_viewed",
  "goal_selected",
  "plan_generated",
  "plan_started",
  "plan_changed",
  "topic_depth_opened",
  "topic_depth_added",
  "syllabus_upload_clicked",
  "map_browsed",
] as const;

export type SaEvent = (typeof SA_EVENTS)[number];

/** Shared property vocabulary. All optional; attach what the surface knows.
 *  Do not put sensitive educational content (answers, PII) in here. */
export interface SaProps {
  campus_id?: string;
  course_id?: string;
  professor_id?: string;
  exam?: string;
  topic_id?: string;
  problem_type_id?: string;
  chapter_id?: string;
  council_id?: string;
  national_org_id?: string;
  campaign?: string;
  referral_source?: string;
  [key: string]: string | number | boolean | null | undefined;
}

let ph: PostHog | null = null;
let initStarted = false;

function host(): string {
  return (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string) || "https://us.i.posthog.com";
}

/** Enabled only when a project key is configured. */
export function analyticsEnabled(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);
}

/** Initialize PostHog once, on the client. Safe to call repeatedly. No-op when
 *  disabled or on the server. */
export async function initAnalytics(): Promise<void> {
  if (typeof window === "undefined") return;
  if (initStarted) return;
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
  if (!key) return; // disabled — never touch the network
  initStarted = true;
  try {
    const posthog = (await import("posthog-js")).default;
    posthog.init(key, {
      api_host: host(),
      // We drive pageviews from the router (SPA) — see capturePageview.
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      // Only create person profiles once a user is identified, to keep anonymous
      // volume (and cost) down.
      person_profiles: "identified_only",
    });
    ph = posthog;
  } catch {
    ph = null; // stay silent — analytics is best-effort
  }
}

/** Record a product event. No-op when disabled. */
export function track(event: SaEvent, props?: SaProps): void {
  try {
    ph?.capture(event, props);
  } catch {
    /* never throw from analytics */
  }
}

let lastPath: string | null = null;

/** SPA pageview. Called on each route change (and the first paint). Consecutive
 *  identical paths are de-duped so the init + route-change wiring can both call
 *  it without double counting. */
export function capturePageview(pathname: string): void {
  if (!ph) return; // not ready yet — a later call (post-init) will capture it
  if (pathname === lastPath) return;
  lastPath = pathname;
  try {
    ph.capture("$pageview", { $current_url: window.location.origin + pathname });
  } catch {
    /* ignore */
  }
}

/** Tie subsequent events to a stable user id (e.g. a signed-in student). */
export function identify(distinctId: string, props?: SaProps): void {
  try {
    ph?.identify(distinctId, props);
  } catch {
    /* ignore */
  }
}

/** Clear identity on sign-out. */
export function resetAnalytics(): void {
  try {
    ph?.reset();
  } catch {
    /* ignore */
  }
}
