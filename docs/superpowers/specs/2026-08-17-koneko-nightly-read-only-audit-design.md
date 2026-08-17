# Koneko Nightly Read-Only Audit Design

## Goal

At 20:00 Japan Standard Time every day, deterministically read the complete public catalogues for Koneko breeder accounts `c995680` and `d696506`, compare them with Fuluck's public kitten API, and publish an exact, reviewable drift result without modifying either system.

This is the first, semi-automatic phase. A detected difference creates an approval package for a later, separately authorised Fuluck update. The audit itself never writes production data.

## Chosen approach

Use a read-only GitHub Actions workflow scheduled at `0 11 * * *` UTC, equivalent to 20:00 JST, plus a manual dispatch trigger. A deterministic Node.js crawler and comparator perform the work without Codex, Grok, Cursor, or any other language-model call.

This is preferred over a Mac-only scheduler because it does not depend on a laptop being awake and produces a durable run receipt, job summary, and downloadable artifact. It is preferred over a model-led browser agent because inventory identity, pagination, statuses, amounts, and media ordering are exact data-processing tasks. If Koneko later blocks GitHub-hosted network traffic, the workflow must report `BLOCKED`; a separately reviewed local-browser runner may then replace only the transport layer without changing validation or diff semantics.

Koneko responses are `text/html` interpreted with the WHATWG parsing model, so the Koneko list and detail readers use exactly `parse5` `8.0.1` rather than extending the repository's partial HTML scanner. The root `package.json` pins exactly `"parse5": "8.0.1"`, is private, and deliberately has no `type` field because the repository contains both CommonJS and ESM `.js` files under Node 24 syntax detection. A committed root `package-lock.json` pins `parse5` and every transitive dependency with integrity metadata. There is no legacy-parser, browser, model, CDN, or best-effort runtime fallback: if the locked parser is unavailable, the audit is `BLOCKED`.

## Scope and authority

- Source direction is fixed: two Koneko accounts to Fuluck.
- Koneko access is public, anonymous, and GET-only. The workflow receives no Koneko username, password, cookie, or browser profile.
- Fuluck access uses only the public `/api/kittens` endpoint and the public Japanese, English, and Chinese kitten detail pages. The workflow receives no Fuluck administrator password.
- The workflow must not call any Koneko mutation, customer-message, LINE, booking, contract, or reservation endpoint.
- The workflow must not call any Fuluck administrator, bulk, item-write, upload, deletion, deployment, regeneration, or repository-write endpoint.
- The workflow has GitHub `contents: read` permission only. It may write the current Actions run summary and upload an ephemeral audit artifact, but it must not commit or push files.
- Phase one does not automatically update Fuluck. Every production write remains a separate owner-approved action.

## Components

### Locked parser dependency and bootstrap boundary

Every execution path that loads the Koneko parser first runs `npm ci --ignore-scripts --no-audit --no-fund` against the committed root lockfile. This installation is required by the nightly workflow, the push/pull-request quality workflow, the static regeneration workflow before generation, every regeneration retry after a rebase, the deploy smoke helper before its full test suite, and the documented local verification path. The regeneration and deployment paths stop before any generation, commit, push, dry run, or deployment when installation fails.

The nightly workflow keeps a dependency-free report bootstrap that imports only Node built-ins and the bounded report writer, never `parse5` or the Koneko crawl graph. If `npm ci` fails, that bootstrap writes schema-valid mode-0600 JSON and Markdown receipts with `result: BLOCKED`, `exitCode: 3`, the closed diagnostic `stage=bootstrap; reason=dependency_install_failed`, empty unverified account/target evidence, and `NO WRITE PERFORMED`. It does not copy npm output, environment values, registry configuration, or exception text into the artifact. The existing `always()` summary/upload path then preserves both receipts and the final status step exits 3. A partial or cached `node_modules` tree after a failed install is never used to run the audit.

The parser is a syntax layer, not an evidence authority. Each Koneko response is parsed once with scripting enabled, source locations enabled, and parse errors collected. Extraction then applies the existing exact-ID, exact-class-token, uniqueness, visibility, identity, URL, and field contracts to that tree. Parsed attributes and text are already decoded once by the HTML parser and must never pass through a second entity decoder.

### Public catalogue crawler

The crawler has a fixed allowlist containing only `www.koneko-breeder.com` and the two breeder account IDs. It fetches catalogue pages sequentially with bounded timeouts, response-size limits, a low request rate, and a stable descriptive user agent.

For each account it follows the site's observed pagination until the explicit final page. It records a page receipt containing the requested page number, response status, content type, declared catalogue total, visible card count, extracted breeder IDs, whether a next-page control exists, and a SHA-256 digest of the response. It rejects redirects outside the allowlist, non-HTML responses, challenge/interstitial pages, repeated pages, pagination gaps, duplicate breeder IDs, an inconsistent declared total, or an unrecognised status.

The accepted Koneko status map is:

- `販売中` to `available`;
- `商談中` and `事前成約申請` to `reserved`;
- `成約済み` and `販売終了` to `sold`;
- `準備中` to the distinct `preparing` state; it is recorded and counted, but is neither public active inventory nor `sold`.

After complete list pagination, the crawler reads every `available` or `reserved` kitten detail page and extracts the exact breeder ID, account ID, price, birthday, breed, colour, gender, parents, ordered full-size photo URLs, canonical YouTube video ID, short Japanese appeal, and long Japanese introduction. It also reads availability only from the same strictly unique Product JSON-LD object's `offers.availability`: exact `https://schema.org/InStock` proves the list's `available` state and exact `https://schema.org/SoldOut` is the observable contract for `reserved`. Missing, unknown, conflicting, or list-inconsistent Product availability makes the run `BLOCKED`; scattered page JavaScript is not evidence. Because Product `SoldOut` cannot distinguish a reservation from a completed sale, this check does not claim to detect a `reserved`-to-`sold` transition. Detail identity must match the list identity. Missing required facts, zero photos, invalid media URLs, or conflicting list/detail values make the entire run `BLOCKED`.

Koneko field evidence is scoped to source-backed, actual HTML-namespace detail containers rather than the whole document. Facts come only from one visible, non-footer `.petDtlData` containing one `table.gnrTbl`; the observed labels are `猫種`, `毛色(毛質)`, `性別`, `誕生日`, and `アピール<br>ポイント` (with only explicit historical aliases accepted). Breed, colour, gender, and birthday must each have one non-empty row; the appeal row is an observed optional string, so a missing row or empty cell is `''`, while a duplicate or malformed matching row is `BLOCKED`. The target selectors are exact decoded DOM ID/class selectors, not hard-coded `div` selectors; the compound video selector requires both HTML-whitespace-delimited class tokens. Template contents are inert, and SVG/MathML nodes never satisfy an HTML target selector.

Target-local parse evidence remains fail closed on top of the standards parser. An exact DOM candidate or required descendant must have explicit source-backed start and end tags in a properly nested target subtree. A parse error intersecting its start tag, end tag, or required structural span; an EOF/incomplete, mismatched, non-void self-closing, duplicate, additional, or source-location-less target; or a valid candidate plus a second invalid exact candidate makes that evidence `BLOCKED`, even when browser repair produced a node. Candidate recognition always follows the parsed DOM first: malformed source such as `<aside =class=petDtlData>` has an attribute named `=class`, does not invent a `class`, and therefore cannot block unrelated valid evidence. Parse errors outside a DOM-recognised target and outside its required structural span do not invalidate the whole document. This preserves local tolerance without allowing an optional field to become false absence.

Parents come only from one visible, non-footer `#parentInfo`: an absent region records `papa: ''` and `mama: ''`; a present region must prove exactly one father item and one mother item. Within either required side item, an absent `li.parentName` records that side as `''`; a present `li.parentName` must be unique and contain exactly one visible direct `strong` child with nonblank text. Duplicate, conflicting, nested-only, or malformed name evidence is `BLOCKED`, and there is no whole-page fallback. Video comes only from one visible, non-footer `.movieGalleryCnt.youtube`; absence records `videoId: ''`, while a present region must contain one consistent canonical ID from actual link/media elements. The description comes only from a visible, non-footer `.petDtlInt .gnrCnt`; absent is `''`, and a present but ambiguous or malformed introduction is `BLOCKED`. Visibility is derived only from the tokenized attributes: boolean `hidden`, a decoded and trimmed `aria-hidden` value exactly equal to `true`, or any decoded quoted/unquoted `style` occurrence declaring `display:none` or `visibility:hidden`; title/data text is never a visibility signal. A well-formed hidden/self-hidden candidate or candidate under `footer` is not evidence and never conflicts with a visible candidate; it leaves required evidence missing or optional evidence observed-empty. A recoverable target selector already marked malformed remains `BLOCKED` before that visibility exclusion. Page-footer and script text are never evidence for parents or video. A canonical video URL must be HTTPS with no credentials or non-default port, an allowlisted `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, or `youtu.be` host, and exactly one supported `watch?v`, `embed/{id}`, `shorts/{id}`, or `youtu.be/{id}` form with an 11-character ID. Protocol-relative links resolve only from the HTTPS page base; redirects, lookalike hosts, duplicate `v` parameters, and non-HTTPS URLs are not video evidence.

### Fuluck API, controlled rendered-site reader, and deterministic comparator

The Fuluck reader first fetches the public catalogue with the same domain, timeout, response-size, and content-type protections. It requires an array of unique, non-empty breeder IDs and valid public record shapes. Every active API record must contain valid public core fields for breed, colour, gender, price, birthday, ordered photos, video, and Japanese short text; `coverIndex` must be an integer within the photo array. Any present parent, description, or translated text field must be a string. Because the API and generated locale pages are separate customer-visible surfaces, every source-active breeder ID is also checked against its Japanese, English, and Chinese public detail URL.

For a rendered-page HTTP `200`, the reader performs a deliberately narrow render contract instead of trying to authenticate arbitrary remote HTML. It first removes only one already-proven final Cloudflare tail injection. It then reads the checked-out generated file selected by a fixed module-relative mapping: `kittens/{id}.html` for Japanese, `en/kittens/{id}.html` for English, and `zh/kittens/{id}.html` for Chinese. The `id` and locale are already strict audit values; the local reader accepts only a regular, non-symbolic-link file under that checkout, caps it at 2 MiB, and exposes no local path or operating-system error in a diagnostic.

The cleaned remote string and that single in-memory controlled string must be byte-for-byte equal. Any mismatch, unavailable controlled file, unsafe file type, oversized file, or read failure is `BLOCKED`. Only after equality does the reader parse the controlled string; it never parses the remote copy after that comparison. An authoritative exact `404` remains `rendered_page_missing` drift and does not need a local file. This keeps the field extractor in a verified/tracked-file trust boundary rather than presenting a partial HTML tokenizer as a remote identity proof.

The receipt records the one SHA-256 digest shared by the cleaned remote page and controlled generated file, but never stores the HTML. This has two useful properties: ordinary generated inline SVG remains accepted as bytes, and any text, media, canonical, Product, Offer, whitespace, entity, or markup rewrite is visible as a contract mismatch. The new parser dependency does not alter this trust boundary: arbitrary remote Fuluck HTML is never passed to `parse5` or any other semantic parser before byte equality, and the existing controlled-file loader, Cloudflare-tail proof, limits, and exact `404` rule remain unchanged.

The comparator joins Koneko, the Fuluck API, and rendered pages only by exact breeder ID. It emits these machine-readable drift classes:

- `source_active_missing`;
- `source_active_target_inactive`;
- `source_inactive_target_active`;
- `target_active_missing_source` for an active Fuluck record absent from both complete Koneko catalogues; Fuluck-only inactive history is not reported;
- `status_mismatch`;
- `fact_mismatch` for price, birthday, breed, colour, gender, or parents;
- `photos_mismatch` for ordered URL count or sequence;
- `video_id_mismatch` using canonical YouTube IDs;
- `japanese_text_mismatch` for short appeal or long introduction;
- `api_fact_mismatch`, `api_photos_mismatch`, `api_cover_index_mismatch`, `api_video_id_mismatch`, `api_japanese_text_mismatch`, or `api_translation_text_mismatch` when the API's corresponding public projection differs from Koneko or a controlled rendered locale page; Koneko's first ordered photo is source-authoritative, so the mirror contract requires API `coverIndex: 0`;
- `rendered_page_missing` when a required language detail page is absent;
- `translation_missing` when a non-empty Japanese source short/long text lacks the corresponding Chinese or English text.

The required source/target facts are breed, colour, gender, price, birthday, and ordered photos. `papa`, `mama`, `note`, `description`, and `videoId` must always be strings in normalized source/rendered evidence but may be `''` as an observed fact. A missing optional API property is compared as `''`: it is equivalent only when its Koneko or controlled-render reference is also empty, and otherwise produces drift. API video URLs are compared by the same canonical YouTube ID rather than URL spelling. API Japanese text is checked against Koneko, and API English/Chinese short and long text is checked against the corresponding controlled rendered page. Every ordered photo difference, every string-valued fact difference from either API or rendered-page comparison, and all free-form text differences use bounded hash/count/preview receipts rather than storing raw URLs or long values; numeric price, status, cover index, and canonical video ID differences remain bounded scalars. Website-only fields such as internal ID, promotion, or new-item presentation are outside this mirror comparison. Koneko has no authoritative Chinese or English copy, so the audit must not invent translations or claim that translated wording is source-equal. Every Japanese rendered-page source/target text difference emits `japanese_text_mismatch`; `translation_review_required` and `translation_missing` are emitted only when the authoritative Koneko Japanese source field is non-empty, so target-only text cannot fabricate a translation requirement.

The result is `EXACT` only when both accounts are completely proven and no drift exists. Any catalogue difference is `DRIFT`. Any incomplete pagination, parser uncertainty, network failure, invalid response, duplicate identity, or schema failure is `BLOCKED`. The tool never guesses around a blocked condition.

### Receipts and notification surface

Every run writes a compact Markdown summary to the GitHub Actions job summary and uploads one JSON audit artifact retained for 14 days. The summary contains:

- observed time in JST;
- result: `EXACT`, `DRIFT`, or `BLOCKED`;
- per-account page, declared-total, safely verified unique-ID count, `available`/`reserved`/`preparing`/`sold` status counts, explicit ambiguous-status count, and active count; these safe aggregates remain present for each fixed account even when the terminal result is `BLOCKED`. Status aggregation groups by breeder ID and counts a status only when every record for that ID has the same known status, making the output order-independent;
- Fuluck total and status counts;
- each verified Fuluck rendered-page URL, locale, and shared controlled-render SHA-256;
- every exact breeder ID and field-level difference;
- checked source and target URLs;
- a prominent `NO WRITE PERFORMED` statement.

The artifact has fixed `schemaVersion: "1.0"`, contains receipts, normalized field values needed to reproduce the diff, and hashes for long text. For every breeder ID active on both sides it also keeps the compact `accountId`, `breederId`, `sourceStatus`, and `targetStatus` receipt, including equal statuses, so equality can be audited offline without retaining HTML. It excludes credentials, cookies, response headers containing identifiers, and full HTML. The public job summary must not print full kitten introductions.

The scheduled workflow succeeds for `EXACT` and fails visibly for `DRIFT` or `BLOCKED`, while an `always()` artifact step preserves the evidence. A network, parser, or locked-dependency installation failure must never be reported as catalogue equality; installation failure still produces both bounded `BLOCKED` artifacts before the final failing status is re-emitted.

## Model and quota policy

The nightly audit uses zero language-model calls. This makes an unchanged day consume no Codex, Grok, or Cursor quota and avoids model-dependent inventory decisions.

If a later approved Fuluck update needs new Chinese or English text, a separate translation step may batch only the changed Japanese fields through a low-cost Cursor CLI model in read-only/sandboxed JSON mode. Deterministic schema, identity, gender, and fact checks must validate that output. Grok may be used only as an optional second opinion for a genuinely ambiguous text case. Neither CLI receives account credentials or production write access.

## Error handling and operational limits

- One run has a single-instance concurrency lock and a 15-minute job timeout. The audit command itself has an 8-minute GNU `timeout` boundary, leaving seven minutes for an independent dependency-free writer to replace the receipts with fixed `stage=audit; reason=audit_timeout` `BLOCKED` evidence and for the always-run summary, upload, and terminal-status steps to finish. Both GNU timeout's ordinary deadline code `124` and its forced-kill code `137` invoke that writer before the always-run tail.
- Fetches use limited retries only for transient GET failures; parsing or validation failures are not retried as if they were network failures.
- The crawler stops before comparing when either account lacks complete pagination receipts.
- There is no carry-forward of an older successful snapshot and no fallback to historical counts.
- There is no runtime fallback from `parse5` to the retired hand-written Koneko scanner, a browser DOM, regex-only extraction, an older snapshot, or model inference.
- Before `parse5`, each response is bounded by the 2 MiB byte ceiling and a linear 25,000-markup-delimiter ceiling. Parse errors otherwise stay scoped to the selected evidence and its actual DOM ancestor path; `eof-in-tag` is the sole global parse-error exception because it proves response truncation and can make the tokenizer discard a target anywhere in the document.
- Selectors may follow current public Koneko structure, but every parser and evidence assumption must be represented by fixtures and explicit invariant checks.
- GitHub cron can start later than 20:00 JST; the receipt records the actual observation time and must not claim an exact start time.
- No diff class can trigger an automatic update, regeneration, deployment, deletion, or customer communication in phase one.

## Testing

Unit fixtures cover both account layouts, multiple pages, each known Koneko status, duplicate IDs, inconsistent totals, repeated pages, missing next-page receipts, challenge pages, malformed details, photo ordering, and YouTube URL canonicalisation. The standards-parser adversarial matrix additionally covers:

- tokenizer and attribute behavior: quoted/unquoted attributes, HTML whitespace, duplicate attributes, forbidden characters in attribute names, exact-selector near misses, EOF in every opening-tag state, valid-plus-incomplete candidates, nulls, and non-void self-closing syntax;
- character references: complete named references, decimal and hexadecimal references with and without semicolons, entity-encoded ID/class/URL/style/ARIA values, ambiguous ampersands, and double-encoded values that must decode exactly once;
- tree construction and context: comments, bogus comments, script/style/title/textarea/xmp/iframe/noembed/noframes/noscript/plaintext, templates, SVG, MathML, CDATA, HTML integration points, implied/mismatched closes, nested candidates, table foster parenting, and source versus DOM nesting;
- target evidence: outer and inner facts/parent/video/introduction selectors, Product JSON-LD script identity and cardinality, cards, pagination, canonical links, actual HTML namespace, explicit source locations, duplicate/conflicting candidates, and optional absence that must never hide malformed evidence;
- visibility: boolean `hidden`, exact decoded lower-case `aria-hidden=true`, `&Tab;true&Tab;`, named and semicolon-less encoded colons in `display:none`/`visibility:hidden`, `!important`, multiple declarations, hidden ancestors/footer, visible-plus-hidden candidates, and non-signals in `title`/`data-*`;
- operational behavior: a fresh locked install, absent/corrupt dependency, no lifecycle scripts, no parser fallback, the 2 MiB body ceiling, no script/resource execution, and schema-valid dependency-install `BLOCKED` artifacts.

Comparator tests cover every drift class, exact equality, empty/non-empty optional drift, conditional translation requirements including target-only text, bounded order-independent per-account `BLOCKED` aggregates with ambiguous statuses, and the rule that missing or blocked source evidence cannot become `EXACT`.

Workflow contract tests require the exact JST-equivalent schedule, manual dispatch, `contents: read`, absence of secrets and write commands, artifact preservation, bounded execution, and zero model/CLI invocations.

Before enabling the schedule, one local read-only run with the locked parser must prove both real accounts' complete pagination, produce a valid receipt artifact, and compare against the live Fuluck public API and all required customer-visible detail pages. Enabling the scheduled workflow requires normal pull-request review and passing repository quality checks, but no Worker deployment or Fuluck data change. After merge, an explicit `workflow_dispatch` run on the exact default-branch commit is the final hosted gate: its summary and downloadable JSON/Markdown artifacts must be present, schema-valid, `NO WRITE PERFORMED`, and terminal `EXACT` or `DRIFT`; `BLOCKED`, a missing artifact, a dependency fallback, or an unrelated SHA means the schedule is not operationally accepted.

## Acceptance criteria

- A manual GitHub Actions run completes using public GET requests only and produces a schema-valid audit artifact.
- Root `package.json` has no `type`, pins exactly `parse5` `8.0.1`, and the committed lockfile is the only dependency-resolution authority.
- A clean `npm ci --ignore-scripts --no-audit --no-fund` succeeds in every parser-loading path; a nightly install failure instead preserves JSON and Markdown `BLOCKED` artifacts and exits 3 without crawling.
- Both breeder accounts have complete, internally consistent pagination receipts and unique breeder IDs, or the run is visibly `BLOCKED`.
- Exact breeder-ID and field-level differences are reported without inference from appearance or wording.
- The workflow runs daily on the `0 11 * * *` UTC schedule and can also be dispatched manually.
- The workflow has no secrets, no production write path, no model invocation, and no repository write permission.
- No Koneko runtime path can reach the retired scanner or a browser/model fallback, and the Fuluck controlled-byte gate remains byte-for-byte unchanged.
- `EXACT` means the validated source and Fuluck projections match; `DRIFT` and `BLOCKED` can never be silently converted to success.
- Existing full repository tests, the complete adversarial matrix, both-account local read-only acceptance, and the exact-SHA hosted workflow gate pass before operational acceptance.

## Deferred work

The following require a separate design and explicit production authority: applying approved changes to Fuluck, translating new text, regenerating static pages after a write, notifying a phone or external chat service, automatically repairing drift, and moving from approval-gated operation to restricted unattended writes.
