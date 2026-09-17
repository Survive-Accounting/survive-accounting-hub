// THE COVER an older film page / Stitch Room wears once a newer one opened (capture/singleton.ts).
export function HandedOff({ what, onReclaim }: { what: string; onReclaim: () => void }) {
  return (
    <div role="status" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(5,8,16,0.96)", color: "#F4EFE6", display: "grid", placeItems: "center", fontFamily: "'Rubik', system-ui, sans-serif", textAlign: "center", padding: 24 }}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "0.04em" }}>{what} moved to a newer tab</div>
        <p style={{ color: "#9AA3B8", fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>Only one {what.toLowerCase()} runs at a time, so this one stepped aside. Close this tab, or take over here.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
          <button type="button" onClick={() => { try { window.close(); } catch { /* the browser decides */ } }} style={{ font: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 16px", borderRadius: 9, cursor: "pointer", border: "1px solid rgba(244,239,230,0.3)", background: "transparent", color: "#F4EFE6" }}>Close this tab</button>
          <button type="button" onClick={onReclaim} style={{ font: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 16px", borderRadius: 9, cursor: "pointer", border: "1px solid #FCA311", background: "#FCA311", color: "#14213D" }}>Take over here</button>
        </div>
      </div>
    </div>
  );
}
