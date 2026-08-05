/**
 * Wire-level framing for the HappyRobot Legacy TMS protocol.
 * Spec: https://fde-challenge-candidate-handbook-production.up.railway.app/spec/
 *
 * One TCP connection per request. ASCII, \r\n-terminated lines, `|`-delimited
 * KEY:VALUE fields. Success = N record lines + "END". Error = single "ERR|..." line.
 */

export const MAX_FRAME_BYTES = 4096;
export const LINE_TERMINATOR = "\r\n";

export interface TmsRecord {
	[key: string]: string;
}

export interface TmsErrorPayload {
	code: string;
	message: string;
}

export function buildRequestLine(
	command: string,
	authToken: string,
	fields: Record<string, string | number>,
): string {
	const parts = [`CMD:${command}`, `AUTH:${authToken}`];
	for (const [key, value] of Object.entries(fields)) {
		const str = String(value);
		if (str.includes("|") || str.includes("\r") || str.includes("\n")) {
			throw new Error(`Field ${key} value contains a reserved character (| or CRLF)`);
		}
		parts.push(`${key.toUpperCase()}:${str}`);
	}
	return parts.join("|") + LINE_TERMINATOR;
}

/**
 * Parses one response line into a record.
 *
 * Fields are pipe-delimited, so fixed-width right-padding within a value is
 * cosmetic — trimEnd() recovers the real value without needing to know the
 * declared width (the spec explicitly says widths aren't enumerated and must
 * be "counted from samples," which is fragile; delimiter-based parsing sidesteps
 * that entirely). NOTES intentionally trims down to "" when blank per spec notes.
 */
export function parseRecordLine(line: string): TmsRecord {
	const record: TmsRecord = {};
	for (const chunk of line.split("|")) {
		const idx = chunk.indexOf(":");
		if (idx === -1) continue; // tolerate stray/malformed chunks rather than throw
		const key = chunk.slice(0, idx);
		const value = chunk.slice(idx + 1).trimEnd();
		record[key] = value;
	}
	return record;
}

export function parseErrorLine(line: string): TmsErrorPayload | null {
	if (!line.startsWith("ERR|")) return null;
	const record = parseRecordLine(line.slice(4));
	return { code: record.CODE ?? "UNKNOWN", message: record.MSG ?? "" };
}
