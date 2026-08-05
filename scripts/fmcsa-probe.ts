import "dotenv/config";
import { verifyCarrierAuthority } from "../src/fmcsa/client.js";

const webKey = process.env.FMCSA_WEB_KEY!;

async function main() {
	// Known real carriers for sanity-checking the API wiring.
	for (const mc of ["1515", "123456", "999999999"]) {
		try {
			const result = await verifyCarrierAuthority(webKey, mc);
			console.log(mc, "->", result);
		} catch (err) {
			console.log(mc, "-> ERROR", (err as Error).message);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
