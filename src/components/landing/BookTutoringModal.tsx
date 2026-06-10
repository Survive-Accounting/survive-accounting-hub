import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const NAVY = "#14213D";
const RED = "#CE1126";

// Template data: University of Florida intro/intermediate accounting
const SCHOOL_NAME = "University of Florida";
const COURSE_CODES = ["ACG 2021", "ACG 2071", "ACG 3101", "ACG 4111"];
const FAMILY_LABELS = [
  "Intro 1 — Financial Accounting Principles",
  "Intro 2 — Managerial Accounting Principles",
  "Intermediate Accounting I",
  "Intermediate Accounting II",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotSeeingCourse?: () => void;
}

export default function BookTutoringModal({ open, onOpenChange, onNotSeeingCourse }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const darkColor = NAVY;
  const lightColor = RED;

  const reset = () => {
    setSelectedIdx(null);
    setEmail("");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIdx === null) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null);
    // Template: log lead and "redirect" to placeholder availability page
    console.info("[BookTutoring] lead captured", {
      email: trimmed,
      course: COURSE_CODES[selectedIdx],
      school: SCHOOL_NAME,
    });
    window.alert(
      `Template availability page for ${COURSE_CODES[selectedIdx]} would open here.`
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-xl border-none bg-[#F8FAFC] p-0 sm:rounded-2xl">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 pb-6 pt-8">
          {/* School banner */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 22px",
              borderRadius: 999,
              background: "#FFFFFF",
              border: `1.5px solid rgba(206, 17, 38, 0.55)`,
              color: NAVY,
              fontFamily: "Inter, sans-serif",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              boxShadow: `0 0 0 4px rgba(20,33,61,0.08), 0 10px 28px -14px rgba(20,33,61,0.45)`,
              marginBottom: 28,
            }}
          >
            <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>🎓</span>
            Supporting students at {SCHOOL_NAME}
          </div>

          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 18,
              fontWeight: 800,
              color: NAVY,
              letterSpacing: "-0.01em",
              textAlign: "center",
              marginBottom: 14,
            }}
          >
            Select Your Course
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {COURSE_CODES.map((code, i) => {
              const active = selectedIdx === i;
              return (
                <button
                  key={`${code}-${i}`}
                  onClick={() => {
                    setSelectedIdx(active ? null : i);
                    setEmail("");
                    setError(null);
                  }}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 999,
                    border: `1.5px solid ${active ? darkColor : NAVY}`,
                    background: active ? darkColor : "#FFFFFF",
                    color: active ? "#FFFFFF" : NAVY,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    cursor: "pointer",
                    transition: "all 140ms",
                  }}
                >
                  {code}
                </button>
              );
            })}
          </div>

          {selectedIdx !== null && (
            <div
              style={{
                marginTop: 20,
                width: "100%",
                maxWidth: 420,
                padding: "18px 20px",
                borderRadius: 14,
                background: "#FFFFFF",
                border: `1px solid rgba(20, 33, 61, 0.12)`,
                boxShadow: `0 8px 24px -16px rgba(20,33,61,0.35)`,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 20,
                  fontWeight: 800,
                  color: NAVY,
                  letterSpacing: "-0.01em",
                }}
              >
                {COURSE_CODES[selectedIdx]}
              </div>
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: NAVY,
                  opacity: 0.7,
                  marginTop: 4,
                }}
              >
                {FAMILY_LABELS[selectedIdx]}
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: NAVY,
                }}
              >
                Enter your email to view availability
              </div>

              <form onSubmit={handleSubmit} style={{ marginTop: 10 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@school.edu"
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${error ? "#EF4444" : "rgba(20, 33, 61, 0.2)"}`,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14,
                    color: NAVY,
                    outline: "none",
                  }}
                />
                {error && (
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12,
                      color: "#EF4444",
                      fontWeight: 500,
                      textAlign: "left",
                    }}
                  >
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={email.trim().length === 0}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    padding: "12px 22px",
                    borderRadius: 10,
                    background: "#7C84D0",
                    color: "#FFFFFF",
                    border: "none",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    cursor: email.trim().length === 0 ? "not-allowed" : "pointer",
                    opacity: email.trim().length === 0 ? 0.7 : 1,
                  }}
                >
                  View availability →
                </button>
              </form>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              reset();
              onNotSeeingCourse?.();
            }}
            style={{
              marginTop: 16,
              background: "transparent",
              border: "none",
              padding: 0,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontStyle: "italic",
              color: NAVY,
              opacity: 0.75,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Not seeing your course?
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
