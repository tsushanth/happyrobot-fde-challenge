export const MAX_COUNTER_ROUNDS = 3;

export interface NegotiationState {
	round: number; // number of dispatcher counters made so far (0..3)
	currentOffer: number;
}

export type NegotiationDecision =
	| { action: "accept"; agreedRate: number }
	| { action: "counter"; offerRate: number; round: number; state: NegotiationState }
	| { action: "close_failed" };

/**
 * Opening offer: starts below the ceiling (MAX_BUY) to leave room to
 * negotiate, biased toward the posted loadboard rate when it's already
 * comfortably under budget. MAX_BUY itself is never returned to a caller —
 * only ever used internally to bound offers.
 */
export function openingOffer(loadboardRate: number, maxBuy: number): NegotiationState {
	const cushionedCeiling = Math.round(maxBuy * 0.85);
	const offer = Math.min(loadboardRate, cushionedCeiling);
	return { round: 0, currentOffer: Math.max(offer, 1) };
}

/**
 * Evaluates the carrier's ask against our current position and either
 * accepts, counters (escalating toward, but never past, MAX_BUY — the final
 * round's counter IS the ceiling, offered as a firm take-it-or-leave-it, not
 * disclosed as "our maximum"), or closes after MAX_COUNTER_ROUNDS.
 */
export function evaluateCarrierAsk(
	carrierAsk: number,
	maxBuy: number,
	state: NegotiationState,
): NegotiationDecision {
	if (!Number.isFinite(carrierAsk) || carrierAsk <= 0) {
		throw new RangeError(`carrierAsk must be a positive finite number, got ${carrierAsk}`);
	}

	if (carrierAsk <= maxBuy) {
		return { action: "accept", agreedRate: carrierAsk };
	}

	if (state.round >= MAX_COUNTER_ROUNDS) {
		return { action: "close_failed" };
	}

	const nextRound = state.round + 1;
	const isFinalRound = nextRound === MAX_COUNTER_ROUNDS;
	const nextOffer = isFinalRound
		? maxBuy
		: Math.min(maxBuy, Math.round(state.currentOffer + (maxBuy - state.currentOffer) / 2));

	return {
		action: "counter",
		offerRate: nextOffer,
		round: nextRound,
		state: { round: nextRound, currentOffer: nextOffer },
	};
}
