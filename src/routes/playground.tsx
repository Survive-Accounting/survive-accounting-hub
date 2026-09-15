// /playground — turn GAMER MODE on and pick where to go (Lee, 2026-09-15: "a playground version of the
// entire site … let me click around and see how this would look"). The switch is per browser; the real
// site is untouched for everyone else. Exit from the pill on any page, or ?gamer=0.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GAMER_EVENT, readGamerMode, setGamerMode } from "@/lib/gamer-mode";

export const Route = createFileRoute("/playground")({
  head: () => ({ meta: [{ title: "Playground — Survive Accounting" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Playground,
});

const LINKS: { href: string; label: string; note: string }[] = [
  { href: "/", label: "Home", note: "The bolt fires at Start cramming; the Greek door's letters fire at its button." },
  { href: "/learn/ole-miss", label: "Learn · Ole Miss", note: "The nav bolt fires at Start cramming. Video cards are character select; the one you're on is charged." },
  { href: "/learn/lsu", label: "Learn · LSU", note: "Switch schools from the pill — the bolt drops in with a zap." },
  { href: "/chapters?school=university-of-mississippi&c=ifc", label: "Chair portal · Ole Miss IFC", note: "The header bolt fires at the chapter finder." },
];

function Playground() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setGamerMode(true);
    const read = () => setOn(readGamerMode());
    read();
    window.addEventListener(GAMER_EVENT, read);
    return () => window.removeEventListener(GAMER_EVENT, read);
  }, []);
  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(120% 80% at 50% 0%, #10204A, #05080F 70%)", color: "#E8F4FF", fontFamily: "'Rubik', system-ui, sans-serif", padding: "56px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".16em", color: "#7FD0FF" }}>PLAYGROUND</p>
        <h1 style={{ margin: "6px 0 10px", fontFamily: "'League Spartan', 'Rubik', sans-serif", fontSize: 44, fontWeight: 900, lineHeight: 1 }}>Gamer mode is {on ? "on" : "off"}.</h1>
        <p style={{ margin: 0, color: "#AFC6E0", lineHeight: 1.55 }}>
          The real site, with the lightning turned up — only in this browser. Click around; exit from the pill in the corner of any page.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 26 }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} data-gm-cta={l.href === "/" ? "pg" : undefined}
              style={{ display: "block", padding: "14px 16px", borderRadius: 14, background: "rgba(20,36,72,.7)", border: "1px solid rgba(127,208,255,.25)", color: "#F5FAFF", textDecoration: "none" }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{l.label} →</div>
              <div style={{ fontSize: 13, color: "#9FB6D2", marginTop: 3 }}>{l.note}</div>
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button type="button" onClick={() => setGamerMode(!on)} style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(127,208,255,.6)", background: "transparent", color: "#CFEFFF", fontWeight: 800, cursor: "pointer" }}>
            {on ? "Turn it off" : "Turn it on"}
          </button>
        </div>
      </div>
    </main>
  );
}
