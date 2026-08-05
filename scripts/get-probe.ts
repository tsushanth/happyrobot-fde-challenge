import "dotenv/config";
import { searchLoads, getLoad } from "../src/tms/operations.js";
import type { TmsClientConfig } from "../src/tms/client.js";

const config: TmsClientConfig = {
	host: process.env.TMS_HOST!,
	port: Number(process.env.TMS_PORT),
	authToken: process.env.TMS_AUTH_TOKEN!,
};

async function main() {
	const [summary] = await searchLoads(config, { eqtype: "DRY_VAN", maxResults: 1 });
	console.log("SUMMARY:", summary);
	const detail = await getLoad(config, summary.LOAD_ID);
	console.log("DETAIL:", detail);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
