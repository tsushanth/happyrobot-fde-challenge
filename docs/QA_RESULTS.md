# QA Results — Inbound Carrier Sales Automation

## Northstar KPIs (proposed, to configure in HappyRobot Northstars)

| KPI | Target | Why it matters |
|---|---|---|
| Call answer rate | 100% (no missed calls) | Directly addresses the "missed calls during peak hours" problem in the brief |
| FMCSA + OTP verification completion rate | ≥ 95% of calls that reach verification | Compliance-gated step; low completion signals a broken/confusing flow |
| Rate ceiling adherence | 100% — zero bookings above `MAX_BUY` | Non-negotiable; a single violation is a margin-leakage/compliance failure |
| Negotiation resolution within 3 rounds | ≥ 90% resolved (booked or cleanly closed) by round 3 | Matches the hard 3-round cap; call length control |
| Audit trail completeness | 100% of calls logged with outcome | Directly addresses the "no audit trail" problem in the brief |

## Automated test suite

17 unit tests, `npm test` (Vitest), covering standard, edge, and adversarial cases for the two
highest-risk logic modules (rate negotiation, OTP). Full run:

```
Test Files  2 passed (2)
     Tests  17 passed (17)
```

### Negotiation engine (`tests/negotiation.test.ts`)

- **Standard**: accepts within ceiling; counters and never exceeds `MAX_BUY`; final round offers
  exactly `MAX_BUY`; closes failed after 3 rounds with no agreement.
- **Edge**: accepts an ask exactly equal to `MAX_BUY`; opening offer never exceeds `MAX_BUY` even when
  the posted loadboard rate is higher; `MAX_BUY` of 1 doesn't go non-positive.
- **Adversarial**: a negative or non-finite carrier ask is rejected outright (`RangeError`), rather than
  silently "accepted" at a negative rate. **This test caught a real bug during development** — the
  initial implementation happily accepted negative asks because `-100 <= maxBuy` is trivially true. Fixed
  by validating input at the top of `evaluateCarrierAsk` rather than relying on callers to pre-validate.
  Also verified: counter offers stay bounded to `MAX_BUY` even against a wildly oversized ask
  (1,000,000) across all 3 rounds.

### OTP flow (`tests/otp.test.ts`)

- **Standard**: correct code verifies; codes are single-use (a second attempt after success fails).
- **Edge**: verifying a session with no OTP ever issued; expiry after the TTL window (fake timers).
- **Adversarial**: brute-force lockout after 3 wrong guesses — even the *correct* code stops working
  once locked out (session invalidated, not just attempt-limited); a battery of plausible
  social-engineering/bypass strings (`"BYPASS"`, `"000000"`, empty string, `"null"`, `"undefined"`,
  partial-match prefix of the real code) all correctly fail; confirmed the generated code is never
  returned from `issueOtp` — it only ever reaches the delivery channel, never the caller.

## Live integration verification (manual, against the real sandbox)

Run against the deployed service (`https://happyrobot-fde-challenge.fly.dev`) and the live TMS/FMCSA
sandbox, not mocks:

| Check | Result |
|---|---|
| `DEBUG_ECHO` round-trip | ✅ `FIELDS_PARSED` matched sent field count |
| `LOAD_QUERY` across DRY_VAN / REEFER / FLATBED | ✅ Real records returned; confirmed field set is richer than doc examples (`DEST_*`, `RATE`, `MILES`, `STATUS`) |
| `LOAD_QUERY` with an unrecognized `EQTYPE` (e.g. `"VAN"`) | ✅ Discovered undocumented behavior: server returns `MISSING_FIELD`, not "no records" as the spec's notes claimed — handled correctly as a real `TmsProtocolError`, not retried |
| `LOAD_GET` full detail | ✅ Confirmed `MAX_BUY` is present on this token (flagged) and is stripped before any HTTP response leaves the service |
| FMCSA lookup — active-authority carrier (MC 1515, Greyhound Lines) | ✅ `passed: true` |
| FMCSA lookup — lapsed-authority carrier (MC 123456) | ✅ `passed: false`, `authorityActive: false` |
| FMCSA lookup — nonexistent MC | ✅ Clean `not_found` handling, no crash |
| Full flow: verify → OTP → search → negotiate (counter then accept) → book → log | ✅ Real booking committed (`LOAD_ID: LD00516`, `BOOKING_REF: K4H3YY58YSHHHPQK`), rate stayed within the hidden ceiling throughout, call outcome logged |
| Containerized deploy (`docker build && docker run --env-file .env`) | ✅ Caught and fixed a real bug: `dotenv` was installed as a devDependency, so the production image's `npm install --omit=dev` stripped it, crashing on boot (`ERR_MODULE_NOT_FOUND`). Fixed by moving it to `dependencies`; reverified clean boot + working requests from the container |

## Known gaps / not yet exercised

- No load-testing of the TMS client's retry/backoff behavior under sustained fault injection (only
  incidentally observed during normal search/get/book calls — no faults were hit in that window).
- OTP delivery channel is a console-logging stub, not a real email/SMS provider — verified the
  interface contract and single-use/lockout logic, not actual message delivery.
- The HappyRobot voice workflow itself (turn-taking, conversational framing of offers/counters) is
  configured in the platform UI and evaluated separately via the platform's own Custom Tests /
  Adversarial tooling, not by this repo's test suite.
