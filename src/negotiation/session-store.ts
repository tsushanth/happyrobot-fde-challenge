import type { NegotiationState } from "./engine.js";

interface NegotiationSession {
	loadId: string;
	maxBuy: number; // server-side only — never serialized into any HTTP response
	state: NegotiationState;
}

// In-memory for the challenge; a real deployment would use Redis so state
// survives restarts and is shared across instances.
const sessions = new Map<string, NegotiationSession>();

export function startSession(sessionId: string, loadId: string, maxBuy: number, state: NegotiationState) {
	sessions.set(sessionId, { loadId, maxBuy, state });
}

export function getSession(sessionId: string): NegotiationSession | undefined {
	return sessions.get(sessionId);
}

export function updateSessionState(sessionId: string, state: NegotiationState) {
	const session = sessions.get(sessionId);
	if (session) session.state = state;
}

export function endSession(sessionId: string) {
	sessions.delete(sessionId);
}
