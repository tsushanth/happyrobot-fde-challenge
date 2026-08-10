import "dotenv/config";
import type { TmsClientConfig } from "./tms/client.js";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

export const config = {
	port: Number(process.env.PORT ?? 8080),
	tms: {
		host: requireEnv("TMS_HOST"),
		port: Number(requireEnv("TMS_PORT")),
		authToken: requireEnv("TMS_AUTH_TOKEN"),
	} satisfies TmsClientConfig,
	fmcsaWebKey: requireEnv("FMCSA_WEB_KEY"),
	resendApiKey: process.env.RESEND_API_KEY, // optional — falls back to console logging if unset
	otpFromAddress: process.env.OTP_FROM_ADDRESS ?? "onboarding@resend.dev",
	otpTestEmailOverride: process.env.OTP_TEST_EMAIL_OVERRIDE, // TESTING ONLY, see routes/otp.ts
};
