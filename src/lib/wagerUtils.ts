import type { Wager, WagerStatus } from '../types';

/**
 * Returns a wager's status from a specific user's personal perspective.
 *
 * The DB stores outcomes from the creator's point of view:
 *   status='won'  → creator won; status='lost' → creator lost.
 * For any participant (non-creator) the result is the opposite.
 *
 * Active / neutral statuses (pending, overdue, declined, etc.) are
 * returned as-is regardless of who is viewing.
 *
 * This is the single source of truth for all win/loss UI logic.
 */
export function getPersonalResult(wager: Wager, userId: string): WagerStatus {
  const { status, creatorId } = wager;

  // Creator sees the raw DB value — no transformation needed
  if (creatorId === userId) return status;

  // Participant: invert the final-outcome statuses
  switch (status) {
    case 'won':              return 'lost'; // creator won → participant lost
    case 'lost':             return 'won';  // creator lost → participant won
    case 'awaiting_payment': return 'lost'; // creator awaiting collection → participant owes
    default:                 return status; // pending, active, overdue, settled, declined, etc.
  }
}

/** Convenience: is this a "decided" (win or loss) wager for the given user? */
export function isDecided(wager: Wager, userId: string): boolean {
  const r = getPersonalResult(wager, userId);
  return r === 'won' || r === 'lost';
}

/** Convenience: is this wager still live for the given user? */
export function isActiveForUser(wager: Wager, userId: string): boolean {
  const r = getPersonalResult(wager, userId);
  return r === 'pending' || r === 'active' || r === 'overdue';
}
