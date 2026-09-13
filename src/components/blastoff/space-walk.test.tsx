// SPACE WALK (2026-09-13, plan.ts `walk`) — pinned: lines are marked only on a walking slide, one
// per Shift+Enter line and one per bullet, and /film hides the ones not reached yet.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BigCallout } from "@/components/brand-cards/BigCallout";
import { WalkLinesContext, renderInlineLines } from "@/components/canvas/inline-md";

const NL = String.fromCharCode(10);
const marks = (html: string) => (html.match(/data-sa-walk=""/g) ?? []).length;

describe("space walk", () => {
  test("off: the text renders as before, nothing marked", () => {
    expect(marks(renderToStaticMarkup(<>{renderInlineLines(`Own it${NL}==Asset==`, undefined, false)}</>))).toBe(0);
  });

  test("on: one mark per line, markers still render inside a line", () => {
    const html = renderToStaticMarkup(<>{renderInlineLines(`Own it${NL}==Asset==${NL}Owe it`, undefined, true)}</>);
    expect(marks(html)).toBe(3);
    expect(html).not.toContain("==");
  });

  test("a big callout marks each heading line and each line under it", () => {
    const html = renderToStaticMarkup(
      <WalkLinesContext.Provider value={true}>
        <BigCallout w={306} h={544} label="CHEAT CODE" accent="#FCA311" text={`Paid early${NL}= an asset`} bullets={["Prepaid rent", "Prepaid insurance"]} live={false} />
      </WalkLinesContext.Provider>,
    );
    expect(marks(html)).toBe(4);
  });

  test("/film counts the lines off the slide, hides the unreached ones, and ` starts over", () => {
    const capture = readFileSync(join(import.meta.dir, "BlastOffCapture.tsx"), "utf8");
    expect(capture).toContain("walkOn ? walkCount + 1 : 0");                 // step 0 = the chip alone
    expect(capture).toContain('querySelectorAll<HTMLElement>("[data-sa-walk]")');
    expect(capture).toContain(".film-mode [data-sa-walk-off] { opacity: 0 !important; animation: none !important; }");
    expect(capture).toContain("@keyframes sa-walk-in");
    expect(capture).toContain("if (walkOn) setShot(() => 0);");
    const phone = readFileSync(join(import.meta.dir, "PhoneFrame.tsx"), "utf8");
    expect(phone).toContain("<WalkLinesContext.Provider value={!!frame.walk}>");
  });
});
