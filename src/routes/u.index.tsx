// /u — the preferences page without a token (someone typed it). Points at the link in their email.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/u/")({
  head: () => ({ meta: [{ title: "Email preferences — Survive Accounting" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#1a1a1a", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "56px 20px", fontSize: 16, lineHeight: 1.55 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>Email preferences</h1>
        <p>Use the “Unsubscribe” or “Email preferences” link at the bottom of any email from me — it's tied to your address. Or just reply to the email and tell me; I'll do it by hand. Texts: reply STOP to any text. — Lee</p>
      </div>
    </div>
  ),
});
