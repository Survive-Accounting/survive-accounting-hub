// Server functions for /admin/site-qa. Client-safe module: it only declares
// createServerFn endpoints; every handler dynamic-imports the server-only
// orchestrator (site-qa/site-qa.server) AFTER an admin check, so secret tokens
// and service-role access never reach the client bundle.
//
// Auth: the caller passes their Supabase access token (same idiom as the rest of
// /outreach). assertAdmin resolves it to an allow-listed email server-side —
// this is the real gate; the route's AdminGate is only a client deterrent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SiteQaOverview, TrafficView } from "./site-qa/types";

const tokenSchema = z.object({ accessToken: z.string().min(20) });

export type { SiteQaOverview, TrafficView } from "./site-qa/types";
export type { TemplateView, QaExample } from "./site-qa/types";

export const getSiteQaOverview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<SiteQaOverview> => {
    const s = await import("./site-qa/site-qa.server");
    await s.assertAdmin(data.accessToken);
    return s.buildOverview();
  });

export const getSiteQaTraffic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema.extend({ days: z.number().int().min(1).max(365).default(30) }).parse(d),
  )
  .handler(async ({ data }): Promise<TrafficView> => {
    const s = await import("./site-qa/site-qa.server");
    await s.assertAdmin(data.accessToken);
    return s.buildTraffic(data.days);
  });

export const verifyTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema
      .extend({ templateId: z.string().min(1).max(64), note: z.string().max(280).nullish() })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const s = await import("./site-qa/site-qa.server");
    const { email } = await s.assertAdmin(data.accessToken);
    // Record a short name for readability ("lee" from lee@…), not the full email.
    return s.verifyTemplate(data.templateId, email.split("@")[0], data.note ?? undefined);
  });

export const setTemplateNote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema
      .extend({ templateId: z.string().min(1).max(64), note: z.string().max(280).nullable() })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const s = await import("./site-qa/site-qa.server");
    await s.assertAdmin(data.accessToken);
    return s.setNote(data.templateId, data.note && data.note.trim() ? data.note.trim() : null);
  });

const pinSchema = z.object({ label: z.string().min(1).max(120), url: z.string().min(1).max(300) });

export const setTemplatePins = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema
      .extend({ templateId: z.string().min(1).max(64), pins: z.array(pinSchema).max(6) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const s = await import("./site-qa/site-qa.server");
    await s.assertAdmin(data.accessToken);
    return s.setPins(data.templateId, data.pins);
  });
