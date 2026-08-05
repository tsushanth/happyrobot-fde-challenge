import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueOtp, verifyOtp, type OtpChannel } from "../src/otp/service.js";

function fakeChannel(): OtpChannel & { lastCode: string | null; lastDestination: string | null } {
	return {
		lastCode: null,
		lastDestination: null,
		async send(destination, code) {
			this.lastDestination = destination;
			this.lastCode = code;
		},
	};
}

describe("OTP — standard cases", () => {
	it("verifies a correctly submitted code", async () => {
		const channel = fakeChannel();
		await issueOtp("session-1", "carrier@example.com", channel);
		expect(channel.lastCode).toMatch(/^\d{6}$/);
		expect(verifyOtp("session-1", channel.lastCode!)).toBe("verified");
	});

	it("is single-use — a second verify attempt after success fails", async () => {
		const channel = fakeChannel();
		await issueOtp("session-2", "carrier@example.com", channel);
		verifyOtp("session-2", channel.lastCode!);
		expect(verifyOtp("session-2", channel.lastCode!)).toBe("no_active_otp");
	});
});

describe("OTP — edge cases", () => {
	it("returns no_active_otp for a session that never had one issued", () => {
		expect(verifyOtp("never-issued", "123456")).toBe("no_active_otp");
	});

	it("expires after the TTL window", async () => {
		vi.useFakeTimers();
		const channel = fakeChannel();
		await issueOtp("session-expiry", "carrier@example.com", channel);
		vi.advanceTimersByTime(6 * 60 * 1000);
		expect(verifyOtp("session-expiry", channel.lastCode!)).toBe("expired");
		vi.useRealTimers();
	});
});

describe("OTP — adversarial (social-engineering resistance)", () => {
	it("locks out after repeated wrong guesses (brute-force resistance)", async () => {
		const channel = fakeChannel();
		await issueOtp("session-brute", "carrier@example.com", channel);
		expect(verifyOtp("session-brute", "000000")).toBe("invalid_code");
		expect(verifyOtp("session-brute", "111111")).toBe("invalid_code");
		// 3rd wrong attempt consumes the last remaining attempt -> locked out
		expect(verifyOtp("session-brute", "222222")).toBe("locked_out");
		// Even the real code no longer works once locked out.
		expect(verifyOtp("session-brute", channel.lastCode!)).toBe("no_active_otp");
	});

	it("has no bypass code, admin override, or wildcard value accepted under any framing", async () => {
		const channel = fakeChannel();
		await issueOtp("session-bypass", "carrier@example.com", channel);
		const socialEngineeringAttempts = [
			"000000",
			"999999",
			"BYPASS",
			"",
			"undefined",
			"null",
			channel.lastCode!.slice(0, 5), // partial match
		];
		for (const attempt of socialEngineeringAttempts) {
			const result = verifyOtp("session-bypass", attempt);
			expect(result).not.toBe("verified");
		}
	});

	it("never exposes the generated code back through issueOtp's return value", async () => {
		const channel = fakeChannel();
		const result = await issueOtp("session-secrecy", "carrier@example.com", channel);
		expect(result).toBeUndefined();
	});
});
