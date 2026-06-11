// /t/:slug — the short branded SMS booking link (own-domain, no bit.ly:
// generic shorteners trigger carrier spam filtering). Records the click and
// forwards to the campus landing page with the booking flow opening.
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/t/$slug")({
  component: ShortBookingLink,
});

function ShortBookingLink() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (slug === "book" || slug === "start") {
      navigate({ to: "/start", replace: true });
      return;
    }
    navigate({
      to: "/outreach/school/$slug",
      params: { slug },
      search: { book: "1", src: "sms" } as never,
      replace: true,
    });
  }, [slug, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
