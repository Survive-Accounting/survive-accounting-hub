// Square Appointments booking embed — always-open section on /
// Sits flush under the hero on the same animated navy background so the page
// only transitions to white at the Reviews section.
const SQUARE_BOOK_URL =
  "https://app.squareup.com/appointments/book/30fvidwxlwh9vt/LY1BCZ6Q74JRF/start";

export default function SquareBookingSection() {
  return (
    <section
      id="book-tutoring"
      className="relative w-full overflow-hidden isolate"
      style={{ background: "#0A2A57", padding: "32px 16px 72px" }}
    >
      <div aria-hidden="true" className="booking-ribbons">
        <div className="b-ribbon b-ribbon-1" />
        <div className="b-ribbon b-ribbon-2" />
        <div className="b-ribbon b-ribbon-3" />
        <div className="b-ribbon b-ribbon-4" />
        <div className="b-ribbon b-ribbon-5" />
      </div>

      <style>{`
        .booking-ribbons {
          position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden;
        }
        .b-ribbon {
          position: absolute; pointer-events: none; will-change: transform;
          transform-origin: center; mix-blend-mode: screen;
        }
        .b-ribbon-1 {
          width: 1300px; height: 240px;
          background: linear-gradient(90deg, transparent 0%, rgba(100,180,255,0) 15%, rgba(120,200,255,0.55) 55%, rgba(160,220,255,0.4) 80%, transparent 100%);
          top: -40px; left: -200px; transform: rotate(-10deg); filter: blur(60px);
          animation: bRib1 22s ease-in-out infinite alternate;
        }
        .b-ribbon-2 {
          width: 1200px; height: 220px;
          background: linear-gradient(90deg, transparent 0%, rgba(206,17,38,0) 15%, rgba(206,17,38,0.45) 55%, rgba(180,10,30,0.3) 80%, transparent 100%);
          bottom: -60px; right: -180px; transform: rotate(-18deg); filter: blur(70px);
          animation: bRib2 26s ease-in-out infinite alternate;
        }
        .b-ribbon-3 {
          width: 1000px; height: 200px;
          background: linear-gradient(90deg, transparent 0%, rgba(140,200,255,0) 15%, rgba(150,210,255,0.5) 55%, rgba(180,230,255,0.35) 80%, transparent 100%);
          top: 30%; right: -150px; transform: rotate(8deg); filter: blur(65px);
          animation: bRib3 28s ease-in-out infinite alternate;
        }
        .b-ribbon-4 {
          width: 1100px; height: 210px;
          background: linear-gradient(90deg, transparent 0%, rgba(230,50,110,0) 15%, rgba(230,50,110,0.4) 55%, rgba(255,80,140,0.3) 80%, transparent 100%);
          bottom: 20%; left: -200px; transform: rotate(14deg); filter: blur(70px);
          animation: bRib4 30s ease-in-out infinite alternate;
        }
        .b-ribbon-5 {
          width: 900px; height: 180px;
          background: linear-gradient(90deg, transparent 0%, rgba(80,160,255,0) 15%, rgba(100,180,255,0.45) 55%, rgba(140,210,255,0.3) 80%, transparent 100%);
          top: 60%; left: 10%; transform: rotate(-4deg); filter: blur(70px);
          animation: bRib5 24s ease-in-out infinite alternate;
        }
        @keyframes bRib1 {
          0%   { transform: rotate(-10deg) translate(0,0); opacity: 0.85; }
          100% { transform: rotate(-6deg) translate(60px,30px); opacity: 1; }
        }
        @keyframes bRib2 {
          0%   { transform: rotate(-18deg) translate(0,0); opacity: 0.8; }
          100% { transform: rotate(-14deg) translate(-50px,-30px); opacity: 0.95; }
        }
        @keyframes bRib3 {
          0%   { transform: rotate(8deg) translate(0,0); opacity: 0.75; }
          100% { transform: rotate(12deg) translate(-80px,20px); opacity: 0.9; }
        }
        @keyframes bRib4 {
          0%   { transform: rotate(14deg) translate(0,0); opacity: 0.75; }
          100% { transform: rotate(10deg) translate(60px,-20px); opacity: 0.9; }
        }
        @keyframes bRib5 {
          0%   { transform: rotate(-4deg) translate(0,0); opacity: 0.7; }
          100% { transform: rotate(-8deg) translate(40px,30px); opacity: 0.9; }
        }
        @media (prefers-reduced-motion: reduce) {
          .b-ribbon { animation: none !important; }
        }
      `}</style>

      <div className="relative z-10 mx-auto" style={{ maxWidth: 980 }}>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow:
              "0 30px 80px -10px rgba(0,0,0,0.55), 0 12px 30px -8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
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
            marginTop: 14,
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
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
