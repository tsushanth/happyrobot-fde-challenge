const FMCSA_BASE_URL = "https://mobile.fmcsa.dot.gov/qc/services/carriers";

export interface CarrierAuthority {
	mcNumber: string;
	dotNumber: string | null;
	legalName: string | null;
	/** True only if the carrier has active common/contract operating authority. */
	authorityActive: boolean;
	allowedToOperate: boolean;
}

export class FmcsaLookupError extends Error {
	constructor(
		public readonly reason: "not_found" | "api_error",
		message: string,
	) {
		super(message);
		this.name = "FmcsaLookupError";
	}
}

/**
 * Looks up a carrier's operating authority by MC (docket) number via FMCSA's
 * public QCMobile API. Dispatcher step 2 in the challenge brief: "verify it
 * against the FMCSA database, check for active operating authority."
 */
export async function verifyCarrierAuthority(
	webKey: string,
	mcNumber: string,
): Promise<CarrierAuthority> {
	const url = `${FMCSA_BASE_URL}/docket-number/${encodeURIComponent(mcNumber)}?webKey=${encodeURIComponent(webKey)}`;

	const resp = await fetch(url);
	if (resp.status === 404) {
		throw new FmcsaLookupError("not_found", `No carrier found for MC ${mcNumber}`);
	}
	if (!resp.ok) {
		throw new FmcsaLookupError("api_error", `FMCSA API returned ${resp.status}`);
	}

	const body = (await resp.json()) as {
		content?: Array<{
			carrier?: {
				dotNumber?: number;
				legalName?: string;
				allowedToOperate?: string;
				commonAuthorityStatus?: string;
				contractAuthorityStatus?: string;
			};
		}>;
	};

	const carrier = body.content?.[0]?.carrier;
	if (!carrier) {
		throw new FmcsaLookupError("not_found", `No carrier found for MC ${mcNumber}`);
	}

	const authorityActive =
		carrier.commonAuthorityStatus === "A" || carrier.contractAuthorityStatus === "A";

	return {
		mcNumber,
		dotNumber: carrier.dotNumber != null ? String(carrier.dotNumber) : null,
		legalName: carrier.legalName ?? null,
		authorityActive,
		allowedToOperate: carrier.allowedToOperate === "Y",
	};
}
