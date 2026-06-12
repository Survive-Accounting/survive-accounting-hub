// Square Appointments booking embed — always-open section on /
// Sits flush under the hero on a navy background so the page only
// transitions to white at the Reviews section.
const SQUARE_BOOK_URL =
  "https://app.squareup.com/appointments/book/30fvidwxlwh9vt/LY1BCZ6Q74JRF/start";

export default function SquareBookingSection() {
  return (
    <section
      id="book-tutoring"
      style={{ background: "#0A2A57", padding: "16px 16px 64px" }}
    >
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          }}
        >
          <iframe
            src={SQUARE_BOOK_URL}
            title="Book tutoring with Lee"
            loading="lazy"
            style={{ width: "100%", height: 1200, border: "none", display: "block" }}
            allow="payment *; clipboard-write"
          />
        </div>

        <p
          className="text-center"
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Trouble loading?{" "}
          <a
            href={SQUARE_BOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#FFFFFF", textDecoration: "underline" }}
          >
            Open booking in a new tab
          </a>
          .
        </p>
      </div>
    </section>
  );
}
