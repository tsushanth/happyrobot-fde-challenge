import { randomInt } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 3;

interface OtpEntry {
	code: string;
	expiresAt: number;
	attemptsRemaining: number;
}

// In-memory store keyed by call/session ID. A real deployment would use Redis
// or similar so state survives process restarts across a fleet of instances.
const store = new Map<string, OtpEntry>();

export interface OtpChannel {
	send(destination: string, code: string): Promise<void>;
}

/** Dev delivery channel — logs instead of actually sending. Swap in a real
 * Twilio/SendGrid-backed OtpChannel for production; the interface is the
 * contract, not this implementation. */
export const consoleOtpChannel: OtpChannel = {
	async send(destination, code) {
		console.log(`[OTP] Would send code ${code} to ${destination}`);
	},
};

function generateCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueOtp(
	sessionId: string,
	destination: string,
	channel: OtpChannel = consoleOtpChannel,
): Promise<void> {
	const code = generateCode();
	store.set(sessionId, {
		code,
		expiresAt: Date.now() + OTP_TTL_MS,
		attemptsRemaining: MAX_VERIFY_ATTEMPTS,
	});
	await channel.send(destination, code);
	// Intentionally never returned to the caller — only the delivery channel
	// (carrier's actual email/SMS) ever sees the code.
}

export type OtpVerifyResult = "verified" | "invalid_code" | "expired" | "no_active_otp" | "locked_out";

/**
 * Hard boolean verification with no bypass path. Rate-limited per session
 * (locks after MAX_VERIFY_ATTEMPTS wrong guesses) to resist brute force, and
 * there is deliberately no admin override, support code, or "trust me"
 * framing accepted here — compliance requires this to be unconditional.
 */
export function verifyOtp(sessionId: string, submittedCode: string): OtpVerifyResult {
	const entry = store.get(sessionId);
	if (!entry) return "no_active_otp";

	if (Date.now() > entry.expiresAt) {
		store.delete(sessionId);
		return "expired";
	}

	if (entry.attemptsRemaining <= 0) {
		store.delete(sessionId);
		return "locked_out";
	}

	if (submittedCode !== entry.code) {
		entry.attemptsRemaining -= 1;
		if (entry.attemptsRemaining <= 0) {
			store.delete(sessionId);
			return "locked_out";
		}
		return "invalid_code";
	}

	store.delete(sessionId); // single-use
	return "verified";
}
