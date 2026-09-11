// THE DM FOR A CONSOLE ROW (2026-09-11) — the DM console's Today list and the campus board hold
// their contacts in two older shapes (PlanEntry, IgContact). This turns either into the one
// question lib/outreach-links answers: who is this, and therefore which page and which ask.
// Pure and client-safe.
import type { IgContact } from "@/lib/growth-ig-dm.functions";
import type { PlanEntry } from "@/lib/king-dm.functions";
import { bareUrl, COUNCIL_LABEL, contactDm, firstNameOf, linkFor, shortPath, withContactRef, type LinkOrg } from "@/lib/outreach-links";

type Who = {
  contactId: string;
  /** The 12-hex contact_id → the short /l/<code> link; null → the long link with ?ref=. */
  contactCode: string | null;
  councilKey: string | null;
  orgType: string | null;
  orgName: string | null;
  firstName: string | null;
  name: string | null;
  isOrg: boolean;
  chapterSlug: string | null;
};

function orgOf(w: Who): Pick<LinkOrg, "kind" | "group" | "name" | "onSite" | "slug"> {
  const key = (w.councilKey ?? "").toLowerCase();
  const group = COUNCIL_LABEL[key] ?? (key === "fsl" ? "FSL Office" : key === "wib" ? "Campus Club" : "Other");
  const kind: LinkOrg["kind"] = w.orgType === "chapter" ? "chapter" : w.orgType === "club" ? "club" : w.orgType === "office" || key === "fsl" ? "office" : key === "wib" ? "club" : "council";
  if (kind === "chapter") return { kind, group, name: w.orgName || "your chapter", onSite: !!w.chapterSlug, slug: w.chapterSlug ?? "" };
  if (kind === "council") return { kind, group, name: `${group} council`, onSite: true, slug: COUNCIL_LABEL[key] ? key : "" };
  return { kind, group, name: w.orgName || (kind === "office" ? "Fraternity and Sorority Life Office" : "your club"), onSite: false, slug: "" };
}

export function dmForWho(w: Who, ctx: { campusLabel: string; courseCode: string | null; slug: string; campusHasChapters: boolean }): string {
  const org = orgOf(w);
  const link = w.contactCode ? shortPath(w.contactCode) : withContactRef(linkFor(ctx.slug, org, ctx.campusHasChapters).path, w.contactId);
  return contactDm({
    campusLabel: ctx.campusLabel, courseCode: ctx.courseCode, org,
    firstName: w.isOrg ? "" : (w.firstName || firstNameOf(w.name)), isOrg: w.isOrg,
    link: bareUrl(link), campusHasChapters: ctx.campusHasChapters,
  });
}

export const dmForPlanEntry = (e: PlanEntry, ctx: { campusLabel: string; courseCode: string | null; slug: string }): string =>
  dmForWho({ contactId: e.contactId, contactCode: e.contactCode, councilKey: e.councilKey, orgType: e.orgType, orgName: e.orgName, firstName: e.firstName, name: e.name, isOrg: e.isOrg, chapterSlug: e.chapterSlug }, { ...ctx, campusHasChapters: e.campusHasChapters });

export const dmForIgContact = (c: IgContact, ctx: { councilKey: string; campusLabel: string; courseCode: string | null; slug: string; campusHasChapters: boolean }): string =>
  dmForWho({ contactId: c.contactId, contactCode: c.contactCode, councilKey: ctx.councilKey, orgType: c.orgType, orgName: c.orgName, firstName: c.firstName, name: c.name, isOrg: c.isOrg, chapterSlug: c.chapterSlug }, ctx);
