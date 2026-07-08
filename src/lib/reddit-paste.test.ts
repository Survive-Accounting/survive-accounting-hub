// Unit tests for the Reddit paste parser. Run with `bun test`.
import { test, expect } from "bun:test";
import { parseRedditPaste } from "./reddit-paste";

const NOW = Date.parse("2026-07-07T12:00:00.000Z");

// --- Fixture 1: new-reddit shaped, relative time, no URL in paste ---
const NEW_REDDIT = `Skip to main content
r/olemiss
Search
Log In
Sign Up
Posted by u/accountingstudent22
5 hr. ago
Need a tutor for ACCY 202 this semester
Hey all, I'm really struggling with intermediate accounting and my exam is coming up. Does anyone know a good tutor around Oxford? Willing to pay.
Upvote
12
Downvote
8 comments
Share
Save
Add a comment
Sort by: Best`;

test("new-reddit paste", () => {
  const p = parseRedditPaste(NEW_REDDIT, NOW);
  expect(p.subreddit).toBe("olemiss");
  expect(p.author).toBe("accountingstudent22");
  expect(p.posted_at).toBe("2026-07-07T07:00:00.000Z"); // 5h before NOW
  expect(p.title).toBe("Need a tutor for ACCY 202 this semester");
  expect(p.snippet?.startsWith("Hey all, I'm really struggling")).toBe(true);
  expect(p.url).toBeNull();
});

// --- Fixture 2: old-reddit shaped, "submitted N days ago by u/x", has a URL ---
const OLD_REDDIT = `old.reddit.com
r/gamecocks: University of South Carolina
submitted 2 days ago by u/gamecockfan
Accounting 225 study group before the midterm?
Anyone want to form a study group for ACCT 225? Midterm is next week and I could use the help getting through the practice sets.
permalink
https://old.reddit.com/r/gamecocks/comments/abc123/accounting_225_study_group/
42 points
15 comments`;

test("old-reddit paste with URL", () => {
  const p = parseRedditPaste(OLD_REDDIT, NOW);
  expect(p.subreddit).toBe("gamecocks");
  expect(p.author).toBe("gamecockfan");
  expect(p.posted_at).toBe("2026-07-05T12:00:00.000Z"); // 2 days before NOW
  expect(p.title).toBe("Accounting 225 study group before the midterm?");
  expect(p.snippet?.startsWith("Anyone want to form a study group")).toBe(true);
  expect(p.url).toBe(
    "https://old.reddit.com/r/gamecocks/comments/abc123/accounting_225_study_group/",
  );
});

// --- Fixture 3: absolute date, minimal ---
const ABSOLUTE = `r/Auburn
Posted by u/warEagle_cpa
Jul 2, 2026
Looking for accounting help before finals week
I have my ACCT 3110 final in two weeks and need serious help. DM me if you tutor.
Add a comment`;

test("absolute-date paste", () => {
  const p = parseRedditPaste(ABSOLUTE, NOW);
  expect(p.subreddit).toBe("Auburn");
  expect(p.author).toBe("warEagle_cpa");
  expect(p.posted_at).toBe("2026-07-02T00:00:00.000Z");
  expect(p.title).toBe("Looking for accounting help before finals week");
  expect(p.snippet?.startsWith("I have my ACCT 3110 final")).toBe(true);
  expect(p.url).toBeNull();
});

// --- Empty / garbage never throws, returns all-null ---
test("empty paste is safe", () => {
  const p = parseRedditPaste("", NOW);
  expect(p).toEqual({
    subreddit: null,
    author: null,
    posted_at: null,
    title: null,
    snippet: null,
    url: null,
  });
});
