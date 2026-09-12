import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { isTeased, renderInline, toggleTease, wrapTease, wrapTeaseLines, wrapTeaseWords } from "./inline-md";

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
  // THE TEASE (Lee, 2026-09-12: "maybe we make * * around text do this behavior?"). A teased word
  // films blurred and opens when he clicks it; the blur is PhoneFrame's, scoped to the phone, so a
  // student's own card shows the word plainly.
  test("*tease* marks a word without blurring it here", () => {
    const out = html("the *Land* account");
    expect(out).toContain("sa-tease");
    expect(out).toContain(">Land</span>");
    expect(out).not.toContain("blur(");          // the phone owns the blur, not the markup
  });
  test("**bold** still wins at the same position", () => {
    expect(html("a **b** c")).not.toContain("sa-tease");
    expect(html("a **b** c")).toContain("<strong");
  });
  test("stray stars survive — a footnote, or multiplication", () => {
    expect(html("3 * 4 * 5")).not.toContain("sa-tease");
    expect(html("Assets* are tricky")).not.toContain("sa-tease");
  });
  // Lee, 2026-09-12: "Blur didn't work on this" — his heading wrapped a line break.
  test("a tease may cross a line break", () => {
    const out = html('*"What type of account\nis ____?"*');
    expect(out).toContain("sa-tease");
    expect(out).not.toContain("*");
  });

  // "it will be better if I can just like highlight a text item in the editor and have a popup
  // tooltip for blur or unblur. * is taking too long."
  test("wrapTease blurs the selection, and un-blurs it when it is already teased", () => {
    const a = wrapTease("the Land account", 4, 8);
    expect(a.text).toBe("the *Land* account");
    expect(a.text.slice(a.start, a.end)).toBe("*Land*");
    // selecting the same run again takes it off
    expect(wrapTease(a.text, a.start, a.end).text).toBe("the Land account");
    // and so does selecting the bare word inside the markers
    expect(wrapTease("the *Land* account", 5, 9).text).toBe("the Land account");
    expect(wrapTease("nothing selected", 3, 3).text).toBe("nothing selected");
  });

  test("isTeased sees both shapes", () => {
    expect(isTeased("the *Land* account", 4, 10)).toBe(true);   // the wrapped run
    expect(isTeased("the *Land* account", 5, 9)).toBe(true);    // the word inside it
    expect(isTeased("the Land account", 4, 8)).toBe(false);
  });

  // "on the blur, enable a setting to blur word by word. Just so I have all scenarios ready."
  test("word by word and line by line", () => {
    expect(wrapTeaseWords("Cash Supplies Land", 0, 18).text).toBe("*Cash* *Supplies* *Land*");
    // already-teased words are left alone
    expect(wrapTeaseWords("*Cash* Supplies", 0, 15).text).toBe("*Cash* *Supplies*");
    const lines = wrapTeaseLines("Cash and coins\nSupplies", 0, 23);
    expect(lines.text).toBe("*Cash and coins*\n*Supplies*");
    // a blank line stays blank
    expect(wrapTeaseLines("Cash\n\nLand", 0, 10).text).toBe("*Cash*\n\n*Land*");
  });

  test("toggleTease is the blur button: wraps a line, and takes it off again", () => {
    expect(toggleTease("Land")).toBe("*Land*");
    expect(toggleTease("*Land*")).toBe("Land");
    expect(toggleTease("  ")).toBe("  ");
    expect(toggleTease("Accounts Receivable")).toBe("*Accounts Receivable*");
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
