import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { consoleOtpChannel, issueOtp, verifyOtp } from "../otp/service.js";
import { createResendOtpChannel } from "../otp/resend-channel.js";

export const otpRouter = Router();

const resendChannel = config.resendApiKey
	? createResendOtpChannel(config.resendApiKey, config.otpFromAddress)
	: null;

// The platform's tool-calling layer doesn't reliably bind a per-call session
// identifier (same root cause documented in negotiation/session-store.ts).
// Rather than trust whatever arrives, collapse anything that isn't a plain,
// short, real-looking value (missing, empty, or a stray unresolved template
// like "verify_otp.mcNumber") down to one shared testing key, so send/verify
// always agree. Safe under the same one-call-at-a-time assumption as
// negotiation. Revisit once the platform binding is fixed upstream.
const FALLBACK_SESSION_KEY = "GLOBAL";
function sanitizeSessionKey(raw: string | undefined): string {
	if (!raw || raw.length === 0 || raw.length > 40 || raw.includes(".") || raw.includes("@")) {
		return FALLBACK_SESSION_KEY;
	}
	return raw;
}

const sendSchema = z.object({ sessionId: z.string().optional(), destination: z.string().min(1) });

otpRouter.post("/send", async (req, res) => {
	const parsed = sendSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "destination is required" });

	const sessionId = sanitizeSessionKey(parsed.data.sessionId);
	const { destination } = parsed.data;
	const looksLikeEmail = destination.includes("@");
	// No SMS provider configured — phone-shaped destinations still use the
	// console stub even when Resend is available.
	const channel = looksLikeEmail && resendChannel ? resendChannel : consoleOtpChannel;

	// TESTING ONLY: our Resend account is unverified, so it can only deliver
	// to the account owner's own address. Force-route real sends there
	// regardless of what the caller states, so demo calls don't fail on
	// transcription variance. Remove once a verified sending domain is set up.
	const actualDestination =
		looksLikeEmail && config.otpTestEmailOverride ? config.otpTestEmailOverride : destination;

	try {
		await issueOtp(sessionId, actualDestination, channel);
		res.json({ sent: true }); // code itself never appears in the response
	} catch (err) {
		console.error("OTP send failed", err);
		res.status(502).json({ error: "otp_delivery_failed" });
	}
});

const verifySchema = z.object({ sessionId: z.string().optional(), code: z.string().min(1) });

otpRouter.post("/verify", (req, res) => {
	const parsed = verifySchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "code is required" });

	const sessionId = sanitizeSessionKey(parsed.data.sessionId);
	const result = verifyOtp(sessionId, parsed.data.code);
	res.json({ result, verified: result === "verified" });
});
