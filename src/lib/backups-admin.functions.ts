// Admin server functions for /outreach/backups. Client-safe module: it defines
// createServerFn endpoints and dynamically imports the server-only backup
// modules inside handlers (never at top level).
//
// SECURITY NOTE: like the rest of /outreach, these are gated only by the
// client-side AdminGate passcode — there is no server-side auth. `runBackupNow`
// runs the job in-process (no cron secret needed), matching the existing model.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  BACKUP_GROUPS,
  BACKUP_GROUP_ORDER,
  BACKUP_ROOT,
  UNRESOLVED_REQUESTS,
  type BackupGroup,
} from "./backup-tables";

export interface BackupListItem {
  group: BackupGroup;
  date: string; // YYYYMMDD
  zipKey: string;
  totalRows: number;
  tableCount: number;
  zipBytes: number;
  generatedAt: string;
}

export interface GroupListing {
  group: BackupGroup;
  label: string;
  description: string;
  daily: BackupListItem[];
  monthlyCount: number;
  annualCount: number;
}

export interface ListBackupsResult {
  configured: boolean;
  storeKind: "r2" | "local" | null;
  groups: GroupListing[];
  unresolved: typeof UNRESOLVED_REQUESTS;
  error?: string;
}

/** List the latest N daily backups per group, with row counts from the sidecar manifests. */
export const listBackups = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ perGroup: z.number().int().min(1).max(60).default(10) }).parse(d ?? {}))
  .handler(async ({ data }): Promise<ListBackupsResult> => {
    const { hasR2Env } = await import("./backup-store.server");
    if (!hasR2Env()) {
      return {
        configured: false,
        storeKind: null,
        groups: BACKUP_GROUP_ORDER.map((g) => ({
          group: g,
          label: BACKUP_GROUPS[g].label,
          description: BACKUP_GROUPS[g].description,
          daily: [],
          monthlyCount: 0,
          annualCount: 0,
        })),
        unresolved: UNRESOLVED_REQUESTS,
      };
    }

    const { getBackupStore } = await import("./backup-store.server");
    const store = getBackupStore();
    const groups: GroupListing[] = [];

    for (const group of BACKUP_GROUP_ORDER) {
      const objs = await store.list(`${BACKUP_ROOT}/${group}/`);
      const dailyManifests = objs
        .filter(
          (o) =>
            o.key.endsWith(".manifest.json") &&
            !o.key.includes(`/${group}/monthly/`) &&
            !o.key.includes(`/${group}/annual/`),
        )
        .sort((a, b) => b.key.localeCompare(a.key)) // date-partitioned path → lexical desc = newest first
        .slice(0, data.perGroup);

      const daily: BackupListItem[] = [];
      for (const m of dailyManifests) {
        try {
          const raw = await store.get(m.key);
          const man = JSON.parse(raw.toString("utf8"));
          daily.push({
            group,
            date: String(man.date ?? ""),
            zipKey: m.key.replace(/\.manifest\.json$/, ".zip"),
            totalRows: Number(man.totalRows ?? 0),
            tableCount: Number(man.tableCount ?? 0),
            zipBytes: Number(man.zipBytes ?? 0),
            generatedAt: String(man.generatedAt ?? ""),
          });
        } catch {
          /* skip unreadable manifest */
        }
      }

      const monthlyCount = objs.filter((o) => o.key.includes(`/${group}/monthly/`) && o.key.endsWith(".zip")).length;
      const annualCount = objs.filter((o) => o.key.includes(`/${group}/annual/`) && o.key.endsWith(".zip")).length;

      groups.push({
        group,
        label: BACKUP_GROUPS[group].label,
        description: BACKUP_GROUPS[group].description,
        daily,
        monthlyCount,
        annualCount,
      });
    }

    return { configured: true, storeKind: store.kind, groups, unresolved: UNRESOLVED_REQUESTS };
  });

/** Presigned R2 download URL, 15-minute TTL. Rejects keys outside the backups prefix. */
export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(1).max(300) }).parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    if (!data.key.startsWith(`${BACKUP_ROOT}/`) || data.key.includes("..")) {
      throw new Error("Invalid backup key");
    }
    const { getBackupStore } = await import("./backup-store.server");
    const store = getBackupStore();
    const url = await store.presignGet(data.key, 15 * 60);
    return { url };
  });

/** Fire the same nightly job manually. Returns the run summary. */
export const runBackupNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ groups: z.array(z.enum(["content", "intel", "commerce"])).min(1).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { runBackup } = await import("./backup.server");
    return runBackup({ groups: data.groups as BackupGroup[] | undefined });
  });
