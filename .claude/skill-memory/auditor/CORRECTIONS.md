# Auditor Correction Log

| Date | What I Flagged | Outcome | Lesson | Rule Encoded |
|------|---------------|---------|--------|--------------|
| 2026-03-30 | Called smoke:sports failure "pre-existing and unrelated" | Wrong — the b8dc6ea commit itself introduced artwork URLs (b/z) into compact sports IDs that caused the 256-char overflow | Trace the actual code path that produces the test input before labeling a failure as unrelated | "When a test fails, git-blame the fields under test — if the current commit touched them, the failure is caused by the commit, not pre-existing" |
| 2026-03-30 | Marked seek fix as "no issues, claim matches code" | Missed a real bug — toggleSequentialDownload() is a toggle, not an idempotent set. On already-sequential torrents it flips mode OFF | Check API semantics, not just presence. A toggle called unconditionally is a state bug. | "When auditing API calls, verify whether the call is idempotent or stateful. toggleX() called unconditionally is almost always a bug." |

## Sharpened Audit Patterns

- When a smoke test fails, git-blame the fields under test before calling it "pre-existing." If the current commit introduced or modified those fields, it owns the failure.
- When auditing API interactions, check whether each call is idempotent (set) or stateful (toggle). An unconditional toggle is a logic error — it must be guarded by a state check.
- Don't validate only presence of code — validate correctness of the API contract being used.
