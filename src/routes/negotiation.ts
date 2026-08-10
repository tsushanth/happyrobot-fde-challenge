import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { evaluateCarrierAsk, openingOffer } from "../negotiation/engine.js";
import { endSession, getSession, startSession, updateSessionState } from "../negotiation/session-store.js";
import { getLoad } from "../tms/operations.js";

export const negotiationRouter = Router();

// sessionId is accepted for API compatibility but not required — see
// negotiation/session-store.ts for why (platform variable-binding issue).
const startSchema = z.object({ sessionId: z.string().optional(), loadId: z.string().min(1) });

negotiationRouter.post("/start", async (req, res) => {
	const parsed = startSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "loadId is required" });

	try {
		const record = await getLoad(config.tms, parsed.data.loadId);
		const maxBuy = Number(record.MAX_BUY);
		const loadboardRate = Number(record.RATE);
		if (!Number.isFinite(maxBuy)) {
			// This token isn't flagged for MAX_BUY visibility, or the field was
			// absent — we cannot safely negotiate without a ceiling.
			return res.status(422).json({ error: "no_ceiling_available_for_load" });
		}

		const state = openingOffer(loadboardRate, maxBuy);
		startSession(parsed.data.sessionId, parsed.data.loadId, maxBuy, state);

		res.json({ offerRate: state.currentOffer }); // maxBuy never leaves this function
	} catch (err) {
		console.error("Negotiation start failed", err);
		res.status(502).json({ error: "negotiation_unavailable" });
	}
});

const respondSchema = z.object({
	sessionId: z.string().optional(),
	carrierAsk: z.coerce.number().positive(),
});

negotiationRouter.post("/respond", (req, res) => {
	const parsed = respondSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "a positive carrierAsk is required" });

	const session = getSession(parsed.data.sessionId);
	if (!session) return res.status(404).json({ error: "no_active_negotiation" });

	try {
		const decision = evaluateCarrierAsk(parsed.data.carrierAsk, session.maxBuy, session.state);

		if (decision.action === "accept") {
			endSession(parsed.data.sessionId);
			return res.json({ action: "accept", agreedRate: decision.agreedRate });
		}
		if (decision.action === "close_failed") {
			endSession(parsed.data.sessionId);
			return res.json({ action: "close_failed" });
		}

		updateSessionState(parsed.data.sessionId, decision.state);
		res.json({ action: "counter", offerRate: decision.offerRate, round: decision.round });
	} catch (err) {
		if (err instanceof RangeError) {
			return res.status(400).json({ error: err.message });
		}
		throw err;
	}
});
