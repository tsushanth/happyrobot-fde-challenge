import type { OtpChannel } from "./service.js";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Real email delivery via Resend. Falls back to console logging if no API
 * key is configured, so local dev without a key still works. */
export function createResendOtpChannel(apiKey: string, from = "onboarding@resend.dev"): OtpChannel {
	return {
		async send(destination, code) {
			const resp = await fetch(RESEND_API_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from,
					to: destination,
					subject: "Your verification code",
					text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes.`,
				}),
			});

			if (!resp.ok) {
				const body = await resp.text();
				throw new Error(`Resend send failed (${resp.status}): ${body}`);
			}
		},
	};
}
