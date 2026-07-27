// MUX RATES + LINKS (Lee — CEQ Studio cost estimates). ONE place to change if Mux
// changes pricing. All figures are ESTIMATES for the current video_quality tier
// ("basic", as the staged pipeline uses). Update from Mux's pricing page:
//   https://www.mux.com/pricing/video   (Encoding + Storage rows)
// NOTE: Delivery/streaming is billed on WATCH TIME and is NOT estimated here.
export const MUX_RATES = {
  /** One-time ENCODING, US$ per minute of source (basic tier). Placeholder — verify. */
  encodingPerMin: 0.005,
  /** STORAGE, US$ per minute stored, per MONTH (basic tier). Placeholder — verify. */
  storagePerMinPerMonth: 0.003,
};

/** Deep link to an asset in the Mux dashboard. Mux resolves the org/environment
 *  from the logged-in session; if your org needs an explicit path, edit here. */
export const muxAssetUrl = (assetId: string) => `https://dashboard.mux.com/video/assets/${assetId}`;

/** Encoding estimate (one-time) for a clip of `seconds`. */
export const encodingEst = (seconds?: number) => ((seconds ?? 0) / 60) * MUX_RATES.encodingPerMin;
/** Storage estimate per MONTH for a clip of `seconds`. */
export const storageEstPerMonth = (seconds?: number) => ((seconds ?? 0) / 60) * MUX_RATES.storagePerMinPerMonth;
/** Format a US$ estimate compactly (e.g. $0.01, $1.20). */
export const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
