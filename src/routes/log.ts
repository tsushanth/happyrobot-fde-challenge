import { Router } from "express";
import { listCallLog, logCallOutcome } from "../audit/call-log.js";
import { z } from "zod";

export const logRouter = Router();

logRouter.get("/", (_req, res) => {
	res.json({ entries: listCallLog() });
});

const logSchema = z.object({
	carrierMc: z.string().min(1),
	loadId: z.string().min(1),
	agreedRate: z.number().nullable(),
	outcome: z.enum(["booked", "failed_negotiation", "carrier_rejected", "otp_failed", "auth_failed"]),
	notes: z.string().optional(),
});

logRouter.post("/", (req, res) => {
	const parsed = logSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
	res.json(logCallOutcome(parsed.data));
});
