import { useEffect, useRef } from "react";

const EMBED_ID = "484dc267-e1b2-425c-b5c6-49d9525cec9f";
const NAVY = "#14213D";

export default function Reviews() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const scriptId = "testimonialto-resizer";
    const init = () => {
      if ((window as unknown as { iFrameResize?: (opts: unknown, sel: string) => void }).iFrameResize && iframeRef.current) {
        (window as unknown as { iFrameResize: (opts: unknown, sel: string) => void }).iFrameResize(
          { log: false, checkOrigin: false },
          `#testimonialto-reviews-${EMBED_ID}`,
        );
      }
    };
    if (document.getElementById(scriptId)) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://testimonial.to/js/iframeResizer.min.js";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, []);

  return (
    <section
      id="reviews-section"
      className="relative px-4 sm:px-6 py-16 sm:py-20"
      style={{ background: "#FFFFFF" }}
    >
      <div className="mx-auto" style={{ maxWidth: 1080 }}>
        <h2
          className="text-center text-[26px] sm:text-[34px] leading-tight mb-8 sm:mb-10"
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
            color: NAVY,
          }}
        >
          What students say after working with Lee
        </h2>
        <iframe
          ref={iframeRef}
          id={`testimonialto-reviews-${EMBED_ID}`}
          src={`https://embed-v2.testimonial.to/w/survive-accounting-with-lee-ingram?id=${EMBED_ID}`}
          frameBorder={0}
          scrolling="no"
          style={{ width: "100%", border: "none" }}
          title="Student reviews"
        />
      </div>
    </section>
  );
}
