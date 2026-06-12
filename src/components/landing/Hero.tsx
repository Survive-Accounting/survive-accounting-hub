import { useState } from "react";
import leeHeadshot from "@/assets/lee-headshot-original.png";

const RED = "#CE1126";

interface HeroProps {
  onBookTutoring?: () => void;
  onReadReviews?: () => void;
  /** Optional overrides (used by /start) — defaults keep the homepage exactly as-is. */
  headline?: string;
  subtext?: string;
  ctaSlot?: React.ReactNode;
  showBottomFade?: boolean;
}

export default function Hero({ onBookTutoring, onReadReviews, headline, subtext, ctaSlot }: HeroProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <section
      className="relative w-full overflow-hidden staging-hero isolate"
      style={{ background: "#0A2A57" }}
    >
      <div aria-hidden="true" className="staging-hero-ribbons">
        <div className="ribbon ribbon-1" />
        <div className="ribbon ribbon-2" />
        <div className="ribbon ribbon-3" />
        <div className="ribbon ribbon-4" />
        <div className="ribbon ribbon-5" />
        <div className="ribbon ribbon-6" />
        <div className="ribbon ribbon-7" />
      </div>

      <div className="staging-hero-overlay-bottom" aria-hidden="true" />

      <style>{`
        .staging-hero { min-height: 88vh; display: flex; align-items: center; }
        @media (max-width: 768px) {
          .staging-hero { min-height: auto; padding-top: 48px; padding-bottom: 72px; display: block; }
        }
        .staging-hero-overlay-bottom {
          position: absolute; left: 0; right: 0; bottom: 0; height: 220px;
          background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.4) 50%, #FFFFFF 100%);
          z-index: 5; pointer-events: none;
        }
        .staging-hero-ribbons {
          position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden;
        }
        .ribbon {
          position: absolute; pointer-events: none; will-change: transform;
          transform-origin: bottom right; mix-blend-mode: screen;
        }
        .ribbon-1 {
          width: 1400px; height: 280px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,40,70,0) 10%, rgba(255,50,80,0.95) 50%, rgba(255,90,70,0.75) 80%, transparent 100%);
          bottom: -80px; right: -200px; transform: rotate(-42deg); filter: blur(45px);
          animation: ribbonSweep1 14s ease-in-out infinite alternate;
        }
        .ribbon-2 {
          width: 1200px; height: 220px;
          background: linear-gradient(90deg, transparent 0%, rgba(220,40,90,0) 15%, rgba(230,50,110,0.85) 55%, rgba(255,80,140,0.6) 80%, transparent 100%);
          bottom: -40px; right: -180px; transform: rotate(-32deg); filter: blur(55px);
          animation: ribbonSweep2 18s ease-in-out infinite alternate;
        }
        .ribbon-3 {
          width: 1100px; height: 200px;
          background: linear-gradient(90deg, transparent 0%, rgba(180,10,30,0) 15%, rgba(180,10,30,0.55) 50%, rgba(150,10,25,0.35) 80%, transparent 100%);
          bottom: 60px; right: -160px; transform: rotate(-22deg); filter: blur(60px);
          animation: ribbonSweep3 22s ease-in-out infinite alternate;
        }
        .ribbon-4 {
          width: 1000px; height: 180px;
          background: linear-gradient(90deg, transparent 0%, rgba(206,17,38,0) 20%, rgba(206,17,38,0.5) 55%, rgba(180,10,30,0.3) 80%, transparent 100%);
          bottom: 160px; right: -140px; transform: rotate(-12deg); filter: blur(65px);
          animation: ribbonSweep4 26s ease-in-out infinite alternate;
        }
        .ribbon-5 {
          width: 900px; height: 160px;
          background: linear-gradient(90deg, transparent 0%, rgba(80,160,255,0) 20%, rgba(100,180,255,0.7) 55%, rgba(140,210,255,0.5) 80%, transparent 100%);
          top: 40px; right: -120px; transform: rotate(8deg); filter: blur(70px);
          animation: ribbonSweep5 30s ease-in-out infinite alternate;
        }
        .ribbon-6 {
          width: 1300px; height: 240px;
          background: linear-gradient(90deg, transparent 0%, rgba(170,220,255,0) 15%, rgba(170,220,255,0.75) 55%, rgba(120,200,255,0.55) 80%, transparent 100%);
          top: 20%; left: -300px; transform-origin: bottom left; transform: rotate(18deg); filter: blur(60px);
          animation: ribbonSweep6 24s ease-in-out infinite alternate;
        }
        .ribbon-7 {
          width: 1100px; height: 200px;
          background: linear-gradient(90deg, transparent 0%, rgba(140,200,255,0) 15%, rgba(150,210,255,0.65) 55%, rgba(180,230,255,0.45) 80%, transparent 100%);
          bottom: 10%; left: -250px; transform-origin: bottom left; transform: rotate(-8deg); filter: blur(70px);
          animation: ribbonSweep7 28s ease-in-out infinite alternate;
        }
        @keyframes ribbonSweep1 {
          0%   { transform: rotate(-42deg) translate(0,0); opacity: 0.95; }
          50%  { transform: rotate(-38deg) translate(-60px,-30px); opacity: 1; }
          100% { transform: rotate(-44deg) translate(-20px,-50px); opacity: 0.9; }
        }
        @keyframes ribbonSweep2 {
          0%   { transform: rotate(-32deg) translate(0,0); opacity: 0.9; }
          50%  { transform: rotate(-28deg) translate(-80px,-20px); opacity: 1; }
          100% { transform: rotate(-35deg) translate(-40px,-60px); opacity: 0.8; }
        }
        @keyframes ribbonSweep3 {
          0%   { transform: rotate(-22deg) translate(0,0); opacity: 0.85; }
          50%  { transform: rotate(-18deg) translate(-100px,-10px); opacity: 0.95; }
          100% { transform: rotate(-25deg) translate(-50px,-80px); opacity: 0.75; }
        }
        @keyframes ribbonSweep4 {
          0%   { transform: rotate(-12deg) translate(0,0); opacity: 0.8; }
          50%  { transform: rotate(-8deg) translate(-120px,10px); opacity: 0.9; }
          100% { transform: rotate(-15deg) translate(-60px,-40px); opacity: 0.7; }
        }
        @keyframes ribbonSweep5 {
          0%   { transform: rotate(8deg) translate(0,0); opacity: 0.75; }
          50%  { transform: rotate(12deg) translate(-80px,20px); opacity: 0.9; }
          100% { transform: rotate(5deg) translate(-40px,-20px); opacity: 0.65; }
        }
        @keyframes ribbonSweep6 {
          0%   { transform: rotate(18deg) translate(0,0); opacity: 0.85; }
          50%  { transform: rotate(22deg) translate(60px,20px); opacity: 0.95; }
          100% { transform: rotate(15deg) translate(30px,50px); opacity: 0.75; }
        }
        @keyframes ribbonSweep7 {
          0%   { transform: rotate(-8deg) translate(0,0); opacity: 0.75; }
          50%  { transform: rotate(-4deg) translate(80px,-20px); opacity: 0.9; }
          100% { transform: rotate(-12deg) translate(40px,30px); opacity: 0.65; }
        }
        @media (max-width: 768px) {
          .ribbon-1 { width: 700px; height: 140px; }
          .ribbon-2 { width: 600px; height: 110px; }
          .ribbon-3 { width: 550px; height: 100px; }
          .ribbon-4 { width: 500px; height: 90px; }
          .ribbon-5 { width: 450px; height: 80px; }
          .ribbon-6 { width: 650px; height: 130px; }
          .ribbon-7 { width: 550px; height: 110px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ribbon { animation: none !important; }
        }

        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(20px); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        @keyframes heroBtnIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes headshotIn {
          from { opacity: 0; transform: scale(0.92); filter: blur(6px); }
          to   { opacity: 1; transform: scale(1);    filter: blur(0); }
        }
        @keyframes headshotFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .hero-anim-headshot-img {
          opacity: 0;
          animation: headshotIn 1.2s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
        }
        .hero-anim-headshot { animation: headshotFloat 6s ease-in-out 1.5s infinite; }
        .hero-anim-eyebrow  { opacity: 0; animation: heroFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.18s forwards; }
        .hero-anim-headline { opacity: 0; animation: heroFadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.32s forwards; }
        .hero-anim-sub      { opacity: 0; animation: heroFadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.5s forwards; }
        .hero-anim-btn      { opacity: 0; animation: heroBtnIn  0.55s cubic-bezier(0.34,1.56,0.64,1) 0.7s forwards; }

        @media (prefers-reduced-motion: reduce) {
          .hero-anim-headshot, .hero-anim-headshot-img, .hero-anim-eyebrow, .hero-anim-headline, .hero-anim-sub, .hero-anim-btn {
            opacity: 1 !important; animation: none !important; transform: none !important; filter: none !important;
          }
        }
      `}</style>

      <div className="relative z-10 mx-auto max-w-[760px] px-4 sm:px-6 py-10 md:py-24 w-full">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex flex-col items-center hero-anim-headshot">
            <div
              className="relative rounded-full overflow-hidden"
              style={{
                width: 112,
                height: 112,
                background: "rgba(255,255,255,0.08)",
                border: "3px solid rgba(255,255,255,0.85)",
                boxShadow:
                  "0 14px 40px rgba(0,0,0,0.45), 0 0 0 6px rgba(255,255,255,0.08)",
              }}
            >
              <img
                src={leeHeadshot}
                alt="Lee Ingram"
                onLoad={() => setImgLoaded(true)}
                className={`hero-anim-headshot-img w-full h-full object-cover ${imgLoaded ? "is-loaded" : ""}`}
                style={{ display: "block" }}
              />
            </div>
            <p
              className="mt-3 hero-anim-eyebrow text-[11px] sm:text-[12px] font-semibold tracking-[0.18em] uppercase"
              style={{
                color: "rgba(255,255,255,0.85)",
                fontFamily: "Inter, sans-serif",
              }}
            >
              Meet Lee Ingram
            </p>
          </div>

          <h1
            className="leading-[1.08] tracking-tight text-[40px] md:text-[64px] hero-anim-headline"
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontWeight: 400,
              color: "#FFFFFF",
              maxWidth: 820,
              textShadow: "0 2px 20px rgba(0,0,0,0.3)",
            }}
          >
            {headline ?? "Let's Make Accounting Simple"}
          </h1>

          <p
            className="mt-5 hero-anim-sub"
            style={{
              color: "rgba(255,255,255,0.78)",
              fontFamily: "Inter, sans-serif",
              fontSize: "17px",
              lineHeight: 1.55,
              maxWidth: 600,
              textShadow: "0 2px 20px rgba(0,0,0,0.3)",
            }}
          >
            {subtext ??
              "Get virtual tutoring and study support that helps you understand the material, build confidence, and perform better on exams."}
          </p>

          <div className="mt-8 flex flex-col items-center gap-4">
            {ctaSlot ?? (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={onBookTutoring}
                className="hero-anim-btn rounded-xl px-9 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center"
                style={{
                  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
                  fontFamily: "Inter, sans-serif",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 28px rgba(206,17,38,0.35)",
                  letterSpacing: "0.01em",
                }}
              >
                Book Tutoring →
              </button>

              <button
                onClick={onReadReviews}
                className="hero-anim-btn rounded-xl px-7 py-4 text-[15px] font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#FFFFFF",
                  fontFamily: "Inter, sans-serif",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                Read Reviews
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
