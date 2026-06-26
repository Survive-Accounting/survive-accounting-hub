import { MessageCircle } from "lucide-react";
import leeHeadshot from "@/assets/lee-headshot-original.png";

const RED = "#CE1126";
const TUTOR_PHONE_E164 = "+16625658818";
const TUTOR_PHONE_PRETTY = "(662) 565-8818";
const SMS_BODY = "Hi Lee, I have a question about accounting tutoring.";
const SMS_HREF = `sms:${TUTOR_PHONE_E164}?body=${encodeURIComponent(SMS_BODY)}`;

const BTN_CLASS =
  "group rounded-2xl px-10 py-5 text-[17px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-3";
const BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
  fontFamily: "Inter, sans-serif",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.25), 0 14px 36px rgba(206,17,38,0.42)",
  letterSpacing: "0.01em",
  textDecoration: "none",
};

export default function ContactForm() {
  return (
    <section
      id="contact-form"
      className="relative pt-20 sm:pt-24 pb-24 sm:pb-28 px-4 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #14213D 0%, #0B1426 100%)" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "120px 120px, 120px 120px",
          opacity: 0.28,
          zIndex: 0,
        }}
      />

      <div className="relative z-10 mx-auto" style={{ maxWidth: 640 }}>
        <div className="flex flex-col items-center text-center">
          <div
            className="rounded-full overflow-hidden mb-5"
            style={{
              width: 84,
              height: 84,
              border: "3px solid rgba(255,255,255,0.85)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            }}
          >
            <img
              src={leeHeadshot}
              alt="Lee Ingram"
              className="w-full h-full object-cover"
              style={{ display: "block" }}
            />
          </div>
          <h2
            className="text-[28px] sm:text-[36px] leading-tight"
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontWeight: 400,
              color: "#FFFFFF",
            }}
          >
            Questions? Just text me.
          </h2>
          <p
            className="mt-3 text-[15px] sm:text-[16px]"
            style={{
              color: "rgba(255,255,255,0.7)",
              fontFamily: "Inter, sans-serif",
              lineHeight: 1.6,
              maxWidth: 480,
            }}
          >
            Wondering which plan fits, or how tutoring works? Text me — I read and reply to every message myself.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4">
            <a href={SMS_HREF} className={BTN_CLASS} style={BTN_STYLE}>
              <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
              <span style={{ fontWeight: 800, letterSpacing: "0.02em" }}>
                Text Lee {TUTOR_PHONE_PRETTY}
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
