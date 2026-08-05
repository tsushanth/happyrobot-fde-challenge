import { TmsProtocolError, sendTmsRequest, withFaultRetry, type TmsClientConfig } from "./client.js";
import type { TmsRecord } from "./protocol.js";

export interface LoadSearchFilters {
	origCity?: string;
	origState?: string;
	origZip?: string;
	destCity?: string;
	destState?: string;
	destZip?: string;
	eqtype?: string;
	maxResults?: number;
}

function filtersToFields(filters: LoadSearchFilters): Record<string, string | number> {
	const fields: Record<string, string | number> = {};
	if (filters.origCity) fields.ORIG_CITY = filters.origCity;
	if (filters.origState) fields.ORIG_STATE = filters.origState;
	if (filters.origZip) fields.ORIG_ZIP = filters.origZip;
	if (filters.destCity) fields.DEST_CITY = filters.destCity;
	if (filters.destState) fields.DEST_STATE = filters.destState;
	if (filters.destZip) fields.DEST_ZIP = filters.destZip;
	if (filters.eqtype) fields.EQTYPE = filters.eqtype;
	if (filters.maxResults) fields.MAX_RESULTS = filters.maxResults;
	return fields;
}

export async function debugEcho(config: TmsClientConfig, msg: string): Promise<TmsRecord[]> {
	// Does not pass through fault injection — connectivity check only, not a
	// health signal for the operational path (LOAD_QUERY/LOAD_GET/LOAD_BOOK).
	return sendTmsRequest(config, "DEBUG_ECHO", { MSG: msg });
}

export async function searchLoads(
	config: TmsClientConfig,
	filters: LoadSearchFilters,
): Promise<TmsRecord[]> {
	const fields = filtersToFields(filters);
	if (Object.keys(fields).length === 0) {
		throw new Error("searchLoads requires at least one filter");
	}
	return withFaultRetry(() => sendTmsRequest(config, "LOAD_QUERY", fields));
}

export async function getLoad(config: TmsClientConfig, loadId: string): Promise<TmsRecord> {
	const [record] = await withFaultRetry(() =>
		sendTmsRequest(config, "LOAD_GET", { LOAD_ID: loadId }),
	);
	return record;
}

export type BookingOutcome =
	| { status: "booked"; bookingRef: string; timestamp: string }
	| { status: "already_booked" };

/**
 * Books a load. Idempotency-safe under retry: if a prior attempt's response
 * was lost to fault injection but the booking actually succeeded server-side,
 * the retry surfaces ALREADY_BOOKED (monotonic per-token per spec) — treated
 * here as a successful outcome, not an error.
 */
export async function bookLoad(
	config: TmsClientConfig,
	loadId: string,
	mcNumber: string,
	agreedRate: number,
): Promise<BookingOutcome> {
	try {
		const [record] = await withFaultRetry(() =>
			sendTmsRequest(config, "LOAD_BOOK", {
				LOAD_ID: loadId,
				MC_NUM: mcNumber,
				AGREED_RATE: agreedRate,
			}),
		);
		return {
			status: "booked",
			bookingRef: record.BOOKING_REF,
			timestamp: record.TIMESTAMP,
		};
	} catch (err) {
		if (err instanceof TmsProtocolError && err.code === "ALREADY_BOOKED") {
			return { status: "already_booked" };
		}
		throw err;
	}
}
