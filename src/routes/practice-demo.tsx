// PRACTICE DEMO — dev lab for the SHARED PracticeStage (the exam-tab player's
// practice view), mounted in its demo mode (questions override, no server).
// Exists so player-nav changes can be QA'd without the homepage waitlist gate,
// a campus context, or auth. Noindex; registered in site-qa IGNORED_ROUTES.
import { createFileRoute } from "@tanstack/react-router";

import { PracticeStage } from "@/components/site/PracticeStage";
import type { PracticeQuestion } from "@/lib/student.functions";

export const Route = createFileRoute("/practice-demo")({
  head: () => ({ meta: [{ title: "⚡ Practice Stage Demo — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: PracticeDemo,
});

const QUESTIONS: PracticeQuestion[] = [
  { id: "d1", prompt: "What type of account is Unearned Revenue?", shorthand: "Unearned", choices: [
    { id: "a", text: "Liability", correct: true, feedback: "You OWE the service." },
    { id: "b", text: "Revenue", correct: false, feedback: null },
    { id: "c", text: "Asset", correct: false, feedback: null },
  ] },
  { id: "d2", prompt: "Prepaids are always ______.", shorthand: "Prepaids", choices: [
    { id: "a", text: "Assets", correct: true, feedback: "Bought upfront, used later." },
    { id: "b", text: "Expenses", correct: false, feedback: null },
  ] },
  { id: "d3", prompt: "Payables are always ______.", shorthand: "Payables", choices: [
    { id: "a", text: "Liabilities", correct: true, feedback: "Cash we expect to PAY." },
    { id: "b", text: "Assets", correct: false, feedback: null },
  ] },
];

function PracticeDemo() {
  return (
    <div style={{ minHeight: "100vh", background: "#080D18", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "min(680px, 100%)", height: "min(620px, 92vh)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(148,163,190,0.16)", background: "rgba(5,8,16,0.9)" }}>
        <PracticeStage setId="demo" questions={QUESTIONS} onDone={() => { /* demo: nowhere to go */ }} doneLabel="Done (demo)" isTest />
      </div>
    </div>
  );
}
