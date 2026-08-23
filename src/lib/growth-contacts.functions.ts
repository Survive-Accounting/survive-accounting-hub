// Growth Admin — contacts (people) with dated role history.
// Backed by growth_contacts (the person) + growth_contact_roles (the relationship
// over time). Degrades gracefully to a "storage not provisioned" signal until the
// 20260823_1200_growth_admin_contacts_outreach migration is applied.
//
// LAW: dynamic-import the service-role client inside each handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (typeof e.message === "string" && /does not exist|could not find the table/i.test(e.message))
  );
}

export interface ContactRole {
  id: string;
  entityType: "campus" | "chapter" | "council" | "org";
  entityId: string | null;
  campusId: string | null;
  councilSlug: string | null;
  entityLabel: string; // resolved human label
  role: string | null;
  startTerm: string | null;
  endTerm: string | null;
  isCurrent: boolean;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  title: string | null;
  notes: string | null;
  source: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  roles: ContactRole[];
}

export interface ContactListResult {
  storageReady: boolean;
  rows: Contact[];
  total: number;
  page: number;
  pageSize: number;
}

const entityType = z.enum(["campus", "chapter", "council", "org"]);

// ---- label resolution --------------------------------------------------------
async function labelResolvers(
  db: DB,
  roles: {
    entityType: string;
    entityId: string | null;
    campusId: string | null;
    councilSlug: string | null;
  }[],
) {
  const campusIds = new Set<string>();
  const chapterIds = new Set<string>();
  const orgIds = new Set<string>();
  for (const r of roles) {
    if (r.campusId) campusIds.add(r.campusId);
    if (r.entityType === "campus" && r.entityId) campusIds.add(r.entityId);
    if (r.entityType === "chapter" && r.entityId) chapterIds.add(r.entityId);
    if (r.entityType === "org" && r.entityId) orgIds.add(r.entityId);
  }
  const campusName = new Map<string, string>();
  const chapterName = new Map<string, string>();
  const orgName = new Map<string, string>();
  if (campusIds.size) {
    const { data } = await db
      .from("campuses")
      .select("id,name,institution_name")
      .in("id", [...campusIds]);
    for (const c of (data ?? []) as any[])
      campusName.set(c.id, c.institution_name || c.name || "Campus");
  }
  if (chapterIds.size) {
    const { data } = await db
      .from("campus_greek_chapters")
      .select("id,nickname,chapter_designation,letters")
      .in("id", [...chapterIds]);
    for (const c of (data ?? []) as any[])
      chapterName.set(c.id, c.nickname || c.chapter_designation || c.letters || "Chapter");
  }
  if (orgIds.size) {
    const { data } = await db
      .from("greek_orgs")
      .select("id,name,nickname")
      .in("id", [...orgIds]);
    for (const o of (data ?? []) as any[]) orgName.set(o.id, o.nickname || o.name);
  }
  return { campusName, chapterName, orgName };
}

function labelFor(
  r: any,
  res: {
    campusName: Map<string, string>;
    chapterName: Map<string, string>;
    orgName: Map<string, string>;
  },
): string {
  if (r.entity_type === "campus") return res.campusName.get(r.entity_id) ?? "Campus";
  if (r.entity_type === "chapter") return res.chapterName.get(r.entity_id) ?? "Chapter";
  if (r.entity_type === "org") return res.orgName.get(r.entity_id) ?? "National org";
  if (r.entity_type === "council") {
    const c = res.campusName.get(r.campus_id) ?? "Campus";
    return `${(r.council_slug ?? "council").toUpperCase()} · ${c}`;
  }
  return "—";
}

// ---- list --------------------------------------------------------------------
export const listGrowthContacts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().optional(),
        entityType: entityType.optional(),
        entityId: z.string().uuid().optional(),
        campusId: z.string().uuid().optional(),
        currentOnly: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ContactListResult> => {
    const db = await admin();

    // Pull roles first (so we can scope by entity), then their contacts.
    let roleQ = db.from("growth_contact_roles").select("*");
    if (data.entityType) roleQ = roleQ.eq("entity_type", data.entityType);
    if (data.entityId) roleQ = roleQ.eq("entity_id", data.entityId);
    if (data.campusId) roleQ = roleQ.eq("campus_id", data.campusId);
    if (data.currentOnly) roleQ = roleQ.eq("is_current", true);
    const { data: roleData, error: roleErr } = await roleQ;
    if (roleErr && isMissingTable(roleErr))
      return { storageReady: false, rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    if (roleErr) throw roleErr;

    const scoped = !!(data.entityType || data.entityId || data.campusId || data.currentOnly);
    let contactQ = db.from("growth_contacts").select("*");
    if (scoped) {
      const ids = [...new Set((roleData ?? []).map((r: any) => r.contact_id))];
      if (!ids.length)
        return { storageReady: true, rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      contactQ = contactQ.in("id", ids);
    }
    const { data: contactData, error: cErr } = await contactQ;
    if (cErr && isMissingTable(cErr))
      return { storageReady: false, rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    if (cErr) throw cErr;

    // roles grouped by contact (fetch all roles for the resolved contacts)
    const contactIds = new Set((contactData ?? []).map((c: any) => c.id));
    let allRoles = (roleData ?? []) as any[];
    if (!scoped) {
      const { data: everyRole } = await db.from("growth_contact_roles").select("*");
      allRoles = (everyRole ?? []) as any[];
    }
    allRoles = allRoles.filter((r) => contactIds.has(r.contact_id));
    const res = await labelResolvers(
      db,
      allRoles.map((r) => ({
        entityType: r.entity_type,
        entityId: r.entity_id,
        campusId: r.campus_id,
        councilSlug: r.council_slug,
      })),
    );
    const rolesByContact = new Map<string, ContactRole[]>();
    for (const r of allRoles) {
      const list = rolesByContact.get(r.contact_id) ?? [];
      list.push({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        campusId: r.campus_id,
        councilSlug: r.council_slug,
        entityLabel: labelFor(r, res),
        role: r.role,
        startTerm: r.start_term,
        endTerm: r.end_term,
        isCurrent: !!r.is_current,
        source: r.source,
        sourceUrl: r.source_url,
        notes: r.notes,
      });
      rolesByContact.set(r.contact_id, list);
    }

    let rows: Contact[] = (contactData ?? []).map((c: any) => ({
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phone: c.phone,
      instagram: c.instagram,
      title: c.title,
      notes: c.notes,
      source: c.source,
      sourceUrl: c.source_url,
      lastVerifiedAt: c.last_verified_at,
      createdBy: c.created_by,
      createdAt: c.created_at,
      roles: (rolesByContact.get(c.id) ?? []).sort(
        (a, b) => Number(b.isCurrent) - Number(a.isCurrent),
      ),
    }));

    const q = (data.q ?? "").toLowerCase().trim();
    if (q)
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.instagram ?? "").toLowerCase().includes(q) ||
          r.roles.some(
            (role) =>
              (role.role ?? "").toLowerCase().includes(q) ||
              role.entityLabel.toLowerCase().includes(q),
          ),
      );

    rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
    const total = rows.length;
    const start = (data.page - 1) * data.pageSize;
    return {
      storageReady: true,
      rows: rows.slice(start, start + data.pageSize),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ---- single contact ----------------------------------------------------------
export const getGrowthContact = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ storageReady: boolean; contact: Contact | null }> => {
    const db = await admin();
    const { data: c, error } = await db
      .from("growth_contacts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error && isMissingTable(error)) return { storageReady: false, contact: null };
    if (error) throw error;
    if (!c) return { storageReady: true, contact: null };
    const { data: roleData } = await db
      .from("growth_contact_roles")
      .select("*")
      .eq("contact_id", data.id);
    const rawRoles = (roleData ?? []) as any[];
    const res = await labelResolvers(
      db,
      rawRoles.map((r) => ({
        entityType: r.entity_type,
        entityId: r.entity_id,
        campusId: r.campus_id,
        councilSlug: r.council_slug,
      })),
    );
    const roles: ContactRole[] = rawRoles
      .map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        campusId: r.campus_id,
        councilSlug: r.council_slug,
        entityLabel: labelFor(r, res),
        role: r.role,
        startTerm: r.start_term,
        endTerm: r.end_term,
        isCurrent: !!r.is_current,
        source: r.source,
        sourceUrl: r.source_url,
        notes: r.notes,
      }))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
    return {
      storageReady: true,
      contact: {
        id: c.id,
        fullName: c.full_name,
        email: c.email,
        phone: c.phone,
        instagram: c.instagram,
        title: c.title,
        notes: c.notes,
        source: c.source,
        sourceUrl: c.source_url,
        lastVerifiedAt: c.last_verified_at,
        createdBy: c.created_by,
        createdAt: c.created_at,
        roles,
      },
    };
  });

// ---- upsert contact ----------------------------------------------------------
export const upsertGrowthContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        fullName: z.string().trim().min(1).max(160),
        email: z.string().trim().max(200).optional().nullable(),
        phone: z.string().trim().max(60).optional().nullable(),
        instagram: z.string().trim().max(120).optional().nullable(),
        title: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(4000).optional().nullable(),
        source: z.string().trim().max(80).optional().nullable(),
        sourceUrl: z.string().trim().max(500).optional().nullable(),
        markVerified: z.boolean().default(false),
        who: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; id: string } | { ok: false; error: string; storageReady?: boolean }
    > => {
      const db = await admin();
      const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      const patch: Record<string, unknown> = {
        full_name: data.fullName.trim(),
        email: clean(data.email),
        phone: clean(data.phone),
        instagram: clean(data.instagram),
        title: clean(data.title),
        notes: clean(data.notes),
        source: clean(data.source) ?? "manual",
        source_url: clean(data.sourceUrl),
        updated_at: new Date().toISOString(),
      };
      if (data.markVerified) patch.last_verified_at = new Date().toISOString();

      if (data.id) {
        const { error } = await db.from("growth_contacts").update(patch).eq("id", data.id);
        if (error && isMissingTable(error))
          return { ok: false, error: "storage not provisioned", storageReady: false };
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id };
      }
      patch.created_by = data.who ?? null;
      const { data: ins, error } = await db
        .from("growth_contacts")
        .insert(patch)
        .select("id")
        .single();
      if (error && isMissingTable(error))
        return { ok: false, error: "storage not provisioned", storageReady: false };
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: ins.id as string };
    },
  );

// ---- add / update / end a role ----------------------------------------------
export const upsertContactRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        contactId: z.string().uuid(),
        entityType,
        entityId: z.string().uuid().optional().nullable(),
        campusId: z.string().uuid().optional().nullable(),
        councilSlug: z.string().trim().max(40).optional().nullable(),
        role: z.string().trim().max(120).optional().nullable(),
        startTerm: z.string().trim().max(40).optional().nullable(),
        endTerm: z.string().trim().max(40).optional().nullable(),
        isCurrent: z.boolean().default(true),
        source: z.string().trim().max(80).optional().nullable(),
        sourceUrl: z.string().trim().max(500).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
        who: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; id: string } | { ok: false; error: string; storageReady?: boolean }
    > => {
      const db = await admin();
      const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      const patch: Record<string, unknown> = {
        contact_id: data.contactId,
        entity_type: data.entityType,
        entity_id: data.entityType === "council" ? null : (data.entityId ?? null),
        campus_id: data.campusId ?? null,
        council_slug: data.entityType === "council" ? clean(data.councilSlug) : null,
        role: clean(data.role),
        start_term: clean(data.startTerm),
        end_term: clean(data.endTerm),
        is_current: data.isCurrent,
        source: clean(data.source),
        source_url: clean(data.sourceUrl),
        notes: clean(data.notes),
        updated_at: new Date().toISOString(),
      };
      if (data.id) {
        const { error } = await db.from("growth_contact_roles").update(patch).eq("id", data.id);
        if (error && isMissingTable(error))
          return { ok: false, error: "storage not provisioned", storageReady: false };
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id };
      }
      patch.created_by = data.who ?? null;
      const { data: ins, error } = await db
        .from("growth_contact_roles")
        .insert(patch)
        .select("id")
        .single();
      if (error && isMissingTable(error))
        return { ok: false, error: "storage not provisioned", storageReady: false };
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: ins.id as string };
    },
  );

export const endContactRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), endTerm: z.string().trim().max(40).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const patch: Record<string, unknown> = {
      is_current: false,
      updated_at: new Date().toISOString(),
    };
    if (data.endTerm) patch.end_term = data.endTerm.trim();
    const { error } = await db.from("growth_contact_roles").update(patch).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deleteGrowthContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const { error } = await db.from("growth_contacts").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
