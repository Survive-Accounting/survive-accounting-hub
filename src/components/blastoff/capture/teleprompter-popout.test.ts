import { describe, expect, test } from "bun:test";

import { TELEPROMPTER_POPOUT_FEATURES, TELEPROMPTER_POPOUT_NAME, teleprompterPopoutHref } from "./teleprompter-popout";

describe("the teleprompter popout", () => {
  test("its own window name and shape — a popup, not a tab, sized to sit beside the film pop-out", () => {
    expect(TELEPROMPTER_POPOUT_NAME).toBe("sa-teleprompter-popout");
    expect(TELEPROMPTER_POPOUT_NAME).not.toBe("sa-film-popout"); // a different window than the capture pop-out
    expect(TELEPROMPTER_POPOUT_FEATURES).toContain("popup=yes");
  });
  test("the href carries the set id, encoded", () => {
    expect(teleprompterPopoutHref("abc-123")).toBe("/v3/teleprompter?set=abc-123");
    expect(teleprompterPopoutHref("a b/c")).toBe("/v3/teleprompter?set=a%20b%2Fc");
  });
});
