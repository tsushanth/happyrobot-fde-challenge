import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getLoad, searchLoads } from "../tms/operations.js";

export const loadsRouter = Router();

const searchSchema = z.object({
	origCity: z.string().optional(),
	origState: z.string().optional(),
	origZip: z.string().optional(),
	destCity: z.string().optional(),
	destState: z.string().optional(),
	destZip: z.string().optional(),
	eqtype: z.string().optional(),
	maxResults: z.number().int().positive().max(20).optional(),
});

loadsRouter.post("/search", async (req, res) => {
	const parsed = searchSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

	try {
		const results = await searchLoads(config.tms, parsed.data);
		// Summary fields only — RATE here is the posted loadboard rate, safe to
		// speak aloud; MAX_BUY is never part of the LOAD_QUERY response shape.
		res.json({
			loads: results.map((r) => ({
				loadId: r.LOAD_ID,
				originCity: r.ORIG_CITY,
				originState: r.ORIG_STATE,
				destCity: r.DEST_CITY,
				destState: r.DEST_STATE,
				pickupDatetime: r.PICKUP_DT,
				equipmentType: r.EQTYPE,
				postedRate: r.RATE,
				miles: r.MILES,
			})),
		});
	} catch (err) {
		console.error("Load search failed", err);
		res.status(502).json({ error: "load_search_unavailable" });
	}
});

const getSchema = z.object({ loadId: z.string().min(1) });

loadsRouter.post("/get", async (req, res) => {
	const parsed = getSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "loadId is required" });

	try {
		const record = await getLoad(config.tms, parsed.data.loadId);
		// MAX_BUY is deliberately omitted here — see routes/negotiation.ts for
		// the only code path allowed to read it.
		const { MAX_BUY: _omit, ...safe } = record;
		res.json({ load: safe });
	} catch (err) {
		console.error("Load detail fetch failed", err);
		res.status(502).json({ error: "load_detail_unavailable" });
	}
});
