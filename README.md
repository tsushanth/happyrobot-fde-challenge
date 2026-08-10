# HappyRobot FDE Challenge — Inbound Carrier Sales Automation

Backend service for a HappyRobot voice agent that automates HappyRobot Logistics' inbound carrier
desk: FMCSA verification, OTP identity confirmation, TMS load search, rate negotiation with a hidden
ceiling, and idempotent booking.

## Links

- **Walkthrough video**: https://youtu.be/thWnRjpNraM
- **Live backend**: https://happyrobot-fde-challenge.fly.dev
- **HappyRobot workflow**: https://platform.happyrobot.ai/deployments/ahngbereeshr
- **Build description** (architecture, design decisions, known limitations): [docs/BUILD_DESCRIPTION.md](docs/BUILD_DESCRIPTION.md)
- **QA results** (northstar KPIs, test coverage, adversarial cases): [docs/QA_RESULTS.md](docs/QA_RESULTS.md)
- **Summary email to the prospect**: [docs/SUMMARY_EMAIL.md](docs/SUMMARY_EMAIL.md)

## What it does

A carrier calls in and, without a dispatcher on the first leg:
1. States their MC number → verified live against FMCSA
2. Confirms identity via a one-time code sent to their email
3. States a lane/equipment preference → matched against open loads on the TMS
4. Negotiates a rate — the agent opens below its ceiling and works up over up to 3 rounds, never
   disclosing that ceiling under any framing
5. Gets booked (idempotent — safe under retry, never double-books) and handed to a senior rep (mocked)

## Running locally

```bash
npm install
cp .env.example .env   # fill in TMS_HOST/PORT/AUTH_TOKEN, FMCSA_WEB_KEY, RESEND_API_KEY
npm run dev
```

## Testing

```bash
npm test
```

17 tests covering standard, edge, and adversarial cases for the negotiation engine and OTP flow
(brute-force lockout, bypass resistance). See [docs/QA_RESULTS.md](docs/QA_RESULTS.md) for full results
and northstar KPIs.

## Deployment

```bash
docker build -t happyrobot-fde-challenge .
docker run -p 8080:8080 --env-file .env happyrobot-fde-challenge
```

Currently deployed to Fly.io — single-command deploy via `flyctl deploy`.

## Project structure

```
src/
  tms/          TCP adapter for the legacy TMS (fault-tolerant, idempotent booking)
  fmcsa/        FMCSA carrier-authority verification client
  otp/          OTP issue/verify (rate-limited, no bypass) + Resend email delivery
  negotiation/  Rate negotiation engine (ceiling never disclosed) + session tracking
  routes/       HTTP endpoints the HappyRobot workflow calls as tools
  audit/        Supplementary call-outcome log (Twin is the primary audit trail)
tests/          Vitest suite — standard/edge/adversarial cases
docs/           Build description, QA results, summary email
scripts/        One-off probes used during development against the live TMS/FMCSA APIs
```

## Known limitations

See the "Known limitation: per-call session correlation" section in
[docs/BUILD_DESCRIPTION.md](docs/BUILD_DESCRIPTION.md) for the one architectural compromise worth
knowing about (session tracking falls back to single-active-call rather than a platform-bound call ID,
due to unreliable variable binding in the workflow builder for renamed tool parameters).
