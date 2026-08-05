import { Router } from "express";
import { z } from "zod";
import { issueOtp, verifyOtp } from "../otp/service.js";

export const otpRouter = Router();

const sendSchema = z.object({ sessionId: z.string().min(1), destination: z.string().min(1) });

otpRouter.post("/send", async (req, res) => {
	const parsed = sendSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "sessionId and destination are required" });

	await issueOtp(parsed.data.sessionId, parsed.data.destination);
	res.json({ sent: true }); // code itself never appears in the response
});

const verifySchema = z.object({ sessionId: z.string().min(1), code: z.string().min(1) });

otpRouter.post("/verify", (req, res) => {
	const parsed = verifySchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "sessionId and code are required" });

	const result = verifyOtp(parsed.data.sessionId, parsed.data.code);
	res.json({ result, verified: result === "verified" });
});
