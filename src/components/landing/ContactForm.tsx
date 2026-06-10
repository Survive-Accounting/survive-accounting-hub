import { useState } from "react";
import { toast } from "sonner";
import leeHeadshot from "@/assets/lee-headshot-original.png";

const RED = "#CE1126";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    // Placeholder — no backend wired yet
    await new Promise((r) => setTimeout(r, 600));
    toast.success("Thanks! I'll get back to you soon.");
    setName("");
    setEmail("");
    setMessage("");
    setSending(false);
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    fontFamily: "Inter, sans-serif",
    color: "#FFFFFF",
  };

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
        <div className="flex flex-col items-center text-center mb-8">
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
            Got a question? Ask away.
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
            Send me a note about your class, your exam, or anything else. I read
            every message.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg px-4 py-3 text-[15px] placeholder:text-white/40 focus:outline-none focus:border-white/30"
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg px-4 py-3 text-[15px] placeholder:text-white/40 focus:outline-none focus:border-white/30"
            style={inputStyle}
          />
          <textarea
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="rounded-lg px-4 py-3 text-[15px] placeholder:text-white/40 focus:outline-none focus:border-white/30 resize-y"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={sending}
            className="mt-2 rounded-xl px-7 py-4 text-[15px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center self-center"
            style={{
              background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
              fontFamily: "Inter, sans-serif",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 28px rgba(206,17,38,0.35)",
              letterSpacing: "0.01em",
              minWidth: 200,
            }}
          >
            {sending ? "Sending…" : "Send Message →"}
          </button>
        </form>
      </div>
    </section>
  );
}
