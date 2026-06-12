// Square Appointments booking embed — always-open section on /
// Students click "Book Tutoring" anywhere on the page and we smooth-scroll
// here instead of opening a modal.
const SQUARE_BOOK_URL =
  "https://app.squareup.com/appointments/book/30fvidwxlwh9vt/LY1BCZ6Q74JRF/start";

export default function SquareBookingSection() {
  return (
    <section
      id="book-tutoring"
      style={{ background: "#F8FAFC", padding: "48px 16px 64px" }}
    >
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div className="text-center mb-6">
          <h2
            style={{
              fontFamily: "DM Serif Display, serif",
              color: "#14213D",
              fontSize: 36,
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Book Tutoring
          </h2>
          <p
            style={{
              marginTop: 8,
              color: "#475569",
              fontFamily: "Inter, sans-serif",
              fontSize: 15,
            }}
          >
            Pick your course and a time that works for you.
          </p>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(20, 33, 61, 0.08)",
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
            color: "#6B7280",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Trouble loading?{" "}
          <a
            href={SQUARE_BOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#14213D", textDecoration: "underline" }}
          >
            Open booking in a new tab
          </a>
          .
        </p>
      </div>
    </section>
  );
}
