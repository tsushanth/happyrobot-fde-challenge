import "dotenv/config";
import { searchLoads } from "../src/tms/operations.js";
import type { TmsClientConfig } from "../src/tms/client.js";

const config: TmsClientConfig = {
	host: process.env.TMS_HOST!,
	port: Number(process.env.TMS_PORT),
	authToken: process.env.TMS_AUTH_TOKEN!,
};

async function main() {
	for (const eq of ["DRY_VAN", "REEFER", "FLATBED", "VAN", "FTL"]) {
		const r = await searchLoads(config, { eqtype: eq, maxResults: 5 });
		console.log(eq, "->", r.length, "results", r[0] ?? "");
	}
	console.log("no eqtype, GA origin ->");
	console.log(await searchLoads(config, { origState: "GA", maxResults: 10 }));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
