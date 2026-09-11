// The retargeting rules, pinned: the spec's eleven events, IDs refused unless well-formed, no tag
// on any internal page or admin device, and nothing personal in anything sent.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SA_EVENTS } from "./analytics";
import {
  AD_EVENTS, ADMIN_UNLOCK_STORAGE_KEY, anyTag, cleanParams, deviceSuppression, FROM_PRODUCT_EVENT, isInternalPath, pageSuppression,
  parseTagConfig, PLATFORM_EVENT, productParams, TAG_ENV, TEST_SESSION_STORAGE_KEY, urlHasPii,
} from "./retargeting-core";
import { TEST_SESSION_KEY } from "./test-mode";

const ROOT = resolve(import.meta.dir, "../..");

describe("the spec", () => {
  test("exactly the eleven funnel events, each named on every platform", () => {
    expect([...AD_EVENTS]).toEqual([
      "chapter_page_view", "gate_view", "gate_submit", "sponsorship_interest", "share_view", "share_copied",
      "claim_start", "claim_complete", "video_start", "path_complete", "exam2_lock",
    ]);
    const META_STANDARD = new Set(["ViewContent", "Lead", "Contact", "CompleteRegistration"]);
    for (const e of AD_EVENTS) {
      const m = PLATFORM_EVENT[e];
      expect(m.google).toBe(e);
      if ("standard" in m.meta) expect(META_STANDARD.has(m.meta.standard)).toBe(true);
      expect(m.tiktok.length).toBeGreaterThan(0);
    }
  });

  test("forwarded product events are real product events and real funnel events", () => {
    for (const [from, to] of Object.entries(FROM_PRODUCT_EVENT)) {
      expect((SA_EVENTS as readonly string[]).includes(from)).toBe(true);
      expect((AD_EVENTS as readonly string[]).includes(to)).toBe(true);
    }
  });
});

describe("tag IDs", () => {
  test("well-formed IDs load; anything else is refused with a reason", () => {
    const { config, problems } = parseTagConfig({
      [TAG_ENV.googleAds]: " AW-123456789 ",
      [TAG_ENV.ga4]: "G-ABC123XYZ9",
      [TAG_ENV.meta]: "1234567890123456",
      [TAG_ENV.tiktok]: "CXXXXXXXXXXXXXXXXXXX",
    });
    expect(config).toEqual({ googleAds: "AW-123456789", ga4: "G-ABC123XYZ9", meta: "1234567890123456", tiktok: "CXXXXXXXXXXXXXXXXXXX" });
    expect(problems).toEqual([]);

    const bad = parseTagConfig({ [TAG_ENV.googleAds]: "123456789", [TAG_ENV.meta]: "'); alert(1); //", [TAG_ENV.tiktok]: "" });
    expect(bad.config).toEqual({ googleAds: null, ga4: null, meta: null, tiktok: null });
    expect(bad.problems).toHaveLength(2);
    expect(anyTag(bad.config)).toBe(false);
  });
});

describe("nothing fires where it mustn't", () => {
  test("internal pages", () => {
    for (const p of ["/admin", "/admin/growth", "/v3", "/v3/post", "/branding/thumbnails", "/outreach/orders", "/leeportal", "/study/canvas", "/api/og/x/y"]) {
      expect(isInternalPath(p)).toBe(true);
    }
    for (const p of ["/", "/learn", "/learn/ole-miss/alpha-tau-omega", "/go/university-of-mississippi/alpha-tau-omega", "/s/ole-miss", "/privacy", "/administrator", "/v30"]) {
      expect(isInternalPath(p)).toBe(false);
    }
  });

  test("every page behind AdminGate is an internal page", () => {
    const dir = resolve(ROOT, "src/routes");
    const leaks = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && readFileSync(resolve(dir, f), "utf8").includes("<AdminGate"))
      .map((f) => `/${f.replace(/\.tsx$/, "").split(".")[0].replace(/_$/, "")}`)
      .filter((path) => !isInternalPath(path));
    expect(leaks).toEqual([]);
  });

  test("the test-session key is test-mode's own", () => {
    expect(TEST_SESSION_STORAGE_KEY).toBe(TEST_SESSION_KEY);
  });

  test("the admin-device key is AdminGate's own", () => {
    expect(readFileSync(resolve(ROOT, "src/components/AdminGate.tsx"), "utf8")).toContain(`const STORAGE_KEY = "${ADMIN_UNLOCK_STORAGE_KEY}"`);
  });

  test("admin devices, test sessions, Global Privacy Control and the opt-out load nothing", () => {
    const base = { adminUnlocked: false, testSession: false, gpc: false, optedOut: false, search: "" };
    expect(deviceSuppression(base)).toBeNull();
    expect(deviceSuppression({ ...base, adminUnlocked: true })).toBe("admin-device");
    expect(deviceSuppression({ ...base, testSession: true })).toBe("test-session");
    expect(deviceSuppression({ ...base, search: "?feedback=1&testmode=1" })).toBe("test-session");
    expect(deviceSuppression({ ...base, search: "?test=B" })).toBe("test-session");
    expect(deviceSuppression({ ...base, gpc: true })).toBe("global-privacy-control");
    expect(deviceSuppression({ ...base, optedOut: true })).toBe("opted-out");
  });

  test("a page whose address carries anything personal is never reported", () => {
    expect(urlHasPii("?email=lee%40surviveaccounting.com")).toBe(true);
    expect(urlHasPii("?to=someone@school.edu")).toBe(true);
    expect(urlHasPii("?phone=(601)%20555-1234")).toBe(true);
    expect(urlHasPii("?ref=30dd76fa-6908-407a-b8d4-dcd75a9cfd47&utm_source=instagram&utm_campaign=launch")).toBe(false);
    expect(pageSuppression("/learn", "?email=a@b.co")).toBe("personal-data-in-url");
    expect(pageSuppression("/learn", "?utm_source=tiktok")).toBeNull();
  });
});

describe("what an event may carry", () => {
  test("only campus, chapter, course, exam, mode, topic, video, source — never a person", () => {
    expect(cleanParams({
      campus: "university-of-mississippi", chapter: "alpha-tau-omega", exam: 2, mode: "cram",
      email: "a@b.co", name: "Jordan", phone: "6015551234", campus_id: "x",
    })).toEqual({ campus: "university-of-mississippi", chapter: "alpha-tau-omega", exam: 2, mode: "cram" });
    expect(cleanParams({ campus: "someone@school.edu", chapter: "601-555-1234", source: "x".repeat(81) })).toEqual({});
    expect(cleanParams(undefined)).toEqual({});
  });

  test("product properties translate to the ad vocabulary", () => {
    expect(productParams({ campus_id: "c-1", chapter_slug: "ato", exam: "exam_1", email: "a@b.co" }))
      .toEqual({ campus: "c-1", chapter: "ato", course: undefined, exam: "exam_1", mode: undefined, source: undefined });
  });
});
