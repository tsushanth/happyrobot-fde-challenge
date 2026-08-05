import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { FmcsaLookupError, verifyCarrierAuthority } from "../fmcsa/client.js";

export const carrierRouter = Router();

const verifySchema = z.object({ mcNumber: z.string().min(1) });

carrierRouter.post("/verify", async (req, res) => {
	const parsed = verifySchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: "mcNumber is required" });
	}

	try {
		const result = await verifyCarrierAuthority(config.fmcsaWebKey, parsed.data.mcNumber);
		res.json({
			passed: result.authorityActive && result.allowedToOperate,
			carrierName: result.legalName,
			dotNumber: result.dotNumber,
		});
	} catch (err) {
		if (err instanceof FmcsaLookupError && err.reason === "not_found") {
			return res.json({ passed: false, carrierName: null, dotNumber: null, reason: "not_found" });
		}
		console.error("FMCSA lookup failed", err);
		res.status(502).json({ error: "carrier_verification_unavailable" });
	}
});
