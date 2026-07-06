// Build-mode progress in localStorage. Key: je:build:{slug}:{variantId}. No auth, no DB.
// localStorage is touched only inside guarded functions so this is SSR/node-safe.

export interface VariantProgress {
  completedAt: string | null; // ISO timestamp of first full-correct completion
  attempts: number;
  hintsUsed: number;
}

const key = (slug: string, variantId: string) => `je:build:${slug}:${variantId}`;

function readRaw(slug: string, variantId: string): VariantProgress | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key(slug, variantId)) : null;
    return raw ? (JSON.parse(raw) as VariantProgress) : null;
  } catch {
    return null;
  }
}

export function getVariantProgress(slug: string, variantId: string): VariantProgress {
  return readRaw(slug, variantId) ?? { completedAt: null, attempts: 0, hintsUsed: 0 };
}

export function recordAttempt(slug: string, variantId: string, hintsUsed: number, correct: boolean): VariantProgress {
  const prev = getVariantProgress(slug, variantId);
  const next: VariantProgress = {
    attempts: prev.attempts + 1,
    hintsUsed: Math.max(prev.hintsUsed, hintsUsed),
    completedAt: prev.completedAt ?? (correct ? new Date().toISOString() : null),
  };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key(slug, variantId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** All variant progress for a scenario, keyed by variantId. Used by the variant dots + the Hub. */
export function readProgress(slug: string): Record<string, VariantProgress> {
  const out: Record<string, VariantProgress> = {};
  try {
    if (typeof localStorage === "undefined") return out;
    const prefix = `je:build:${slug}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const variantId = k.slice(prefix.length);
        const raw = localStorage.getItem(k);
        if (raw) out[variantId] = JSON.parse(raw) as VariantProgress;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
