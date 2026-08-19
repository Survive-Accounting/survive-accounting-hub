// Landing-page settings: per-section show/hide + intro video. Single row
// (site_settings id=1, migration 0030). Read on the homepage; edited in the
// admin landing editor. Reads are defensive: if the table/row is missing
// (migration not yet applied), code defaults are used so the homepage never
// breaks. Free Explainers + Beyond the Exam default OFF.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const SECTION_KEYS = [
  "hero", "painHook", "whoIAm", "dualWelcome", "howItWorks",
  "plans", "freeExplainers", "beyondExam", "questions",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type SiteSettings = {
  sections: Record<SectionKey, boolean>;
  introVideo: { url: string; show: boolean };
  /** /expand referral page — the unlisted YouTube video, swappable WITHOUT a deploy (this row is
   *  data, not code: update site_settings.settings->>'expandVideoUrl' in Supabase and the page picks
   *  it up on next load). Empty = the branded bolt placeholder renders instead. Accepts any YouTube
   *  form (watch?v= / youtu.be / embed) — the page normalizes it. */
  expandVideoUrl: string;
  /** Chapter flyer PDF. DATA, NOT CODE — same reason as expandVideoUrl: set
   *  site_settings.settings->>'greekFlyerUrl' in Supabase and every chapter page offers the
   *  download, with no deploy. Empty string = no flyer exists yet, and the button is not
   *  rendered at all rather than linking somewhere broken. */
  greekFlyerUrl: string;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  sections: {
    hero: true, painHook: true, whoIAm: true, dualWelcome: true,
    howItWorks: true, plans: true, questions: true,
    freeExplainers: false, beyondExam: false,
  },
  introVideo: { url: "", show: false },
  expandVideoUrl: "",
  greekFlyerUrl: "",
};

/** Merge a stored (possibly partial) settings blob over the code defaults so new
 *  keys always have a sane value. */
export function mergeSettings(raw: unknown): SiteSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const sections = { ...DEFAULT_SITE_SETTINGS.sections };
  if (r.sections && typeof r.sections === "object") {
    for (const k of SECTION_KEYS) {
      if (typeof r.sections[k] === "boolean") sections[k] = r.sections[k];
    }
  }
  const iv = (r.introVideo && typeof r.introVideo === "object" ? r.introVideo : {}) as Record<string, any>;
  return {
    sections,
    introVideo: {
      url: typeof iv.url === "string" ? iv.url : DEFAULT_SITE_SETTINGS.introVideo.url,
      show: typeof iv.show === "boolean" ? iv.show : DEFAULT_SITE_SETTINGS.introVideo.show,
    },
    expandVideoUrl: typeof r.expandVideoUrl === "string" ? r.expandVideoUrl : DEFAULT_SITE_SETTINGS.expandVideoUrl,
    greekFlyerUrl: typeof r.greekFlyerUrl === "string" ? r.greekFlyerUrl : DEFAULT_SITE_SETTINGS.greekFlyerUrl,
  };
}

export const getSiteSettings = createServerFn({ method: "GET" })
  .handler(async (): Promise<SiteSettings> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await (supabaseAdmin.from("site_settings" as never) as any)
        .select("settings").eq("id", 1).maybeSingle();
      return mergeSettings(data?.settings);
    } catch {
      return DEFAULT_SITE_SETTINGS; // table missing / not yet migrated → defaults
    }
  });

const settingsSchema = z.object({
  sections: z.record(z.string(), z.boolean()),
  introVideo: z.object({ url: z.string().trim().max(500), show: z.boolean() }),
  // Optional so the landing editor (which doesn't render this field) can save without it — the
  // handler preserves the stored value rather than blanking Lee's /expand video URL.
  expandVideoUrl: z.string().trim().max(500).optional(),
});

export const updateSiteSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }): Promise<SiteSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let incoming: Record<string, unknown> = { ...data };
    if (data.expandVideoUrl === undefined) {
      // Preserve any key this payload didn't carry (a partial save must never wipe a stored value).
      const { data: cur } = await (supabaseAdmin.from("site_settings" as never) as any).select("settings").eq("id", 1).maybeSingle();
      incoming = { ...incoming, expandVideoUrl: mergeSettings(cur?.settings).expandVideoUrl };
    }
    const clean = mergeSettings(incoming);
    const { error } = await (supabaseAdmin.from("site_settings" as never) as any)
      .upsert({ id: 1, settings: clean, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return clean;
  });
