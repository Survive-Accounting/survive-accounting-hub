// Scoring math helpers: percentile normalization, growth, small-base shrinkage.

// Percentile-rank normalizer built from a population of known numeric values.
export function percentiler(values) {
  const arr = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  const n = arr.length;
  return (x) => {
    if (x == null || !Number.isFinite(x) || n === 0) return null;
    // fraction of population strictly below + half of equal (midrank), 0..100
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
    const below = lo;
    let eq = 0; while (below + eq < n && arr[below + eq] === x) eq++;
    return +(((below + eq / 2) / n) * 100).toFixed(1);
  };
}

// Growth ratio with graceful zero/small-base handling.
export function growthRatio(cur, base) {
  if (base == null || cur == null) return null;
  if (base <= 0) return null; // undefined ratio; caller marks insufficient
  return (cur - base) / base;
}

export function cagr(cur, base, years) {
  if (base == null || cur == null || base <= 0 || cur < 0 || years <= 0) return null;
  return Math.pow(cur / base, 1 / years) - 1;
}

// Small-base shrinkage: damp growth for tiny baselines so 2->10 can't outrank 500->600.
export function shrink(growth, base, minBase) {
  if (growth == null || base == null) return null;
  return growth * Math.min(1, base / minBase);
}

// Weighted score over AVAILABLE components (renormalized), returns {score, completeness, parts}.
// components: [{key, weight, value /*0-100 percentile or null*/, available /*bool*/}]
export function weightedScore(components) {
  let wsum = 0, vsum = 0, availW = 0, totW = 0;
  const parts = {};
  for (const c of components) {
    totW += c.weight;
    if (c.available && c.value != null) {
      wsum += c.weight; vsum += c.weight * c.value; availW += c.weight;
      parts[c.key] = { weight: c.weight, value: c.value };
    } else {
      parts[c.key] = { weight: c.weight, value: null, available: false };
    }
  }
  const score = wsum > 0 ? +(vsum / wsum).toFixed(1) : null;
  const completeness = totW > 0 ? +(availW / totW).toFixed(3) : 0;
  return { score, completeness, parts };
}

export const round = (x, d = 1) => (x == null ? null : +Number(x).toFixed(d));
