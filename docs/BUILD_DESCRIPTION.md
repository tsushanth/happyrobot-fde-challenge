# Build Description — Inbound Carrier Sales Automation

**Prepared for:** HappyRobot Logistics IT & Business review
**Repo:** https://github.com/tsushanth/happyrobot-fde-challenge (private)
**Backend:** https://happyrobot-fde-challenge.fly.dev

## Summary

This solution automates the inbound carrier qualification and load-matching call: a carrier calls in,
gets verified (FMCSA authority + OTP), is matched to an open load, negotiates a rate within a hidden
ceiling, and is booked or handed off — without a dispatcher on the first leg of the call.

The voice/call layer runs on the HappyRobot platform (workflow + Twin + Apps). This repo is the backend
service the workflow calls out to for everything that touches external systems: the legacy TMS, FMCSA,
OTP delivery, and rate negotiation logic.

## Architecture

```
Carrier call → HappyRobot voice workflow → this backend (Fly.io) → {
  Legacy TMS (raw TCP, tramway.proxy.rlwy.net:17159)
  FMCSA QCMobile API (public REST)
  OTP store (in-memory, single-use, rate-limited)
}
```

## Why a backend service, not workflow-native logic for everything

Two integrations are impossible to express as simple HTTP/webhook calls the workflow builder handles
natively:

1. **The legacy TMS speaks raw TCP**, not REST — a custom line-oriented protocol (`CMD:...|AUTH:...\r\n`)
   requiring a real socket client with connection-per-request semantics and defensive fault handling
   (see below). This has to live in code.
2. **Rate negotiation must never leak `MAX_BUY`** to the carrier, directly or indirectly. Centralizing
   the negotiation state machine server-side, where `MAX_BUY` is fetched, used, and immediately discarded
   without ever appearing in any HTTP response, is the only way to make that guarantee mechanically
   enforceable rather than relying on prompt discipline in the voice agent.

## Key design decisions

### TMS adapter: fault-tolerant by construction, not by retry alone

The protocol spec documents four unsignaled fault categories the non-prod instance injects on
operational commands (timeout, partial response, malformed response, delayed termination) — the
implementer is expected to detect these from wire behavior alone, since there's no fault code or marker.

The client (`src/tms/client.ts`):
- Opens one fresh TCP connection per request (no reuse — the protocol doesn't support it)
- Runs a client-side timeout shorter than the server's 30s idle timeout, so a stuck connection fails
  fast instead of hanging the caller
- Resolves the instant it sees an `END` or `ERR` line — it does **not** wait for the socket to close,
  which defeats the "delayed termination" fault (server holds the connection open after a complete
  response)
- Classifies failures into `TmsFaultError` (retry-eligible: timeout/partial/malformed/connection error)
  vs. `TmsProtocolError` (a real business answer like `UNKNOWN_LOAD` — never retried)
- Retries fault-classified failures with exponential backoff, capped at 4 attempts

### Booking is idempotency-safe under retry

`LOAD_BOOK` has side effects. Per the spec, a token's view of a load is monotonic — once *this* token
has booked a load, repeat attempts return `ALREADY_BOOKED` rather than re-booking or erroring in a way
that implies failure. So on an ambiguous fault (request sent, response lost), it's safe to retry the
identical booking: if it had actually succeeded, the retry surfaces `ALREADY_BOOKED`, which the code
treats as a successful outcome rather than a failure — avoiding both double-booking and false negatives.

### Field parsing sidesteps the "fixed-width" ambiguity

The spec says field values are fixed-width, space-padded, but explicitly declines to enumerate the
widths ("counting from samples is the recommended approach") — fragile, since sample formatting in a
PDF isn't guaranteed to preserve exact byte counts. Because every response is also `|`-delimited,
parsing splits on `|` first and right-trims each value; the padding becomes cosmetic and width-counting
is unnecessary. Verified against the live server, where field sets turned out richer than the doc's
truncated examples showed (e.g. `LOAD_QUERY` returns `DEST_*`/`RATE`/`MILES`/`STATUS`, not just
`ORIG_*` as the sample transcripts implied) — confirms the delimiter-based approach is robust to
exactly this kind of doc/wire drift.

### OTP: single-use, rate-limited, no bypass path

Compliance hard requirement: OTP must resist social engineering under any framing. The verify function
has no admin override, no wildcard code, and locks out after 3 wrong attempts (session invalidated
entirely, including the correct code). Adversarial tests cover brute-force lockout and a battery of
plausible bypass-attempt strings.

### Rate negotiation

Opens below `MAX_BUY` (85% of ceiling, or the posted loadboard rate if lower) to leave room to
negotiate down. Accepts immediately once the carrier's ask is within `MAX_BUY`. Otherwise counters,
escalating toward the ceiling, with the third and final round offered as a firm `MAX_BUY` (never
labeled as "our maximum" — just the final counteroffer). No agreement after 3 rounds closes the
negotiation as failed; the workflow is expected to close professionally and **not** transfer, per spec.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /carrier/verify` | FMCSA authority check by MC number |
| `POST /otp/send` | Issues + delivers a one-time code (dev channel logs to console; swap in Twilio/SendGrid for production) |
| `POST /otp/verify` | Verifies a submitted code |
| `POST /loads/search` | Searches the open board (sanitized — no `MAX_BUY`) |
| `POST /loads/get` | Full load detail (sanitized — no `MAX_BUY`) |
| `POST /negotiation/start` | Opens a negotiation session for a load (returns opening offer only) |
| `POST /negotiation/respond` | Evaluates a carrier counter-ask, returns accept/counter/close |
| `POST /booking/confirm` | Commits the booking |
| `POST /booking/handoff` | Mocked senior-rep transfer (live transfer out of scope per brief — "transfers do not work with web calls") |
| `GET /log` | Call-outcome log (supplementary to HappyRobot-native Twin capture) |

## What's intentionally out of scope / mocked

- **Senior rep handoff** — mocked per the brief; no live transfer target exists in this environment.
- **OTP delivery channel** — logs to console in this environment rather than sending real email/SMS,
  since no provider credentials were issued for the challenge. The `OtpChannel` interface is the
  production contract; swapping in Twilio/SendGrid is a config change, not a code change.
- **Primary call-activity audit trail** — per the brief, this should be HappyRobot-native (Twin). The
  `GET /log` endpoint here is a backend-owned backstop for local debugging, not a replacement.

## Deployment

Single-command deploy, containerized:

```
docker build -t happyrobot-fde-challenge .
docker run -p 8080:8080 --env-file .env happyrobot-fde-challenge
```

Currently deployed to Fly.io at https://happyrobot-fde-challenge.fly.dev.
