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

Koneko field evidence is scoped to balanced, actual detail containers rather than the whole document. Facts come only from one visible, non-footer `.petDtlData` containing one `table.gnrTbl`; the observed labels are `猫種`, `毛色(毛質)`, `性別`, `誕生日`, and `アピール<br>ポイント` (with only explicit historical aliases accepted). Breed, colour, gender, and birthday must each have one non-empty row; the appeal row is an observed optional string, so a missing row or empty cell is `''`, while a duplicate or malformed matching row is `BLOCKED`. The target selectors are exact ID/class selectors, not hard-coded `div` selectors; the compound video selector requires both whitespace-delimited class tokens. Each opening tag is tokenized once into its first values, all occurrences, and a malformed flag. A recoverable target ID/class occurrence is still recorded when that tag is malformed, so duplicate, illegal, incomplete, or valid-plus-malformed target openings block rather than becoming absence; a tag with no recoverable target selector supplies no target evidence. The walker records every target candidate when it opens; an unclosed, mismatched, self-closing, malformed, or additional exact candidate blocks even if another candidate closed correctly. Unrelated malformed outer markup cannot supply, replace, or invalidate an already locally balanced evidence container.

Parents come only from one visible, non-footer `#parentInfo`: an absent region records `papa: ''` and `mama: ''`; a present region must prove one father and one mother item, each through its corresponding `li.parentName > strong`. There is no whole-page fallback. Video comes only from one visible, non-footer `.movieGalleryCnt.youtube`; absence records `videoId: ''`, while a present region must contain one consistent canonical ID from actual link/media elements. The description comes only from a visible, non-footer `.petDtlInt .gnrCnt`; absent is `''`, and a present but ambiguous or malformed introduction is `BLOCKED`. Visibility is derived only from the tokenized attributes: boolean `hidden`, a decoded and trimmed `aria-hidden` value exactly equal to `true`, or any decoded quoted/unquoted `style` occurrence declaring `display:none` or `visibility:hidden`; title/data text is never a visibility signal. A well-formed hidden/self-hidden candidate or candidate under `footer` is not evidence and never conflicts with a visible candidate; it leaves required evidence missing or optional evidence observed-empty. A recoverable target selector already marked malformed remains `BLOCKED` before that visibility exclusion. Page-footer and script text are never evidence for parents or video. A canonical video URL must be HTTPS with no credentials or non-default port, an allowlisted `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, or `youtu.be` host, and exactly one supported `watch?v`, `embed/{id}`, `shorts/{id}`, or `youtu.be/{id}` form with an 11-character ID. Protocol-relative links resolve only from the HTTPS page base; redirects, lookalike hosts, duplicate `v` parameters, and non-HTTPS URLs are not video evidence.

### Fuluck API, controlled rendered-site reader, and deterministic comparator

The Fuluck reader first fetches the public catalogue with the same domain, timeout, response-size, and content-type protections. It requires an array of unique, non-empty breeder IDs and valid public record shapes. The production public API does not currently expose long introductions or translated text, so every source-active breeder ID must also be checked against its Japanese, English, and Chinese public detail URL.

For a rendered-page HTTP `200`, the reader performs a deliberately narrow render contract instead of trying to authenticate arbitrary remote HTML. It first removes only one already-proven final Cloudflare tail injection. It then reads the checked-out generated file selected by a fixed module-relative mapping: `kittens/{id}.html` for Japanese, `en/kittens/{id}.html` for English, and `zh/kittens/{id}.html` for Chinese. The `id` and locale are already strict audit values; the local reader accepts only a regular, non-symbolic-link file under that checkout, caps it at 2 MiB, and exposes no local path or operating-system error in a diagnostic.

The cleaned remote string and that single in-memory controlled string must be byte-for-byte equal. Any mismatch, unavailable controlled file, unsafe file type, oversized file, or read failure is `BLOCKED`. Only after equality does the reader parse the controlled string; it never parses the remote copy after that comparison. An authoritative exact `404` remains `rendered_page_missing` drift and does not need a local file. This keeps the field extractor in a verified/tracked-file trust boundary rather than presenting a partial HTML tokenizer as a remote identity proof.

The receipt records the one SHA-256 digest shared by the cleaned remote page and controlled generated file, but never stores the HTML. This has two useful properties: ordinary generated inline SVG remains accepted as bytes, and any text, media, canonical, Product, Offer, whitespace, entity, or markup rewrite is visible as a contract mismatch. It adds no dependency. Reconsider a fixed `parse5` dependency only if a stable CDN response rewrite becomes a separately measured production requirement.

The comparator joins Koneko, the Fuluck API, and rendered pages only by exact breeder ID. It emits these machine-readable drift classes:

- `source_active_missing_target`;
- `source_active_target_inactive`;
- `source_inactive_target_active`;
- `status_mismatch`;
- `fact_mismatch` for price, birthday, breed, colour, gender, or parents;
- `photos_mismatch` for ordered URL count or sequence;
- `video_id_mismatch` using canonical YouTube IDs;
- `japanese_text_mismatch` for short appeal or long introduction;
- `rendered_page_missing` when a required language detail page is absent;
- `translation_missing` when a non-empty Japanese source short/long text lacks the corresponding Chinese or English text.

The required source/target facts are breed, colour, gender, price, birthday, and ordered photos. `papa`, `mama`, `note`, `description`, and `videoId` must always be strings but may be `''` as an observed fact. They are still compared: an empty/non-empty difference produces the same fact, text, or video drift class and cannot become `EXACT`. Koneko has no authoritative Chinese or English copy, so the audit must not invent translations or claim that translated wording is source-equal. Every Japanese source/target text difference emits `japanese_text_mismatch`; `translation_review_required` and `translation_missing` are emitted only when the authoritative Koneko Japanese source field is non-empty, so target-only text cannot fabricate a translation requirement.

The result is `EXACT` only when both accounts are completely proven and no drift exists. Any catalogue difference is `DRIFT`. Any incomplete pagination, parser uncertainty, network failure, invalid response, duplicate identity, or schema failure is `BLOCKED`. The tool never guesses around a blocked condition.

### Receipts and notification surface

Every run writes a compact Markdown summary to the GitHub Actions job summary and uploads one JSON audit artifact retained for 14 days. The summary contains:

- observed time in JST;
- result: `EXACT`, `DRIFT`, or `BLOCKED`;
- per-account page, declared-total, safely verified unique-ID count, `available`/`reserved`/`sold` status counts, explicit ambiguous-status count, and active count; these safe aggregates remain present for each fixed account even when the terminal result is `BLOCKED`. Status aggregation groups by breeder ID and counts a status only when every record for that ID has the same known status, making the output order-independent;
- Fuluck total and status counts;
- each verified Fuluck rendered-page URL, locale, and shared controlled-render SHA-256;
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

Unit fixtures cover both account layouts, multiple pages, each known Koneko status, HTML escaping, duplicate IDs, inconsistent totals, repeated pages, missing next-page receipts, challenge pages, malformed details, photo ordering, and YouTube URL canonicalisation. Detail fixtures specifically cover the live Koneko labels and facts region, required-row conflicts, unclosed and valid-plus-unclosed exact candidates, recoverable malformed target openings and malformed inner selectors, non-`div` containers, visible versus hidden/footer candidates, quoted/unquoted decoded visibility styles and unrelated `title`/`data-*` text, parent/video container absence and conflicts, scoped malformed outer markup, canonical HTTPS/allowlisted YouTube forms, and observed-empty optional values.

Comparator tests cover every drift class, exact equality, empty/non-empty optional drift, conditional translation requirements including target-only text, bounded order-independent per-account `BLOCKED` aggregates with ambiguous statuses, and the rule that missing or blocked source evidence cannot become `EXACT`.

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
