import { describe, expect, it } from "vitest";
import { evaluateCarrierAsk, openingOffer, MAX_COUNTER_ROUNDS } from "../src/negotiation/engine.js";

describe("negotiation engine — standard cases", () => {
	it("accepts immediately when the carrier's ask is within MAX_BUY", () => {
		const state = openingOffer(4000, 5000);
		const decision = evaluateCarrierAsk(4800, 5000, state);
		expect(decision).toEqual({ action: "accept", agreedRate: 4800 });
	});

	it("counters when the ask exceeds MAX_BUY, never exceeding it", () => {
		const state = openingOffer(4000, 5000);
		const decision = evaluateCarrierAsk(6000, 5000, state);
		expect(decision.action).toBe("counter");
		if (decision.action === "counter") {
			expect(decision.offerRate).toBeLessThanOrEqual(5000);
			expect(decision.round).toBe(1);
		}
	});

	it("final round counter is exactly MAX_BUY (firm final offer)", () => {
		let state = openingOffer(4000, 5000);
		for (let i = 0; i < MAX_COUNTER_ROUNDS - 1; i++) {
			const d = evaluateCarrierAsk(9999, 5000, state);
			if (d.action === "counter") state = d.state;
		}
		const final = evaluateCarrierAsk(9999, 5000, state);
		expect(final).toEqual({
			action: "counter",
			offerRate: 5000,
			round: MAX_COUNTER_ROUNDS,
			state: { round: MAX_COUNTER_ROUNDS, currentOffer: 5000 },
		});
	});

	it("closes as failed after MAX_COUNTER_ROUNDS with no agreement", () => {
		let state = openingOffer(4000, 5000);
		for (let i = 0; i < MAX_COUNTER_ROUNDS; i++) {
			const d = evaluateCarrierAsk(9999, 5000, state);
			if (d.action === "counter") state = d.state;
		}
		const decision = evaluateCarrierAsk(9999, 5000, state);
		expect(decision).toEqual({ action: "close_failed" });
	});
});

describe("negotiation engine — edge cases", () => {
	it("accepts an ask exactly equal to MAX_BUY", () => {
		const state = openingOffer(4000, 5000);
		expect(evaluateCarrierAsk(5000, 5000, state)).toEqual({ action: "accept", agreedRate: 5000 });
	});

	it("never produces an opening offer above MAX_BUY even when loadboard rate exceeds it", () => {
		const state = openingOffer(9000, 5000);
		expect(state.currentOffer).toBeLessThanOrEqual(5000);
	});

	it("handles a MAX_BUY of 1 without going non-positive or exceeding it", () => {
		const state = openingOffer(500, 1);
		expect(state.currentOffer).toBeGreaterThan(0);
		expect(state.currentOffer).toBeLessThanOrEqual(1);
	});
});

describe("negotiation engine — adversarial", () => {
	it("rejects a negative ask rather than silently accepting a negative rate", () => {
		const state = openingOffer(4000, 5000);
		expect(() => evaluateCarrierAsk(-100, 5000, state)).toThrow(RangeError);
	});

	it("rejects a zero or non-finite ask", () => {
		const state = openingOffer(4000, 5000);
		expect(() => evaluateCarrierAsk(0, 5000, state)).toThrow(RangeError);
		expect(() => evaluateCarrierAsk(Number.NaN, 5000, state)).toThrow(RangeError);
		expect(() => evaluateCarrierAsk(Number.POSITIVE_INFINITY, 5000, state)).toThrow(RangeError);
	});

	it("counter offers never exceed MAX_BUY across many consecutive rounds regardless of ask size", () => {
		let state = openingOffer(4000, 5000);
		const hugeAsk = 1_000_000;
		for (let i = 0; i < MAX_COUNTER_ROUNDS; i++) {
			const d = evaluateCarrierAsk(hugeAsk, 5000, state);
			if (d.action === "counter") {
				expect(d.offerRate).toBeLessThanOrEqual(5000);
				state = d.state;
			}
		}
	});
});
