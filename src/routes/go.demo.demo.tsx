// /go/demo/demo → /go/demo. The demo chapter's "chapter link" and its flyer QR are built by the
// same machinery every real chapter uses (chapterUrl / flyerTarget both emit /go/<school>/<chapter>),
// so the two-segment form has to land somewhere real. Static routes outrank /go/$school/$chapter,
// so this wins before the dynamic route can 404 it.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/go/demo/demo")({
  beforeLoad: () => { throw redirect({ to: "/go/demo", statusCode: 301 }); },
});
