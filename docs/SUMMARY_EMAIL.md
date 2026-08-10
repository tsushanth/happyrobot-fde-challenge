Subject: Inbound Carrier Sales Automation — Proof of Concept Ready for Review

Hi team,

Following up on our Deployment Strategy session — I've built a working proof of concept for automating your inbound carrier desk, and wanted to walk through what it does and what we'd recommend as next steps.

**What it does today**

A carrier can call in at any time and, without a dispatcher on the line:
- State their MC number and get verified against FMCSA in real time — no active authority, no further conversation
- Confirm their identity with a one-time code sent to their email, resistant to social-engineering attempts to skip it
- Get matched to open loads by lane and equipment type, pulled live from your TMS
- Negotiate a rate — the agent opens below your ceiling and works up to it over up to three rounds, and never discloses that ceiling to the carrier under any framing
- Get booked automatically once a rate is agreed, with the booking written back to your TMS
- Get handed to a senior rep to close out (mocked in this environment — no live transfer target was available to connect to)

**What's under the hood**

The integration layer runs as a small backend service (deployed and live) that bridges the HappyRobot voice agent to your systems: your legacy TMS (a raw TCP protocol with intentional fault injection in the test environment — timeouts, truncated responses, malformed frames — the adapter retries through all of it safely, including idempotent booking so a retried request never double-books), and the public FMCSA carrier-authority API.

**What I'd flag for a production rollout**

- Email OTP is live and working; SMS would need a provider (Twilio/similar) added — same interface, different backend.
- The negotiation and OTP flows currently track state per active call; moving to concurrent multi-line volume would need a small change to how the platform passes a call identifier through to these tools — happy to walk through that.
- Full QA results (standard, edge-case, and adversarial test coverage — including confirming the rate ceiling can't be extracted under any framing) are documented separately and included with this submission.

Repo, workflow link, and walkthrough video are attached/linked separately. Happy to jump on a call to walk through any of this live.

Best,
Sushanth
