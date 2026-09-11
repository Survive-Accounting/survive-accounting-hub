// /l/<code> — THE SHORT DM LINK (2026-09-11). Lee: "links can be much prettier, and shorter for
// DMs we're sending". <code> is the contact's stable 12-hex contact_id (growth_contact_qc), so
// a DM reads surviveaccounting.com/l/68a083e86648. The server looks the contact up, works out
// their page the same way /admin/growth/links does (council chair page, chapter chair page, the
// campus page…) and 302s there with ?ref=<contact uuid> — so the click attributes exactly like
// the long link did, and everything the recipient shares from that page carries the ref on.
//
// An unknown code lands on the home page rather than a 404: a mistyped DM link should still
// show the product.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveDmLink } from "@/lib/outreach-links.functions";

export const Route = createFileRoute("/l/$code")({
  beforeLoad: async ({ params }) => {
    const r = await resolveDmLink({ data: { code: params.code } }).catch(() => null);
    throw redirect({ href: r?.href ?? "/", statusCode: 302 });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => null,
});
