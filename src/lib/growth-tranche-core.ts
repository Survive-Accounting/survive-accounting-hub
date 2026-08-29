// The tranche unlock rule — pure, so it can be tested and reasoned about on its own.
//
// Tranche N+1 unlocks when, across the partner's currently ACTIVE campuses, BOTH hold:
//   · at least 15 campuses are "launched" (checklist items 1-5 all complete), AND
//   · at least 5 campuses have a "response" (a logged council/chapter reply, OR a
//     recruited campus rep who has been issued a tracked link).
//
// Both continuously. Speed alone must never unlock — volume without response is the
// exact failure mode this rule exists to prevent, so the two counts are independent
// and the response floor is not implied by the launch count.

export const TRANCHE_LAUNCH_TARGET = 15;
export const TRANCHE_RESPONSE_TARGET = 5;

export interface TrancheCampusState {
  campusId: string;
  /** Launch-checklist items 1-5 are all complete. */
  launched: boolean;
  /** A logged reply from a council/chapter, OR a recruited rep with a tracked link. */
  responded: boolean;
}

export interface TrancheProgress {
  total: number;
  launched: number;
  responded: number;
  launchTarget: number;
  responseTarget: number;
  launchMet: boolean;
  responseMet: boolean;
  /** Both criteria satisfied — the next tranche may unlock. */
  unlocked: boolean;
}

export function evaluateTranche(campuses: TrancheCampusState[]): TrancheProgress {
  const launched = campuses.reduce((n, c) => n + (c.launched ? 1 : 0), 0);
  const responded = campuses.reduce((n, c) => n + (c.responded ? 1 : 0), 0);
  const launchMet = launched >= TRANCHE_LAUNCH_TARGET;
  const responseMet = responded >= TRANCHE_RESPONSE_TARGET;
  return {
    total: campuses.length,
    launched,
    responded,
    launchTarget: TRANCHE_LAUNCH_TARGET,
    responseTarget: TRANCHE_RESPONSE_TARGET,
    launchMet,
    responseMet,
    unlocked: launchMet && responseMet,
  };
}

/** The one-line progress string the partner dashboard leads with. The gap must always
 *  read at a glance — this is the whole gamification surface, never buried. */
export function trancheProgressLabel(p: TrancheProgress): string {
  return `${p.launched}/${p.launchTarget} campuses launched · ${p.responded}/${p.responseTarget} with response`;
}
