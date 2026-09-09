import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderInline } from "./inline-md";

const html = (s: string) => renderToStaticMarkup(<>{renderInline(s)}</>);

// The markers Lee types while editing. Display-only: the editor shows the raw text, the slide
// shows the mark. Only CLOSED pairs match, so a stray marker renders literally rather than
// eating the rest of a stem.
describe("the inline markers", () => {
  test("**bold**", () => {
    expect(html("a **b** c")).toContain("<strong");
    expect(html("a **b** c")).toContain(">b</strong>");
  });

  test("==highlight==, and a lone = survives inside it", () => {
    // Accounting is full of single equals signs — "Assets = Liabilities + Equity" is exactly the
    // kind of phrase that gets marked.
    const out = html("==Assets = Liabilities + Equity==");
    expect(out).toContain("<mark");
    expect(out).toContain("Assets = Liabilities + Equity");
  });

  // Lee, 2026-09-09: "add a ~ ~ to do a strikethrough. Those are very useful in my teaching."
  test("~~strikethrough~~", () => {
    expect(html("the ~~wrong~~ way")).toContain("<s ");
    expect(html("the ~~wrong~~ way")).toContain(">wrong</s>");
  });

  // Lee writes it as "a ~ ~" and types one tilde, so both forms strike.
  test("~single~ strikes too", () => {
    expect(html("the ~wrong~ way")).toContain("<s ");
    expect(html("the ~wrong~ way")).toContain(">wrong</s>");
  });
  test("prose with stray tildes survives — the run may not begin or end on whitespace", () => {
    expect(html("about ~5 minutes and ~10 more")).not.toContain("<s ");
    expect(html("a ~ b ~ c")).not.toContain("<s ");
    expect(html("about ~5 minutes")).toContain("~5 minutes");
  });

  test("__underline__ and a ___ blank", () => {
    expect(html("__word__")).toContain("underline");
    expect(html("fill the ____ in")).toContain('aria-label="blank"');
  });

  test("the markers combine in one string, in order", () => {
    const out = html("**Never** ~~debit~~ ==credit== it");
    expect(out.indexOf("<strong")).toBeLessThan(out.indexOf("<s "));
    expect(out.indexOf("<s ")).toBeLessThan(out.indexOf("<mark"));
  });

  test("an unclosed marker renders literally and never throws", () => {
    // Nothing is consumed and nothing is marked up — the string comes back as it went in.
    for (const s of ["**oops", "==oops", "~~oops", "__oops", "a ** b ~~ c == d"]) {
      expect(() => html(s)).not.toThrow();
      expect(html(s)).toBe(s);
    }
    expect(html("")).toBe("");
  });
});
