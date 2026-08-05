import { connect, type Socket } from "node:net";
import {
	LINE_TERMINATOR,
	MAX_FRAME_BYTES,
	buildRequestLine,
	parseErrorLine,
	parseRecordLine,
	type TmsRecord,
} from "./protocol.js";

export interface TmsClientConfig {
	host: string;
	port: number;
	authToken: string;
	/** Client-side read timeout per attempt. Must stay well under the server's
	 * 30s idle timeout so a stuck/faulted connection fails fast and can be retried. */
	requestTimeoutMs?: number;
}

/** Distinguishes documented fault-injection behavior (retry-eligible) from
 * legitimate protocol-level ERR responses (business answers, not faults). */
export type TmsFaultKind = "timeout" | "partial_response" | "malformed" | "connection_error";

export class TmsFaultError extends Error {
	constructor(
		public readonly kind: TmsFaultKind,
		message: string,
	) {
		super(message);
		this.name = "TmsFaultError";
	}
}

/** A real, well-formed ERR response from the server (e.g. UNKNOWN_LOAD, INVALID_RATE). */
export class TmsProtocolError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "TmsProtocolError";
	}
}

/**
 * Sends a single request over a fresh TCP connection (the protocol mandates
 * one request per connection — no reuse) and parses the response.
 *
 * Fault-injection defense, per spec/faults/:
 * - Timeout (no bytes at all): client-side timer shorter than server's 30s idle close.
 * - Partial response (socket closes before an END/ERR line is seen): treated as fault.
 * - Malformed response (line exceeds max frame size, or otherwise unparseable
 *   in a way that can't be recovered): treated as fault.
 * - Delayed termination (server holds the socket open after a complete response):
 *   defended against by NOT waiting for socket close/end — we resolve and
 *   destroy the socket ourselves the instant we see END or an ERR line.
 */
export function sendTmsRequest(
	config: TmsClientConfig,
	command: string,
	fields: Record<string, string | number>,
): Promise<TmsRecord[]> {
	const requestTimeoutMs = config.requestTimeoutMs ?? 8000;

	return new Promise((resolve, reject) => {
		let socket: Socket;
		let buffer = "";
		const records: TmsRecord[] = [];
		let settled = false;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			fn();
		};

		const timer = setTimeout(() => {
			finish(() =>
				reject(new TmsFaultError("timeout", `No complete response within ${requestTimeoutMs}ms`)),
			);
		}, requestTimeoutMs);

		socket = connect(config.port, config.host, () => {
			socket.write(buildRequestLine(command, config.authToken, fields));
		});

		socket.on("data", (chunk) => {
			buffer += chunk.toString("ascii");

			if (buffer.length > MAX_FRAME_BYTES) {
				finish(() =>
					reject(new TmsFaultError("malformed", "Response exceeded max frame size without a terminator")),
				);
				return;
			}

			let idx: number;
			while ((idx = buffer.indexOf(LINE_TERMINATOR)) !== -1) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + LINE_TERMINATOR.length);

				if (line === "END") {
					finish(() => resolve(records));
					return;
				}

				const err = parseErrorLine(line);
				if (err) {
					finish(() => reject(new TmsProtocolError(err.code, err.message)));
					return;
				}

				records.push(parseRecordLine(line));
			}
		});

		socket.on("error", () => {
			finish(() => reject(new TmsFaultError("connection_error", "Socket error")));
		});

		socket.on("close", () => {
			// Socket closed before we saw END or ERR — either a genuine partial
			// response fault, or (rarely) the connection_error path already handled it.
			finish(() =>
				reject(new TmsFaultError("partial_response", "Connection closed before a terminator line")),
			);
		});
	});
}

/**
 * Retry wrapper for the documented fault categories. Business-level ERR
 * responses (TmsProtocolError) are real answers and are never retried.
 *
 * LOAD_BOOK is idempotency-aware: per spec, a token's view of a load is
 * monotonic — once this token has booked a load, repeat attempts return
 * ALREADY_BOOKED rather than re-booking. So on an ambiguous fault (we sent
 * the request but never confirmed the response), it's safe to retry the
 * identical booking; if it turns out we'd already succeeded, the retry
 * surfaces as ALREADY_BOOKED, which callers should treat as success, not failure.
 */
export async function withFaultRetry<T>(
	fn: () => Promise<T>,
	opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
	const maxAttempts = opts.maxAttempts ?? 4;
	const baseDelayMs = opts.baseDelayMs ?? 250;

	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (!(err instanceof TmsFaultError)) throw err; // real ERR — don't retry
			lastError = err;
			if (attempt < maxAttempts) {
				await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
			}
		}
	}
	throw lastError;
}
