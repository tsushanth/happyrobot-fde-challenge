import { Router } from "express";
import { z } from "zod";
import { logCallOutcome } from "../audit/call-log.js";
import { config } from "../config.js";
import { bookLoad } from "../tms/operations.js";

export const bookingRouter = Router();

const bookSchema = z.object({
	loadId: z.string().min(1),
	mcNumber: z.string().min(1),
	agreedRate: z.coerce.number().positive(),
});

bookingRouter.post("/confirm", async (req, res) => {
	const parsed = bookSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

	const { loadId, mcNumber, agreedRate } = parsed.data;
	try {
		const outcome = await bookLoad(config.tms, loadId, mcNumber, agreedRate);
		logCallOutcome({
			carrierMc: mcNumber,
			loadId,
			agreedRate,
			outcome: "booked",
			notes: outcome.status === "already_booked" ? "resolved via retry idempotency" : undefined,
		});
		res.json(outcome);
	} catch (err) {
		console.error("Booking failed", err);
		logCallOutcome({ carrierMc: mcNumber, loadId, agreedRate, outcome: "carrier_rejected" });
		res.status(502).json({ error: "booking_unavailable" });
	}
});

// Mocked per the challenge brief: "transfers do not work with web calls, this
// should be mocked." No live senior-rep queue exists in this environment.
bookingRouter.post("/handoff", (req, res) => {
	res.json({ transferred: true, mocked: true, note: "Senior rep handoff is mocked for this environment" });
});
