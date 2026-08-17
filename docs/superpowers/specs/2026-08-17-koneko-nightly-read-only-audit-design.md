# Koneko Nightly Read-Only Audit Design

## Goal

At 20:00 Japan Standard Time every day, deterministically read the complete public catalogues for Koneko breeder accounts `c995680` and `d696506`, compare them with Fuluck's public kitten API, and publish an exact, reviewable drift result without modifying either system.

This is the first, semi-automatic phase. A detected difference creates an approval package for a later, separately authorised Fuluck update. The audit itself never writes production data.

## Chosen approach

Use a read-only GitHub Actions workflow scheduled at `0 11 * * *` UTC, equivalent to 20:00 JST, plus a manual dispatch trigger. A deterministic Node.js crawler and comparator perform the work without Codex, Grok, Cursor, or any other language-model call.

This is preferred over a Mac-only scheduler because it does not depend on a laptop being awake and produces a durable run receipt, job summary, and downloadable artifact. It is preferred over a model-led browser agent because inventory identity, pagination, statuses, amounts, and media ordering are exact data-processing tasks. If Koneko later blocks GitHub-hosted network traffic, the workflow must report `BLOCKED`; a separately reviewed local-browser runner may then replace only the transport layer without changing validation or diff semantics.

## Scope and authority

- Source direction is fixed: two Koneko accounts to Fuluck.
- Koneko access is public, anonymous, and GET-only. The workflow receives no Koneko username, password, cookie, or browser profile.
- Fuluck access uses only the public `/api/kittens` endpoint and the public Japanese, English, and Chinese kitten detail pages. The workflow receives no Fuluck administrator password.
- The workflow must not call any Koneko mutation, customer-message, LINE, booking, contract, or reservation endpoint.
- The workflow must not call any Fuluck administrator, bulk, item-write, upload, deletion, deployment, regeneration, or repository-write endpoint.
- The workflow has GitHub `contents: read` permission only. It may write the current Actions run summary and upload an ephemeral audit artifact, but it must not commit or push files.
- Phase one does not automatically update Fuluck. Every production write remains a separate owner-approved action.

## Components

### Public catalogue crawler

The crawler has a fixed allowlist containing only `www.koneko-breeder.com` and the two breeder account IDs. It fetches catalogue pages sequentially with bounded timeouts, response-size limits, a low request rate, and a stable descriptive user agent.

For each account it follows the site's observed pagination until the explicit final page. It records a page receipt containing the requested page number, response status, content type, declared catalogue total, visible card count, extracted breeder IDs, whether a next-page control exists, and a SHA-256 digest of the response. It rejects redirects outside the allowlist, non-HTML responses, challenge/interstitial pages, repeated pages, pagination gaps, duplicate breeder IDs, an inconsistent declared total, or an unrecognised status.

The accepted Koneko status map is:

- `販売中` to `available`;
- `商談中` and `事前成約申請` to `reserved`;
- `成約済み` and `販売終了` to `sold`;
- `準備中` is recorded but is not considered public active inventory.

After complete list pagination, the crawler reads every active kitten detail page and extracts the exact breeder ID, account ID, status, price, birthday, breed, colour, gender, parents, ordered full-size photo URLs, canonical YouTube video ID, short Japanese appeal, and long Japanese introduction. Detail identity must match the list identity. Missing required facts, zero photos, invalid media URLs, or conflicting list/detail values make the entire run `BLOCKED`.

### Fuluck API, rendered-site reader, and deterministic comparator

The Fuluck reader first fetches the public catalogue with the same domain, timeout, response-size, and content-type protections. It requires an array of unique, non-empty breeder IDs and valid public record shapes. The production public API does not currently expose long introductions or translated text, so every source-active breeder ID must also be checked against its Japanese, English, and Chinese public detail URL. Those rendered pages are the customer-visible target for ordered photos, canonical video ID, Japanese short/long text, and the presence of English and Chinese short/long text. An authoritative 404 is catalogue drift; a timeout, challenge, malformed page, cross-linked identity, or other ambiguous response makes the run `BLOCKED`.

The comparator joins Koneko, the Fuluck API, and rendered pages only by exact breeder ID. It emits these machine-readable drift classes:

- `source_active_missing_target`;
- `source_active_target_inactive`;
- `source_inactive_target_active`;
- `status_mismatch`;
- `fact_mismatch` for price, birthday, breed, colour, gender, or parents;
- `photo_mismatch` for ordered URL count or sequence;
- `video_mismatch` using canonical YouTube IDs;
- `japanese_text_mismatch` for short appeal or long introduction;
- `rendered_page_missing` when a required language detail page is absent;
- `translation_missing` when an active target lacks either Chinese or English short/long text.

Koneko has no authoritative Chinese or English copy, so the audit must not invent translations or claim that translated wording is source-equal. A changed Japanese text marks the existing translations as requiring review.

The result is `EXACT` only when both accounts are completely proven and no drift exists. Any catalogue difference is `DRIFT`. Any incomplete pagination, parser uncertainty, network failure, invalid response, duplicate identity, or schema failure is `BLOCKED`. The tool never guesses around a blocked condition.

### Receipts and notification surface

Every run writes a compact Markdown summary to the GitHub Actions job summary and uploads one JSON audit artifact retained for 14 days. The summary contains:

- observed time in JST;
- result: `EXACT`, `DRIFT`, or `BLOCKED`;
- per-account page, declared-total, unique-ID, active, reserved, and inactive counts;
- Fuluck total and status counts;
- every exact breeder ID and field-level difference;
- checked source and target URLs;
- a prominent `NO WRITE PERFORMED` statement.

The artifact contains receipts, normalized field values needed to reproduce the diff, and hashes for long text. It excludes credentials, cookies, response headers containing identifiers, and full HTML. The public job summary must not print full kitten introductions.

The scheduled workflow succeeds for `EXACT` and fails visibly for `DRIFT` or `BLOCKED`, while an `always()` artifact step preserves the evidence. A network or parser failure must never be reported as catalogue equality.

## Model and quota policy

The nightly audit uses zero language-model calls. This makes an unchanged day consume no Codex, Grok, or Cursor quota and avoids model-dependent inventory decisions.

If a later approved Fuluck update needs new Chinese or English text, a separate translation step may batch only the changed Japanese fields through a low-cost Cursor CLI model in read-only/sandboxed JSON mode. Deterministic schema, identity, gender, and fact checks must validate that output. Grok may be used only as an optional second opinion for a genuinely ambiguous text case. Neither CLI receives account credentials or production write access.

## Error handling and operational limits

- One run has a single-instance concurrency lock and a bounded wall-clock timeout.
- Fetches use limited retries only for transient GET failures; parsing or validation failures are not retried as if they were network failures.
- The crawler stops before comparing when either account lacks complete pagination receipts.
- There is no carry-forward of an older successful snapshot and no fallback to historical counts.
- The first implementation may tune selectors against current public HTML, but all parser assumptions must be represented by fixtures and explicit invariant checks.
- GitHub cron can start later than 20:00 JST; the receipt records the actual observation time and must not claim an exact start time.
- No diff class can trigger an automatic update, regeneration, deployment, deletion, or customer communication in phase one.

## Testing

Unit fixtures cover both account layouts, multiple pages, each known Koneko status, HTML escaping, duplicate IDs, inconsistent totals, repeated pages, missing next-page receipts, challenge pages, malformed details, photo ordering, and YouTube URL canonicalisation.

Comparator tests cover every drift class, exact equality, Japanese-change translation review, and the rule that missing or blocked source evidence cannot become `EXACT`.

Workflow contract tests require the exact JST-equivalent schedule, manual dispatch, `contents: read`, absence of secrets and write commands, artifact preservation, bounded execution, and zero model/CLI invocations.

Before enabling the schedule, one manual read-only run must prove both accounts' complete pagination, produce a valid receipt artifact, and compare against the live Fuluck public API and all required customer-visible detail pages. Enabling the scheduled workflow requires normal pull-request review and passing repository quality checks, but no Worker deployment or Fuluck data change.

## Acceptance criteria

- A manual GitHub Actions run completes using public GET requests only and produces a schema-valid audit artifact.
- Both breeder accounts have complete, internally consistent pagination receipts and unique breeder IDs, or the run is visibly `BLOCKED`.
- Exact breeder-ID and field-level differences are reported without inference from appearance or wording.
- The workflow runs daily on the `0 11 * * *` UTC schedule and can also be dispatched manually.
- The workflow has no secrets, no production write path, no model invocation, and no repository write permission.
- `EXACT` means the validated source and Fuluck projections match; `DRIFT` and `BLOCKED` can never be silently converted to success.
- Existing full repository tests and the new focused tests pass before integration.

## Deferred work

The following require a separate design and explicit production authority: applying approved changes to Fuluck, translating new text, regenerating static pages after a write, notifying a phone or external chat service, automatically repairing drift, and moving from approval-gated operation to restricted unattended writes.
