// THE V3 DATA SOURCE — one call, cached for the page's life.
//
// V3 needs exactly the tree loadBoothBank() already returns (topics → sets →
// questions), so it adds NO new data source: the same server function the
// Talkthrough Booth and /blast-off use. Three screens read slices of it.
//
// The promise is cached at module scope, not the result, so simultaneous mounts
// share ONE request and a navigation between screens is instant rather than a
// second round trip. A rejection clears the cache, so a failed load retries on
// the next mount instead of poisoning the session.
//
// Hoisted functions and `var` state, per tdz-hazards: this is read during render
// by every V3 screen, and a module-scope arrow here is the exact shape that has
// taken production down twice.
import { useEffect, useState } from "react";

import { loadBoothBank, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";

// eslint-disable-next-line no-var
var pending: Promise<BoothTopic[]> | undefined;

function bankOnce(): Promise<BoothTopic[]> {
  if (!pending) {
    pending = loadBoothBank()
      .then((r) => r.topics)
      .catch((e) => {
        pending = undefined; // let the next mount try again
        throw e;
      });
  }
  return pending;
}

/** Drop the cache — for a "reload the bank" affordance. */
export function refreshBank(): void {
  pending = undefined;
}

export interface BankState {
  topics: BoothTopic[] | null;
  error: string | null;
}

export function useBank(): BankState {
  const [state, setState] = useState<BankState>({ topics: null, error: null });
  useEffect(() => {
    let live = true;
    bankOnce()
      .then((topics) => { if (live) setState({ topics, error: null }); })
      .catch((e) => { if (live) setState({ topics: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, []);
  return state;
}

/** URL-safe slug for a topic or set name. Ids are opaque and ugly in a URL, and
 *  these screens are things Lee reads aloud; the id still resolves as a
 *  fallback so an old link never breaks. */
export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

/** Find by slug first, then by raw id. */
export function findTopic(topics: BoothTopic[], key: string): BoothTopic | undefined {
  return topics.find((t) => slugOf(t.name) === key) ?? topics.find((t) => t.id === key);
}

export function findSet(topic: BoothTopic, key: string): BoothSetInfo | undefined {
  return topic.sets.find((s) => slugOf(s.name) === key) ?? topic.sets.find((s) => s.id === key);
}

/** The set a V3 screen is on, resolved from its URL params. Every screen
 *  under /v3/$topic/$set reads this so none of them re-invent the lookup. */
export function useV3Set(topicKey: string, setKey: string): BankState & { topic: BoothTopic | undefined; set: BoothSetInfo | undefined } {
  const { topics, error } = useBank();
  const topic = topics ? findTopic(topics, topicKey) : undefined;
  const set = topic ? findSet(topic, setKey) : undefined;
  return { topics, error, topic, set };
}

/** The topic a set belongs to — for linking to another set's screens. */
export function topicOfSet(topics: BoothTopic[], setId: string): BoothTopic | undefined {
  return topics.find((t) => t.sets.some((s) => s.id === setId));
}

export type BlastOffStep = "talkthrough" | "arrange" | "film";

/** /v3/$topic/$set/blast-off[/step] — the one place the nested URL is spelled. */
export function blastOffPath(topic: BoothTopic, set: BoothSetInfo, step?: BlastOffStep): string {
  return `/v3/${slugOf(topic.name)}/${slugOf(set.name)}/blast-off${step ? `/${step}` : ""}`;
}
