/**
 * Supplementary call-outcome log. Per the challenge brief, primary call
 * activity capture must use HappyRobot-native tooling (Twin) — this module
 * is NOT a replacement for that. It exists only as a backend-owned backstop
 * so the booking/negotiation endpoints have a durable record independent of
 * the workflow platform, useful for local debugging and the QA doc's
 * evidence trail. Justification for the "external DB" exception per the
 * brief: this challenge environment has no provisioned Twin access to write
 * to directly, so a minimal local log stands in for it during development.
 */

export interface CallLogEntry {
	timestamp: string;
	carrierMc: string;
	loadId: string;
	agreedRate: number | null;
	outcome: "booked" | "failed_negotiation" | "carrier_rejected" | "otp_failed" | "auth_failed";
	notes?: string;
}

const entries: CallLogEntry[] = [];

export function logCallOutcome(entry: Omit<CallLogEntry, "timestamp">): CallLogEntry {
	const full: CallLogEntry = { ...entry, timestamp: new Date().toISOString() };
	entries.push(full);
	console.log("[CALL_LOG]", JSON.stringify(full));
	return full;
}

export function listCallLog(): CallLogEntry[] {
	return [...entries];
}
