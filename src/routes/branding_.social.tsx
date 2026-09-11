// /branding/social — the social-account kit (Lee, 2026-09-11): the master avatar, the YouTube
// banner, the reusable cover template and the campus bolt check. Private = AdminGate + noindex,
// linked from /leeportal and the /branding strip, never from public navigation.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BrandingNav } from "@/components/brand-kit/BrandingNav";
import { SocialAssets } from "@/components/brand-kit/SocialAssets";

export const Route = createFileRoute("/branding_/social")({
  component: () => <AdminGate><Social /></AdminGate>,
  head: () => ({ meta: [{ title: "Social kit — Survive" }, { name: "robots", content: "noindex" }] }),
});

function Social() {
  return (
    <div style={{ minHeight: "100vh", background: "#070B14", color: "#F4EFE6", fontFamily: "'Inter', system-ui, sans-serif", padding: "28px 32px 80px" }}>
      <BrandingNav current="/branding/social" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 22, fontWeight: 900, margin: 0 }}>Social kit</h1>
        <span style={{ fontSize: 12.5, color: "#9AA3B8" }}>the avatar, the YouTube banner and the cover template — one bolt, one navy, one cream, one typeface</span>
      </div>
      <SocialAssets />
    </div>
  );
}
