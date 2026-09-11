// CAPTIONS ARE RETIRED FROM THE APP (2026-09-12). Lee, asked whether to drop burned-in captions
// now that his videos are under a minute: "Yes remove. And ensure that we're making more use of
// that space now."
//
// So no slide reserves a caption rail, the film chrome has no caption readout, and posting has no
// burn step. The OFFLINE path is deliberately untouched: lib/captions.ts still writes .ass/.srt
// with its own band geometry (no longer imported from the slide layout), scripts/captions.ts is
// still the CLI, and the panel still offers the .srt — a caption track costs no frame space.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..");
function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
}

describe("captions are retired from the app", () => {
  test("the slide layout reserves nothing: no rail, no survibes box, no readout type", () => {
    const src = read("src/components/blastoff/layout.ts");
    for (const gone of ["CAPTION_RAIL", "SURVIBES_RAIL", "captionRailRect", "captionRailClear", "RailStatus"]) {
      expect(src).not.toContain(gone);
    }
    expect(src).toContain("CONTENT_BOTTOM");
  });

  test("the phone draws no caption guide and the film chrome has no caption readout", () => {
    const phone = read("src/components/blastoff/PhoneFrame.tsx");
    expect(phone).not.toContain("captionRail");
    expect(phone).not.toContain("onRailStatus");
    expect(phone).not.toContain(">captions<");
    const capture = read("src/components/blastoff/BlastOffCapture.tsx");
    expect(capture).not.toContain("railStatus");
    expect(capture).not.toContain("captions clear");
  });

  test("posting has no burn step, and the in-app burn is gone with it", () => {
    const post = read("src/components/v3/PostProduction.tsx");
    for (const gone of ["burnCaptions", "Burn the captions", "capSkipped", "burnedName"]) {
      expect(post).not.toContain(gone);
    }
    const burn = read("src/components/v3/take-burn.ts");
    expect(burn).not.toContain("runBurn");
    expect(burn).not.toContain("uploadAss");
    // the upload path this file exists for is untouched
    expect(burn).toContain("export function uploadTake");
    expect(burn).toContain("export function uploadCover");
  });

  test("the .srt still comes off a transcript, and the offline CLI still has its own geometry", () => {
    expect(read("src/components/v3/PostProduction.tsx")).toContain("srtName(");
    const captions = read("src/lib/captions.ts");
    expect(captions).toContain("CAPTION_BAND");
    // It may still SAY where the band used to live; it must no longer import it.
    expect(captions).not.toContain('from "../components/blastoff/layout"');
    expect(read("scripts/captions.ts")).toContain("assFromCards");
  });

  test("no slide component imports caption geometry any more", () => {
    for (const f of [
      "src/components/blastoff/IllustrationLayer.tsx",
      "src/components/brand-cards/BigCallout.tsx",
      "src/components/brand-cards/SloganCard.tsx",
      "src/components/blastoff/SurvibesFrame.tsx",
    ]) {
      expect(read(f)).not.toContain("CAPTION_RAIL");
    }
  });
});
