// THE COUNCIL PAGE'S TWO CHANNELS (2026-08-28) — /partners/council/<school>/<council>.
//
// Same door component as the homepage and chapter pages (home-two-door/DoorCard) — extracted
// once, imported everywhere, never forked. What differs here is that the two doors are not two
// AUDIENCES but two CHANNELS for one audience: the council officer who has decided to help.
//
//   LEFT  — digital. They send it themselves, from their own inbox, today.
//   RIGHT — in-room. They print it and walk into the next chapter-presidents meeting with it.
//
// Neither door is the "real" one; a council runs on both, and which one works is the officer's
// call, not ours.
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { FlyerMark } from "@/components/site/chapter/ChapterDoors";
import {
  CHAPTER_BTN, DOOR_BTN_CLASS, DoorCard, DoorRow, SOLO_BTN,
} from "@/components/site/home-two-door/DoorCard";

/** Section anchors — the doors' destinations. */
export const CAMPAIGN_ANCHOR = "campaign";
export const KIT_ANCHOR = "partner-kit";

export function CouncilDoors({ onBuildBlast, onDownloadKit, kitBusy }: {
  onBuildBlast: () => void;
  onDownloadKit: () => void;
  /** The kit is generated on demand (one ZIP, every chapter) — the button says so while it works. */
  kitBusy?: boolean;
}) {
  return (
    <DoorRow label="Two ways to get this to your chapters">
      {/* LEFT — digital. */}
      <DoorCard
        icon={<span aria-hidden style={{ display: "block" }}><BoltBoil height={112} /></span>}
        title="Send it now"
        button={
          <button type="button" onClick={onBuildBlast} className={DOOR_BTN_CLASS} style={SOLO_BTN}>
            Build the blast →
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
            Every chapter&apos;s link, one email from you. Takes two minutes.
          </span>
        }
      />

      {/* RIGHT — in-room. */}
      <DoorCard
        icon={<FlyerMark height={112} />}
        title="Bring it to the meeting"
        button={
          <button type="button" onClick={onDownloadKit} disabled={kitBusy} className={DOOR_BTN_CLASS} style={{ ...CHAPTER_BTN, ...(kitBusy ? { opacity: 0.6, cursor: "default" } : {}) }}>
            {kitBusy ? "Building your kit…" : "Download the partner kit →"}
          </button>
        }
        support={
          <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
            Flyers, chapter-meeting slides, and the details — one folder, ready to hand out.
          </span>
        }
      />
    </DoorRow>
  );
}
