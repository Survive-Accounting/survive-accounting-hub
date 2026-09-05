import { describe, expect, test } from "bun:test";

import { NOTEPAD_FONT_SIZES, sanitizeNotesHtml, stepFontSize } from "./notepad-format";

describe("sanitizing the notepad's saved HTML", () => {
  test("keeps the allowed tags and text untouched", () => {
    expect(sanitizeNotesHtml("<div><b>Bold</b> and <i>italic</i> and <u>underline</u>.</div>")).toBe(
      "<div><b>Bold</b> and <i>italic</i> and <u>underline</u>.</div>",
    );
    expect(sanitizeNotesHtml("Line one<br>Line two")).toBe("Line one<br>Line two");
  });
  test("keeps ONLY a numeric px font-size on a span, drops every other attribute", () => {
    expect(sanitizeNotesHtml('<span style="font-size:22px">big</span>')).toBe('<span style="font-size:22px">big</span>');
    expect(sanitizeNotesHtml('<span style="font-size:22px; color:red" onclick="evil()">big</span>')).toBe('<span style="font-size:22px">big</span>');
    expect(sanitizeNotesHtml('<span class="x">plain</span>')).toBe("<span>plain</span>");
  });
  test("strips a tag that isn't on the allowlist, keeping its text", () => {
    expect(sanitizeNotesHtml("<script>alert(1)</script>hello")).toBe("alert(1)hello");
    expect(sanitizeNotesHtml('<img src=x onerror="alert(1)">text')).toBe("text");
    expect(sanitizeNotesHtml('<a href="javascript:alert(1)">click</a>')).toBe("click");
  });
  test("real execCommand output round-trips clean", () => {
    const real = '<div>Hello <b>world</b></div><div><span style="font-size: 28px;">bigger</span></div>';
    expect(sanitizeNotesHtml(real)).toBe(sanitizeNotesHtml(sanitizeNotesHtml(real))); // idempotent
    expect(sanitizeNotesHtml(real)).toContain("<b>world</b>");
    expect(sanitizeNotesHtml(real)).toContain("font-size:28px");
  });
});

test("the font-size ladder clamps to 1..7", () => {
  expect(stepFontSize(3, 1)).toBe(4);
  expect(stepFontSize(3, -1)).toBe(2);
  expect(stepFontSize(7, 1)).toBe(7);
  expect(stepFontSize(1, -1)).toBe(1);
  expect(NOTEPAD_FONT_SIZES).toEqual([1, 2, 3, 4, 5, 6, 7]);
});
