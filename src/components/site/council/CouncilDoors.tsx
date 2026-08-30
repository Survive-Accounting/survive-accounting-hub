// THE COUNCIL PAGE'S THREE DOORS — /partners/council/<school>/<council>.
//
// Same door component as the homepage and chapter pages (home-two-door/DoorCard) — extracted once,
// imported everywhere, never forked. What differs is that these are not three AUDIENCES but three
// CHANNELS for one person: the council academic exec who has just decided to help.
//
//   1 SHARE      — the group chat she already has. The default, and the fast one.
//   2 MEETING    — the room she is standing in front of next week.
//   3 PREVIEW    — what she is actually putting her name on. Some people need to see it first.
//
// ORDER IS THE ARGUMENT. Sharing is first because it is the thing that takes thirty seconds and
// the thing the cold email promised. Preview is last because a person who needs to see it first
// will scan all three anyway, and a person who does not should not have to step around it.
//
// WORDS WE DO NOT USE HERE: "blast" and "partner kit". Nobody outside this company knows what
// either means, and "partner" claims a relationship this officer has not agreed to. She is being
// asked to share something, not to sign something.
import { Bolt } from "@/components/canvas/brand";
import { FlyerMark } from "@/components/site/chapter/ChapterDoors";
import {
  CHAPTER_BTN, DOOR_BTN_CLASS, DoorCard, DoorRow, SOLO_BTN,
} from "@/components/site/home-two-door/DoorCard";

/** Section anchors — the doors' destinations. */
export const SHARE_ANCHOR = "share";
export const KIT_ANCHOR = "meeting-materials";

export function CouncilDoors({ onShare, onDownloadKit, kitBusy, previewHref, bolt }: {
  onShare: () => void;
  onDownloadKit: () => void;
  /** The materials are generated on demand (one ZIP, every chapter) — the button says so while it works. */
  kitBusy?: boolean;
  /** The real student experience: this campus's own page. Door 3 leaves rather than showing a
   *  mock-up of the product, because a mock-up of the product is the thing it replaced. */
  previewHref: string;
  /** The campus colourway, so door 1 wears the school's own bolt rather than the brand's. */
  bolt: { c1: string; c2: string };
}) {
  return (
    <DoorRow cols={3} label="Three ways to get this to your chapters">
      {/* DOOR 1 — SHARE. The campus bolt, not the brand's: this door belongs to her campus. */}
      <DoorCard
        icon={
          <span aria-hidden style={{ display: "block", height: 112 }}>
            <Bolt c1={bolt.c1} c2={bolt.c2} title="Your campus" />
          </span>
        }
        title="Share with your chapters"
        button={
          <button type="button" onClick={onShare} className={DOOR_BTN_CLASS} style={SOLO_BTN}>
            Share it →
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
            Every chapter&apos;s link, ready to send. Takes 30 seconds.
          </span>
        }
      />

      {/* DOOR 2 — THE ROOM. */}
      <DoorCard
        icon={<FlyerMark height={112} />}
        title="Bring it to chapter meeting"
        button={
          <button
            type="button"
            onClick={onDownloadKit}
            disabled={kitBusy}
            className={DOOR_BTN_CLASS}
            style={{ ...CHAPTER_BTN, ...(kitBusy ? { opacity: 0.6, cursor: "default" } : {}) }}
          >
            {kitBusy ? "Building your download…" : "Download meeting materials →"}
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
            Flyers, slides, and QR codes for every chapter.
          </span>
        }
      />

      {/* DOOR 3 — SEE IT. A link, not a button: it navigates, and the cursor should say so. */}
      <DoorCard
        icon={<PlayMark height={112} />}
        title="See what students get"
        button={
          <a
            href={previewHref}
            className={`inline-flex items-center justify-center ${DOOR_BTN_CLASS}`}
            style={CHAPTER_BTN}
          >
            Preview it →
          </a>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
            The actual student experience — videos and practice.
          </span>
        }
      />
    </DoorRow>
  );
}

/** THE PLAY MARK — door 3's icon, drawn in the same hand-drawn language as the flyer mark beside
 *  it: cream strokes, round caps, one accent fill. A play triangle inside a screen, because what
 *  is behind this door is the thing students actually watch. */
function PlayMark({ height = 112 }: { height?: number }) {
  const w = Math.round(height * (96 / 96));
  return (
    <svg viewBox="0 0 96 96" width={w} height={height} fill="none" aria-hidden style={{ display: "block" }}>
      {/* The screen, with the same jagged hand-drawn corner the other marks have. */}
      <path
        d="M12 18 L84 18 L84 68 L12 68 Z"
        stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round"
      />
      {/* The play triangle, filled in the accent so the eye lands on the action. */}
      <path
        d="M40 33 L64 43 L40 53 Z"
        fill="var(--accent)" stroke="var(--brand-cream)" strokeWidth={3.5} strokeLinejoin="round"
      />
      {/* Stand and base. */}
      <path d="M48 68 L48 78" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" />
      <path d="M30 82 L66 82" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  );
}
