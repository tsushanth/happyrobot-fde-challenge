import type { NegotiationState } from "./engine.js";

interface NegotiationSession {
	loadId: string;
	maxBuy: number; // server-side only — never serialized into any HTTP response
	state: NegotiationState;
}

// TESTING SIMPLIFICATION: the platform's tool-calling layer isn't reliably
// binding a per-call session identifier (see OTP_BYPASS_VERIFICATION for the
// same underlying issue). Rather than depend on that, negotiation state is
// tracked as a single active session — correct as long as only one call is
// negotiating at a time, which holds for testing/demo. A real deployment
// with concurrent calls needs a real session key (e.g. once the platform's
// variable binding is fixed) and Redis instead of this in-memory singleton.
let activeSession: NegotiationSession | null = null;

export function startSession(_sessionId: string | undefined, loadId: string, maxBuy: number, state: NegotiationState) {
	activeSession = { loadId, maxBuy, state };
}

export function getSession(_sessionId: string | undefined): NegotiationSession | undefined {
	return activeSession ?? undefined;
}

export function updateSessionState(_sessionId: string | undefined, state: NegotiationState) {
	if (activeSession) activeSession.state = state;
}

export function endSession(_sessionId: string | undefined) {
	activeSession = null;
}
