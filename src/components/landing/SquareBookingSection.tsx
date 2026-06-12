// Square Appointments booking embed — always-open section on /
// Light, minimal background (subtly differentiated from the pure-white Reviews section).
const SQUARE_BOOK_URL =
  "https://app.squareup.com/appointments/book/30fvidwxlwh9vt/LY1BCZ6Q74JRF/start";

export default function SquareBookingSection() {
  return (
    <section
      id="book-tutoring"
      className="relative w-full"
      style={{
        background: "#F4F6FA",
        borderBottom: "1px solid #E5E9F0",
        padding: "40px 16px 56px",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid #E5E9F0",
            boxShadow:
              "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.18)",
          }}
        >
          <iframe
            src={SQUARE_BOOK_URL}
            title="Book tutoring with Lee"
            loading="lazy"
            style={{ width: "100%", height: 780, border: "none", display: "block" }}
            allow="payment *; clipboard-write"
          />
        </div>

        <p
          className="text-center"
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#64748B",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Trouble loading?{" "}
          <a
            href={SQUARE_BOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#0A2A57", textDecoration: "underline" }}
          >
            Open booking in a new tab
          </a>
          .
        </p>
      </div>
    </section>
  );
}
