import "dotenv/config";
import { debugEcho, getLoad, searchLoads, bookLoad } from "../src/tms/operations.js";
import type { TmsClientConfig } from "../src/tms/client.js";

const config: TmsClientConfig = {
	host: process.env.TMS_HOST!,
	port: Number(process.env.TMS_PORT),
	authToken: process.env.TMS_AUTH_TOKEN!,
};

async function main() {
	console.log("--- DEBUG_ECHO ---");
	console.log(await debugEcho(config, "smoke-test"));

	console.log("--- LOAD_QUERY (GA -> TX, DRY_VAN) ---");
	const results = await searchLoads(config, { origState: "GA", destState: "TX", eqtype: "DRY_VAN", maxResults: 5 });
	console.log(results);

	if (results[0]?.LOAD_ID) {
		console.log("--- LOAD_GET ---");
		const detail = await getLoad(config, results[0].LOAD_ID);
		console.log(detail);
	}
}

main().catch((err) => {
	console.error("SMOKE TEST FAILED:", err);
	process.exit(1);
});
