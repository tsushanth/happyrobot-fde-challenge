import express from "express";
import { config } from "./config.js";
import { bookingRouter } from "./routes/booking.js";
import { carrierRouter } from "./routes/carrier.js";
import { loadsRouter } from "./routes/loads.js";
import { logRouter } from "./routes/log.js";
import { negotiationRouter } from "./routes/negotiation.js";
import { otpRouter } from "./routes/otp.js";

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/carrier", carrierRouter);
app.use("/otp", otpRouter);
app.use("/loads", loadsRouter);
app.use("/negotiation", negotiationRouter);
app.use("/booking", bookingRouter);
app.use("/log", logRouter);

app.listen(config.port, () => {
	console.log(`HappyRobot FDE challenge backend listening on :${config.port}`);
});
