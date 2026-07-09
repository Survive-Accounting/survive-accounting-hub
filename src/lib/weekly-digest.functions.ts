// Server function wrapper for the weekly digest. Keeps the heavy server-only
// module (weekly-digest.server) reachable only through a createServerFn, so it's
// stripped from the client bundle. The cron route delegates here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const runWeeklyDigestNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { sendWeeklyDigest } = await import("@/lib/weekly-digest.server");
    return sendWeeklyDigest({ dryRun: data.dryRun });
  });
