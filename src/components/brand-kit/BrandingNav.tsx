// The three /branding pages, one strip: the slide wall, the thumbnail system, the social kit.
import { Link } from "@tanstack/react-router";

const PAGES = [
  { to: "/branding", label: "Slides" },
  { to: "/branding/thumbnails", label: "Thumbnails" },
  { to: "/branding/social", label: "Social" },
] as const;

export function BrandingNav({ current }: { current: (typeof PAGES)[number]["to"] }) {
  return (
    <nav style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {PAGES.map((p) => {
        const on = p.to === current;
        return (
          <Link key={p.to} to={p.to}
            style={{ fontSize: 12, fontWeight: 800, padding: "5px 13px", borderRadius: 999, textDecoration: "none", border: `1px solid ${on ? "#FCA311" : "rgba(244,239,230,0.2)"}`, color: on ? "#FCA311" : "#9AA3B8", background: on ? "rgba(252,163,17,0.1)" : "transparent" }}>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
