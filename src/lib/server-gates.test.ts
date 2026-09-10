// SERVER GATES (P7, 2026-09-09) — every server function in the post-production trio opens
// with assertAdmin. The audit found these three files with a gate count of zero: signed
// uploads into canvas-media, Whisper billing and Fly render jobs, all callable by anyone who
// found the URL. A source pin in the takes-inbox style — it reads the files and refuses a
// handler without the gate, so the NEXT server fn added here cannot quietly ship open.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { isPublicUploadFolder } from "./publish.functions";

/** CRLF-normalised — the house rule for source-reading tests, so line endings can never
 *  change what this test sees. */
function readSrc(name: string): string {
  return readFileSync(join(import.meta.dir, name), "utf8").split("\r\n").join("\n");
}

/** The two lines, verbatim from publish-queue.functions.ts — the shape every gate copies. The
 *  dynamic import matters: @tanstack/react-start/server may only be touched inside a handler. */
const GATE_IMPORT = 'const { assertAdmin } = await import("@/lib/admin-session.functions");';
const GATE_CALL = "await assertAdmin();";

/** Each `export const NAME = createServerFn(` up to the next one (or EOF): the validator, the
 *  handler, and the handler's whole body. */
function serverFnBlocks(src: string): { name: string; block: string }[] {
  const starts = [...src.matchAll(/^export const ([A-Za-z0-9_]+) = createServerFn\(/gm)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  return starts.map((s, i) => ({ name: s.name, block: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}

/** Everything from `.handler(` on — where the gate must live. A mention in a doc comment
 *  above the fn does not count. */
function handlerBody(block: string): string {
  const h = block.indexOf(".handler(");
  expect(h).toBeGreaterThan(-1);
  return block.slice(h);
}

/** The non-comment lines between the handler's opening brace and the gate import. Empty
 *  means the gate is the first STATEMENT — nothing spends money or touches storage before it. */
function statementsBeforeGate(body: string): string[] {
  const open = body.indexOf("=> {");
  const gate = body.indexOf(GATE_IMPORT);
  expect(open).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(open);
  return body.slice(open + 4, gate).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

/** The fns each file is known to export — pinned so an empty scan (a renamed helper, a
 *  regex that stopped matching) fails instead of passing vacuously — and the ones that are
 *  open ON PURPOSE, each with its reason in the source. */
const FILES: Record<string, { fns: string[]; open: string[] }> = {
  "publish.functions.ts": {
    fns: [
      "publishLesson", "resolveLessonPublish", "previewLesson", "resolvePreview",
      "createPipelineTestStagingUpload", "startPipelineTestAuphonic", "resolvePipelineTestAuphonic",
      "detectAuphonicSlots", "startCeqConcat", "resolveCeqConcat", "listLessonVideos", "listPublishedByLabel",
    ],
    // /study/dashboard is a student surface with no auth; a READY playback id is public already.
    open: ["listPublishedByLabel"],
  },
  "render-worker.functions.ts": {
    fns: ["workerPreflight", "startWorkerRender", "startDissectStitch", "startCaptionBurn", "resolveWorkerRender"],
    open: [],
  },
  "transcribe.functions.ts": {
    fns: ["getTranscript", "transcribeTake"],
    open: [],
  },
};

describe("the gate shape is the one publish-queue uses (copied verbatim)", () => {
  test("publish-queue.functions.ts still carries the reference lines", () => {
    const ref = readSrc("publish-queue.functions.ts");
    expect(ref).toContain(GATE_IMPORT);
    expect(ref).toContain(GATE_CALL);
  });
});

for (const [file, { fns, open }] of Object.entries(FILES)) {
  describe(`${file}: every server fn is gated`, () => {
    const src = readSrc(file);
    const blocks = serverFnBlocks(src);

    test("the scan sees the fns we know are there (an empty scan must not pass)", () => {
      expect(blocks.map((b) => b.name)).toEqual(fns);
    });

    for (const { name, block } of blocks) {
      if (open.includes(name)) continue;
      test(`${name} opens with assertAdmin`, () => {
        const body = handlerBody(block);
        expect(body).toContain(GATE_IMPORT);
        expect(body).toContain(GATE_CALL);
        expect(body.indexOf(GATE_CALL)).toBeGreaterThan(body.indexOf(GATE_IMPORT));
        if (name === "createPipelineTestStagingUpload") {
          // THE ONE DOOR: the folder is read first so the applicant folders can skip the gate
          // (components/ideas/upload.ts feeds /careers and /rep/onboarding through this fn) —
          // and nothing else happens before it.
          expect(statementsBeforeGate(body)).toEqual([
            'const folder = (data.folder ?? "pipeline-test").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "pipeline-test";',
            "if (!isPublicUploadFolder(folder)) {",
          ]);
        } else {
          expect(statementsBeforeGate(body)).toEqual([]);
        }
      });
    }

    for (const name of open) {
      test(`${name} is the documented exception — a student read, open on purpose`, () => {
        const b = blocks.find((x) => x.name === name);
        expect(b).toBeDefined();
        // the reason lives in the doc comment directly above the fn (a block starts at
        // `export const`, so the comment is just before it, not inside it)
        expect(src).toMatch(new RegExp(`DELIBERATELY UNGATED[\\s\\S]{0,600}\\nexport const ${name} = createServerFn\\(`));
        expect(handlerBody(b!.block)).not.toContain("assertAdmin");
        // and it really is only a read: nothing in the block writes storage or spends money
        expect(b!.block).not.toMatch(/muxApi\(|auphonic\(|\.storage\.|supabaseAdmin|\.insert\(|\.update\(|\.upsert\(/);
      });
    }
  });
}

describe("the upload door: which folders an anonymous caller may write", () => {
  test("exactly the three public-form folders components/ideas/upload.ts names", () => {
    expect(isPublicUploadFolder("job-applications")).toBe(true);
    expect(isPublicUploadFolder("rep-resumes")).toBe(true);
    expect(isPublicUploadFolder("rep-dm-screenshots")).toBe(true);
  });
  test("Lee's folders need Lee", () => {
    for (const f of ["pipeline-test", "idea-attachments", "idea-audio", "illustration-references", "blastoff-takes", "canvas", ""]) {
      expect(isPublicUploadFolder(f)).toBe(false);
    }
  });
  test("exact match — no prefix, suffix or case tricks past the sanitiser", () => {
    // the sanitiser strips to [a-z0-9-] but KEEPS case, so each of these reaches the check as-is
    for (const f of ["job-applications2", "Job-Applications", "rep-resumes-old", "xjob-applications", "JOB-APPLICATIONS", "rep-dm-screenshots-"]) {
      expect(isPublicUploadFolder(f)).toBe(false);
    }
  });
  test("upload.ts still sends those folder names — the door and its callers agree", () => {
    const up = readFileSync(join(import.meta.dir, "..", "components", "ideas", "upload.ts"), "utf8");
    for (const f of ["job-applications", "rep-resumes", "rep-dm-screenshots"]) expect(up).toContain(`"${f}"`);
  });
});

describe("transcribeTake: the gate wraps a core the webhooks can still call", () => {
  test("the server fn gates then delegates; the core is a plain exported function, never a server fn", () => {
    const src = readSrc("transcribe.functions.ts");
    expect(src).toContain("return transcribeTakeCore(data);");
    expect(src).toContain("export async function transcribeTakeCore(");
    // a createServerFn wrapper around the core would hand the open door a URL again
    expect(src).not.toMatch(/transcribeTakeCore\s*=\s*createServerFn/);
  });
});
