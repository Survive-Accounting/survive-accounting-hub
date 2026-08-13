// Scene export/import. Export = a self-contained .canvas.json (same payload the
// DB stores + sceneSettings) plus a human-readable markdown outline. Import =
// parse + summarize into a DIFF PREVIEW (what replaces what) before applying.
import { CARD_KIND_LABEL } from "./templates";
import type { CardData } from "./types";

export interface ScenePayload {
  name: string;
  nodes_json: string; // stringified {schema_version, nodes, edges, sceneSettings}
  viewport_json: string;
  bg?: string;
}

export function sceneToOutline(payload: ScenePayload): string {
  let nj: { nodes?: { type?: string; data?: Record<string, unknown> }[] } = {};
  try { nj = JSON.parse(payload.nodes_json); } catch { /* outline of nothing */ }
  const nodes = nj.nodes ?? [];
  const lines: string[] = [`# ${payload.name}`, ""];
  const zones = nodes.filter((n) => n.type === "zone");
  const cards = nodes.filter((n) => n.type !== "zone");
  if (zones.length) {
    lines.push(`Zones: ${zones.map((z) => (z.data?.label as string) || "unnamed").join(" · ")}`, "");
  }
  for (const n of cards) {
    const d = (n.data ?? {}) as Partial<CardData> & Record<string, unknown>;
    const kind = (d.kind as string) ?? n.type ?? "?";
    const label =
      (d.title as string) ||
      (d.caption as string) ||
      (d.name as string) ||
      (d.account as string) ||
      (d.prompt as string) ||
      (d.body as string) ||
      "";
    const deck = d.staged ? " _(in deck)_" : "";
    lines.push(`- **${CARD_KIND_LABEL[kind as keyof typeof CARD_KIND_LABEL] ?? kind}**${label ? `: ${String(label).slice(0, 80)}` : ""}${deck}`);
  }
  lines.push("", `_${cards.length} cards, exported ${new Date().toISOString()}_`);
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportPreview {
  payload: ScenePayload;
  name: string;
  incomingByKind: Record<string, number>;
  incomingTotal: number;
  error?: string;
}

/** Parse an exported file into a preview (never throws — errors ride the result). */
export function parseImport(text: string): ImportPreview {
  const empty: ScenePayload = { name: "", nodes_json: "{}", viewport_json: "null" };
  try {
    const raw = JSON.parse(text) as Partial<ScenePayload>;
    if (typeof raw.nodes_json !== "string" || typeof raw.name !== "string") {
      return { payload: empty, name: "", incomingByKind: {}, incomingTotal: 0, error: "Not a canvas export (missing name/nodes_json)" };
    }
    const nj = JSON.parse(raw.nodes_json) as { nodes?: { type?: string }[] };
    const byKind: Record<string, number> = {};
    let total = 0;
    for (const n of nj.nodes ?? []) {
      if (n.type === "zone") continue;
      byKind[n.type ?? "?"] = (byKind[n.type ?? "?"] ?? 0) + 1;
      total++;
    }
    return {
      payload: { name: raw.name, nodes_json: raw.nodes_json, viewport_json: raw.viewport_json ?? "null", bg: raw.bg },
      name: raw.name,
      incomingByKind: byKind,
      incomingTotal: total,
    };
  } catch (e) {
    return { payload: empty, name: "", incomingByKind: {}, incomingTotal: 0, error: `Unreadable file: ${e instanceof Error ? e.message : e}` };
  }
}
