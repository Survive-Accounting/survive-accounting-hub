// The SURVIVE card back — face-down state on the canvas + the deck panel's
// header art. Flat and restrained: navy field, gold inset, faint ledger grid,
// double diamond, wordmark. Typography does the work; one notch of game.
import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

import { useCardActions } from "./BaseCard";
import { useCanvasSettings } from "./CanvasSettingsContext";
import { ConnectionDots } from "./ConnectionDots";

const BACK = {
  frame: "#0B0F1E",
  field: "#14213D",
  gold: "#E8B84B",
  red: "#CE1126",
  cream: "#F4EFE6",
};

export function CardBack({
  label,
  hideLabel,
  width,
  height,
  small,
  onFlip,
}: {
  /** Bottom banner text (card title). */
  label?: string;
  /** Quiz mode: banner shows "???" instead of the title. */
  hideLabel?: boolean;
  width?: number | string;
  height?: number | string;
  /** Deck-header art variant: tighter paddings, no interactivity. */
  small?: boolean;
  onFlip?: () => void;
}) {
  const banner = hideLabel ? "???" : label || "Cram decks";
  return (
    <div
      className={onFlip ? "nodrag-ignore cursor-pointer select-none" : "select-none"}
      style={{
        width: width ?? 240,
        height: height ?? 336,
        background: BACK.frame,
        borderRadius: small ? 10 : 16,
        padding: small ? 4 : 8,
      }}
      onClick={onFlip}
      title={onFlip ? "Click to flip (or press space)" : undefined}
    >
      <div
        className="relative flex h-full w-full flex-col items-center overflow-hidden"
        style={{
          background: BACK.field,
          borderRadius: small ? 7 : 10,
          border: `1px solid ${BACK.gold}`,
          boxShadow: `inset 0 0 0 ${small ? 2 : 4}px ${BACK.field}, inset 0 0 0 ${small ? 3 : 5}px rgba(232,184,75,0.35)`,
        }}
      >
        {/* faint ledger grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 17px, rgba(232,184,75,0.05) 17px, rgba(232,184,75,0.05) 18px)," +
              "repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(232,184,75,0.04) 47px, rgba(232,184,75,0.04) 48px)",
          }}
        />
        {/* three dots */}
        <div className={`flex items-center gap-1.5 ${small ? "mt-1.5" : "mt-3"}`}>
          {[BACK.gold, BACK.red, BACK.cream].map((c, i) => (
            <span key={i} className="rounded-full" style={{ width: small ? 3 : 5, height: small ? 3 : 5, background: c, opacity: 0.85 }} />
          ))}
        </div>
        {/* double diamond + wordmark */}
        <div className="relative grid flex-1 w-full place-items-center">
          <div
            className="absolute"
            style={{
              width: small ? "52%" : "58%",
              aspectRatio: "1",
              border: `1.5px solid rgba(232,184,75,0.55)`,
              transform: "rotate(45deg)",
              borderRadius: 4,
            }}
          />
          <div
            className="absolute"
            style={{
              width: small ? "42%" : "48%",
              aspectRatio: "1",
              border: `1px solid rgba(206,17,38,0.55)`,
              transform: "rotate(45deg)",
              borderRadius: 3,
            }}
          />
          <div className="relative text-center">
            <div
              className="font-black tracking-[0.14em]"
              style={{ color: BACK.cream, fontSize: small ? 11 : 20, textShadow: "0 1px 0 rgba(0,0,0,0.4)" }}
            >
              SURVIVE
            </div>
            <div className="font-bold" style={{ color: BACK.gold, fontSize: small ? 5.5 : 9, letterSpacing: "0.42em", marginLeft: "0.42em" }}>
              ACCOUNTING
            </div>
            {!small && (
              <div className="mt-1.5 text-[9px] tabular-nums" style={{ color: "rgba(244,239,230,0.35)" }}>
                A = L + E
              </div>
            )}
          </div>
        </div>
        {/* bottom pill banner */}
        <div
          className={`${small ? "mb-1.5 px-2 py-0" : "mb-3 px-3 py-0.5"} max-w-[85%] truncate rounded-full text-center`}
          style={{
            background: "rgba(11,15,30,0.75)",
            border: `1px solid rgba(232,184,75,0.4)`,
            color: hideLabel ? BACK.gold : "rgba(244,239,230,0.75)",
            fontSize: small ? 6.5 : 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
          }}
        >
          {banner}
        </div>
      </div>
    </div>
  );
}

/** Node wrapper: while data.faceDown, render the card back AT the card's
 *  footprint; click (or space on the selected card) FLIPS to the real card.
 *  The flip goes through useCardActions.update — a dispatcher command, so
 *  Ctrl+Z turns it back over. nodeTypes wrap once at module scope (stable). */
export function withFaceDown(Component: ComponentType<NodeProps>): ComponentType<NodeProps> {
  return function FaceDownGate(props: NodeProps) {
    const data = props.data as Record<string, unknown>;
    const { update } = useCardActions(props.id);
    const { jeCardWidth, hideFdLabels } = useCanvasSettings();
    if (!data.faceDown) return <Component {...props} />;
    const w = data.kind === "je" ? jeCardWidth : ((data.w as number) ?? 260);
    const h = (data.h as number) ?? 300;
    return (
      <div className="animate-in fade-in zoom-in-90 relative duration-200">
        {/* keep the 4 connection anchors while face down — edges stay attached */}
        <ConnectionDots />
        <CardBack
          label={(data.title as string) || (data.kind as string)}
          hideLabel={hideFdLabels}
          width={w}
          height={h}
          onFlip={() => update({ faceDown: false })}
        />
      </div>
    );
  };
}
