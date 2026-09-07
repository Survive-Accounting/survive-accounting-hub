// THE REGISTRY ON THE CLIENT — one call, cached for the page's life (the use-bank.ts pattern).
//
// IllustrationPanel, the bank page and the style editor all read the same registry; the promise
// is cached at module scope so simultaneous mounts share ONE request. Until it resolves — and
// whenever it can't (not signed in on the server, the migration not run) — the code registry
// (CODE_REGISTRY) stands in, so nothing that reads a style ever waits or breaks. A save on the
// editor primes the cache with the registry the server handed back and every mounted reader
// re-renders with it; refresh drops the cache and re-fetches.
//
// Hoisted functions and `var` state, per tdz-hazards: this sits beside the canvas graph
// (IllustrationPanel → ReviewDeck), and a module-scope arrow here is the exact shape that has
// taken production down twice.
import { useEffect, useState } from "react";

import { loadIllustrationRegistry } from "@/lib/illustration-registry.functions";

import { CODE_REGISTRY, type IllustrationRegistry } from "./illustration";

// eslint-disable-next-line no-var
var pending: Promise<IllustrationRegistry> | undefined;
// eslint-disable-next-line no-var
var current: IllustrationRegistry = CODE_REGISTRY;
// eslint-disable-next-line no-var
var listeners: Set<(r: IllustrationRegistry) => void> | undefined;

function notify(r: IllustrationRegistry): void {
  if (listeners) for (const l of listeners) l(r);
}

function registryOnce(): Promise<IllustrationRegistry> {
  if (!pending) {
    pending = loadIllustrationRegistry()
      .then((r) => { current = r; notify(r); return r; })
      .catch((e) => {
        pending = undefined; // let the next mount try again
        throw e;
      });
  }
  return pending;
}

/** The server just handed back the registry (a save, a seed, a settings change) — make it the
 *  one every reader sees, without another round trip. */
export function primeIllustrationRegistry(r: IllustrationRegistry): void {
  current = r;
  pending = Promise.resolve(r);
  notify(r);
}

/** Drop the cache and re-fetch — for a "reload" affordance. */
export function refreshIllustrationRegistry(): Promise<IllustrationRegistry> {
  pending = undefined;
  return registryOnce();
}

/** What the readers hold right now (the code registry until the server's arrives). */
export function currentIllustrationRegistry(): IllustrationRegistry {
  return current;
}

export interface RegistryState {
  registry: IllustrationRegistry;
  /** True once the server's registry has arrived (source "db" or "code" — either is loaded). */
  loaded: boolean;
  /** The load failed (not signed in, network) — the code registry stands in. */
  error: string | null;
}

export function useIllustrationRegistry(): RegistryState {
  const [state, setState] = useState<RegistryState>(function init() { return { registry: current, loaded: current !== CODE_REGISTRY, error: null }; });
  useEffect(function subscribe() {
    let live = true;
    function onRegistry(r: IllustrationRegistry) { if (live) setState({ registry: r, loaded: true, error: null }); }
    if (!listeners) listeners = new Set();
    listeners.add(onRegistry);
    registryOnce()
      .then(onRegistry)
      .catch((e) => { if (live) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) })); });
    return function unsubscribe() { live = false; listeners?.delete(onRegistry); };
  }, []);
  return state;
}
