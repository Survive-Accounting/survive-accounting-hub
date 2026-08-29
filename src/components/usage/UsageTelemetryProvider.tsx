// USAGE TELEMETRY PROVIDER — mount once per admin surface. Turns a single
// `data-sa-el="<id>"` attribute into interaction + impression events. Zero props on
// the instrumented elements beyond that attribute; labels/regions/panels come from
// the manifest. Never blocks rendering — all handlers are passive and fire-and-forget.
import { useEffect } from "react";

import { elementIndex, type UsageSurface } from "@/lib/usage-elements";
import { initUsageTelemetry, logImpression, logInteraction } from "@/lib/usage-telemetry";

const closestEl = (start: EventTarget | null): HTMLElement | null => {
  let n = start as HTMLElement | null;
  while (n && n !== document.body) { if (n.dataset && n.dataset.saEl) return n; n = n.parentElement; }
  return null;
};
const isInteractive = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return ["button", "a", "input", "select", "textarea", "label"].includes(tag) || el.getAttribute("role") === "button" || el.isContentEditable || !!el.closest("button,a,input,select,textarea,[role=button]");
};

export function UsageTelemetryProvider({ surface, userId }: { surface: UsageSurface; userId: string | null }) {
  useEffect(() => {
    initUsageTelemetry(surface, userId);
    const man = elementIndex(surface);
    const meta = (el: HTMLElement) => { const id = el.dataset.saEl!; const m = man.get(id); const panel = m?.panel ?? el.closest<HTMLElement>("[data-sa-panel]")?.dataset.saPanel ?? null; return { id, label: m?.label ?? el.dataset.saLabel ?? null, region: m?.region ?? null, panel }; };

    // ---- interactions (delegated, capture phase, passive) ----
    const onInteract = (e: Event) => { const el = closestEl(e.target); if (!el) return; const { id, label, region, panel } = meta(el); logInteraction(id, label, region, panel); };
    const events: [keyof DocumentEventMap, boolean][] = [["click", true], ["keydown", true], ["input", true], ["dragstart", true]];
    for (const [t, cap] of events) document.addEventListener(t, onInteract, { capture: cap, passive: true } as AddEventListenerOptions);

    // hover-open: a pointer that lingers 500ms over an instrumented element
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const onOver = (e: Event) => { const el = closestEl(e.target); clearTimeout(hoverTimer); if (!el) return; hoverTimer = setTimeout(() => { const { id, label, region, panel } = meta(el); logInteraction(id, label, region, panel); }, 500); };
    const onOut = () => clearTimeout(hoverTimer);
    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });

    // ---- rage clicks: 3+ clicks within 2s on the SAME non-interactive target ----
    let rageEl: HTMLElement | null = null, rageN = 0, rageT = 0;
    const onRage = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement; const t = Date.now();
      if (rageEl === tgt && t - rageT < 2000) rageN++; else { rageEl = tgt; rageN = 1; }
      rageT = t;
      if (rageN >= 3 && !isInteractive(tgt)) { const host = closestEl(tgt) ?? tgt.closest<HTMLElement>("[data-sa-panel]"); const id = host?.dataset.saEl ?? host?.dataset.saPanel ?? "unknown-target"; const m = man.get(id); logInteraction(id, m?.label ?? host?.dataset.saLabel ?? id, m?.region ?? null, m?.panel ?? host?.dataset.saPanel ?? null, "rage_click"); rageN = 0; }
    };
    document.addEventListener("click", onRage, { passive: true });

    // ---- impressions: visible ≥1s, deduped per element per session ----
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const el = en.target as HTMLElement; const id = el.dataset.saEl; if (!id) continue;
        const w = el as HTMLElement & { __saImpT?: ReturnType<typeof setTimeout> };
        if (en.isIntersecting && en.intersectionRatio > 0) { if (!w.__saImpT) w.__saImpT = setTimeout(() => { const { label, region, panel } = meta(el); logImpression(id, label, region, panel); io.unobserve(el); }, 1000); }
        else if (w.__saImpT) { clearTimeout(w.__saImpT); w.__saImpT = undefined; }
      }
    }, { threshold: 0.01 });
    const observeAll = () => document.querySelectorAll<HTMLElement>("[data-sa-el]").forEach((el) => io.observe(el));
    observeAll();
    // catch elements added after mount (panels opening, tabs switching)
    const mo = new MutationObserver((muts) => { for (const m of muts) for (const n of Array.from(m.addedNodes)) { if (!(n instanceof HTMLElement)) continue; if (n.dataset?.saEl) io.observe(n); n.querySelectorAll?.<HTMLElement>("[data-sa-el]").forEach((el) => io.observe(el)); } });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      for (const [t, cap] of events) document.removeEventListener(t, onInteract, { capture: cap } as EventListenerOptions);
      document.removeEventListener("mouseover", onOver); document.removeEventListener("mouseout", onOut); document.removeEventListener("click", onRage);
      clearTimeout(hoverTimer); io.disconnect(); mo.disconnect();
    };
  }, [surface, userId]);
  return null;
}
