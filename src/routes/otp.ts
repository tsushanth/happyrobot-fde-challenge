import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { consoleOtpChannel, issueOtp, verifyOtp } from "../otp/service.js";
import { createResendOtpChannel } from "../otp/resend-channel.js";

export const otpRouter = Router();

const resendChannel = config.resendApiKey
	? createResendOtpChannel(config.resendApiKey, config.otpFromAddress)
	: null;

const sendSchema = z.object({ sessionId: z.string().min(1), destination: z.string().min(1) });

otpRouter.post("/send", async (req, res) => {
	const parsed = sendSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "sessionId and destination are required" });

	const { sessionId, destination } = parsed.data;
	const looksLikeEmail = destination.includes("@");
	// No SMS provider configured — phone-shaped destinations still use the
	// console stub even when Resend is available.
	const channel = looksLikeEmail && resendChannel ? resendChannel : consoleOtpChannel;

	try {
		await issueOtp(sessionId, destination, channel);
		res.json({ sent: true }); // code itself never appears in the response
	} catch (err) {
		console.error("OTP send failed", err);
		res.status(502).json({ error: "otp_delivery_failed" });
	}
});

const verifySchema = z.object({ sessionId: z.string().min(1), code: z.string().min(1) });

otpRouter.post("/verify", (req, res) => {
	const parsed = verifySchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "sessionId and code are required" });

	const result = verifyOtp(parsed.data.sessionId, parsed.data.code);
	res.json({ result, verified: result === "verified" });
});
