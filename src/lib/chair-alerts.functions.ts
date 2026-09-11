// CHAIR CLICK ALERTS (2026-09-11) — Lee: "If a link is clicked by a council scholarship chair,
// tell me via email … Same for if a chapter scholarship chair clicks one … Only on the first
// click. Provide their first name, campus name, council or chapter name, clicked share link."
//
// "Clicked" here is the chair doing something with their page: copying the share link, copying
// the GroupMe post, or taking the flyer or slide. The FIRST such action per chapter or council
// emails Lee; every action is logged (expand_events) so the DM console's numbers keep counting.
//
// WHO THEY ARE comes from the ?ref= on the DM link (the contact's uuid on growth_contact_qc),
// which the page cookies on arrival — so the email can say "Luke (Scholarship/Academic Chair)"
// rather than "someone". Without a ref it says someone.
//
// LAW: ships to the client bundle — service-role client imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const CHAIR_ACTIONS = ["copy_link", "copy_groupme", "flyer", "slide", "open_learn"] as const;
export type ChairAction = (typeof CHAIR_ACTIONS)[number];

const ACTION_LABEL: Record<ChairAction, string> = {
  copy_link: "copied the share link",
  copy_groupme: "copied the GroupMe post",
  flyer: "opened the flyer",
  slide: "downloaded the meeting slide",
  open_learn: "opened the members' page",
};

/** The event string prefix per page, so "first ever" is one prefix match. */
const prefixOf = (kind: "chapter" | "council", schoolSlug: string, slug: string) =>
  kind === "council" ? `greek_chair:${schoolSlug}/council:${slug}` : `greek_chair:${schoolSlug}/${slug}`;

export const notifyChairAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(["chapter", "council"]),
    schoolSlug: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(80),
    name: z.string().trim().max(160),
    action: z.enum(CHAIR_ACTIONS),
    ref: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; first: boolean }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as { from: (t: string) => any };
      const prefix = prefixOf(data.kind, data.schoolSlug, data.slug);
      // Share actions only count for "first" — looking at the members' page is not spreading it.
      const shareAction = data.action !== "open_learn";
      const { count } = shareAction
        ? await db.from("expand_events").select("id", { count: "exact", head: true }).like("event", `${prefix}#%`)
        : { count: 1 };
      await db.from("expand_events").insert({ event: `${prefix}#${data.action}${data.ref ? `?ref=${data.ref}` : ""}` });
      const first = shareAction && (count ?? 0) === 0;
      if (!first) return { ok: true, first: false };

      // Who: the DM contact behind the ref, when there is one.
      let who = "Someone";
      let title = "";
      if (data.ref) {
        const { data: c } = await db.from("growth_contact_qc").select("first_name,full_name,name,exec_title,role,org_name").eq("id", data.ref).maybeSingle();
        const first_ = (c?.first_name as string | null) || String((c?.full_name ?? c?.name ?? "") as string).trim().split(/\s+/)[0] || "";
        if (first_) who = first_;
        title = ((c?.exec_title ?? c?.role ?? "") as string).trim();
      }
      const { schoolBySlug } = await import("@/lib/schools");
      const campus = schoolBySlug(data.schoolSlug)?.name ?? data.schoolSlug;
      const what = ACTION_LABEL[data.action];
      const pageUrl = `https://surviveaccounting.com/go/${data.schoolSlug}/${data.kind === "council" ? `council/${data.slug}` : data.slug}`;
      const line = `${who}${title ? ` (${title})` : ""} · ${campus} · ${data.name} ${what}.`;
      const { FOUNDER_EMAIL } = await import("@/lib/comms/send.server");
      const { sendResendEmail } = await import("@/lib/email.server");
      await sendResendEmail({
        to: process.env.CHAIR_ALERT_EMAIL || FOUNDER_EMAIL,
        subject: `${data.kind === "council" ? "Council" : "Chapter"} chair click — ${data.name} · ${campus}`,
        text: `${line}\n\nFirst share action on this ${data.kind}'s page.\n${pageUrl}`,
        html: `<p style="font-size:15px;"><b>${esc(who)}</b>${title ? ` (${esc(title)})` : ""} · ${esc(campus)} · <b>${esc(data.name)}</b> ${esc(what)}.</p><p style="color:#666;">First share action on this ${data.kind}'s page. <a href="${pageUrl}">${pageUrl}</a></p>`,
      }).catch(() => undefined);
      return { ok: true, first: true };
    } catch (e) {
      console.warn("notifyChairAction failed:", (e as Error).message);
      return { ok: false, first: false };
    }
  });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
