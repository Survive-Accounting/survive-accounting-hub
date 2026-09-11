// Server function wrapper for the daily pulse. Keeps the heavy server-only module
// (daily-pulse.server) reachable only through a createServerFn, so it is stripped from the
// client bundle. The cron route delegates here; an admin can also call it with dryRun.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const runDailyPulseNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { sendDailyPulse } = await import("@/lib/daily-pulse.server");
    return sendDailyPulse({ dryRun: data.dryRun });
  });
