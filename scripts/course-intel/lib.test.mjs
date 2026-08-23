#!/usr/bin/env node
/** Tests for Course Intel pure utilities. Run: node --test scripts/course-intel/lib.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEditionNumber, canonicalTitle, primaryAuthorKey, normalizeTextbook,
  parseExamChapterRanges, scoreConfidence, classifyDocument, freshnessWeight, chooseMappingSource,
} from "./lib.mjs";

test("parseEditionNumber handles many formats", () => {
  assert.equal(parseEditionNumber("Financial Accounting, 12e"), 12);
  assert.equal(parseEditionNumber("Financial Accounting 12/e"), 12);
  assert.equal(parseEditionNumber("Financial Accounting 6th Edition"), 6);
  assert.equal(parseEditionNumber("Fundamental Accounting Principles 25th Ed."), 25);
  assert.equal(parseEditionNumber("Financial Accounting Twelfth Edition"), 12);
  assert.equal(parseEditionNumber("Ed. 10"), 10);
  assert.equal(parseEditionNumber("Financial Accounting (Looseleaf)"), null);
});

test("canonicalTitle strips format + edition noise", () => {
  assert.equal(canonicalTitle("Financial Accounting (Looseleaf) (w/ Connect)"), "Financial Accounting");
  assert.equal(canonicalTitle("Financial Accounting, 12e"), "Financial Accounting");
  assert.equal(canonicalTitle("Financial Accounting (Connect Access Only)"), "Financial Accounting");
  assert.equal(canonicalTitle("Financial Accounting 2025 Release"), "Financial Accounting");
  assert.equal(canonicalTitle("Fundamental Accounting Principles 25th Edition"), "Fundamental Accounting Principles");
});

test("primaryAuthorKey extracts first author's last name", () => {
  assert.equal(primaryAuthorKey("Spiceland, Thomas, Herrmann"), "spiceland");
  assert.equal(primaryAuthorKey("Robert Libby, Patricia Libby, Frank Hodge"), "libby");
  assert.equal(primaryAuthorKey("Wild & Shaw"), "wild");
});

test("normalizeTextbook collapses bundle variants to one editionKey", () => {
  const a = normalizeTextbook({ title: "Financial Accounting (Looseleaf) 6th Edition", authors: "Spiceland, Thomas, Herrmann" });
  const b = normalizeTextbook({ title: "Financial Accounting (w/ Connect) 6e", authors: "J. David Spiceland" });
  assert.equal(a.editionKey, "financial-accounting|spiceland|6");
  assert.equal(a.editionKey, b.editionKey, "different bundle strings, same edition identity");
  assert.equal(a.editionConfirmed, true);
});

test("normalizeTextbook flags unknown edition with |?", () => {
  const r = normalizeTextbook({ title: "Financial Accounting (Looseleaf)", authors: "Spiceland" });
  assert.equal(r.edition, null);
  assert.equal(r.editionConfirmed, false);
  assert.ok(r.editionKey.endsWith("|?"), "unknown edition ends in |?");
});

test("parseExamChapterRanges parses common phrasings", () => {
  assert.deepEqual(parseExamChapterRanges("Exam 1 covers Chapters 1-3"), [{ exam: "exam 1", chapters: [1, 2, 3] }]);
  assert.deepEqual(parseExamChapterRanges("Exam 1: Ch. 1–3, 5"), [{ exam: "exam 1", chapters: [1, 2, 3, 5] }]);
  assert.deepEqual(parseExamChapterRanges("Midterm covers chapters 4 through 6"), [{ exam: "midterm", chapters: [4, 5, 6] }]);
  const multi = parseExamChapterRanges("Exam 1 = Chapters 1, 2, and 3. Exam 2 = Chapters 4-6.");
  assert.equal(multi.length, 2);
  assert.deepEqual(multi[0], { exam: "exam 1", chapters: [1, 2, 3] });
  assert.deepEqual(multi[1], { exam: "exam 2", chapters: [4, 5, 6] });
});

test("parseExamChapterRanges returns [] on no match, never throws", () => {
  assert.deepEqual(parseExamChapterRanges("This syllabus has no exam schedule."), []);
  assert.deepEqual(parseExamChapterRanges(""), []);
  assert.deepEqual(parseExamChapterRanges(null), []);
});

test("scoreConfidence: strong evidence => High", () => {
  const r = scoreConfidence({ explicitExamRange: true, exactEditionIdentified: true, exactTocFound: true, ageYears: 0 });
  assert.equal(r.level, "High");
});
test("scoreConfidence: generic catalog only => Low", () => {
  assert.equal(scoreConfidence({ onlyGenericCatalog: true }).level, "Low");
  assert.equal(scoreConfidence({ exactEditionIdentified: true, ageYears: 6, editionUncertain: true }).level, "Low");
});
test("scoreConfidence: middling => Medium", () => {
  assert.equal(scoreConfidence({ explicitExamRange: true, ageYears: 2 }).level, "Medium");
});

test("classifyDocument tiers documents", () => {
  assert.deepEqual(classifyDocument({ title: "ACCT 2013 Exam 1 Study Guide" }), { type: "study_guide", tier: 1 });
  assert.deepEqual(classifyDocument({ title: "ACC 201 Syllabus Fall 2025" }), { type: "syllabus", tier: 2 });
  assert.deepEqual(classifyDocument({ title: "Course Schedule" }), { type: "schedule", tier: 2 });
  assert.deepEqual(classifyDocument({ title: "Faculty Profile" }), { type: "faculty_page", tier: 4 });
  assert.equal(classifyDocument({ url: "https://x.edu/notes.pdf", title: "" }).tier, 3);
});

test("freshnessWeight decays with age", () => {
  assert.equal(freshnessWeight(2026, 2026).label, "current");
  assert.equal(freshnessWeight(2025, 2026).label, "recent");
  assert.equal(freshnessWeight(2023, 2026).label, "useful");
  assert.equal(freshnessWeight(2021, 2026).label, "supporting");
  assert.equal(freshnessWeight(2018, 2026).label, "weak");
  assert.ok(freshnessWeight(2026, 2026).weight > freshnessWeight(2021, 2026).weight);
});

test("chooseMappingSource prefers professor > course > generic, skipping Low", () => {
  assert.equal(chooseMappingSource({
    professorMapping: { confidence: "High" }, courseMapping: { confidence: "High" }, genericMapping: {},
  }).source, "professor");
  assert.equal(chooseMappingSource({
    professorMapping: { confidence: "Low" }, courseMapping: { confidence: "Medium" }, genericMapping: {},
  }).source, "course");
  assert.equal(chooseMappingSource({
    professorMapping: { confidence: "Low" }, courseMapping: { confidence: "Low" }, genericMapping: { id: "generic" },
  }).source, "generic");
  assert.equal(chooseMappingSource({}).source, "none");
});
