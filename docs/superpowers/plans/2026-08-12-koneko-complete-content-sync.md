# Koneko Complete Content Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror all current catalogue facts, ordered photos, video, short notes, and full introductions for both Koneko breeder accounts into Fuluck and verify all three public languages.

**Architecture:** Extend the existing snapshot-to-Worker CLI with a pure strict-mirror field planner selected by `--mirror-active`. Add three public long-description fields and render them only on detail pages. Keep Koneko read-only, Fuluck writes item-scoped, and all physical deletion disabled for the strict run.

**Tech Stack:** Node.js 24 ESM, Node test runner, Cloudflare Worker/KV, GitHub Actions static generation, in-app browser read-only capture.

## Global Constraints

- Koneko is read-only: no listing edits, messages, contracts, or deletes.
- The run covers both `c995680` and `d696506` in one fresh snapshot.
- Fuluck physical DELETE is prohibited.
- Production apply requires dry-run review, a full backup, and media preflight.
- Every active kitten must have complete ja/zh/en short notes and long descriptions.
- No scheduler or employee/AI coordination centre is built in this plan.

---

### Task 1: Strict active-field mirror planner

**Files:**
- Create: `tools/lib/koneko-active-mirror.js`
- Create: `tests/sync-koneko-active-mirror.test.js`
- Modify: `tools/sync-koneko.js`

**Interfaces:**
- Consumes: current Fuluck record and one validated snapshot kitten.
- Produces: `buildActiveMirrorPatch(current, source)` returning a patch without `breederId`, and `assertCompleteActiveSource(source)` throwing on incomplete active input.

- [ ] Write failing tests proving ordered photo replacement, cover reset, YouTube-ID comparison/removal, exact catalogue/parent/text updates, preservation of Fuluck-only fields, and rejection of missing media or multilingual content.
- [ ] Run `node --test tests/sync-koneko-active-mirror.test.js` and confirm failures are caused by the missing module.
- [ ] Implement the two pure functions with no network, environment, file writes, or logging.
- [ ] Add `--mirror-active` to the CLI: validate every active source record before network access, use the pure patch for source-active records, attach descriptions to new records, and force the deletion plan to empty.
- [ ] Run the focused test plus snapshot freshness and existing sync safety tests; confirm all pass.

### Task 2: Public long-description data path

**Files:**
- Modify: `api/worker.js`
- Modify: `tools/generate-site.js`
- Test: `tests/public-kitten-projection.test.js`
- Test: `tests/generate-site-release-safety.test.js`

**Interfaces:**
- Consumes: `description`, `descriptionZh`, and `descriptionEn` from stored kitten records.
- Produces: public API projection and escaped per-language detail-page introduction sections.

- [ ] Add failing projection tests requiring the three description fields and excluding arbitrary private fields.
- [ ] Add failing generator tests requiring the language-specific introduction, paragraph preservation, and HTML escaping on detail pages while excluding the long text from cards.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Add the three fields to `PUBLIC_KITTEN_FIELDS`; add a language selector and safe paragraph renderer; render a localised introduction section in kitten detail pages only.
- [ ] Run the focused tests, `node --test tests/*.test.js`, the SEO/GEO audit, and `node tools/verify-generated.js`.

### Task 3: Fresh two-account content snapshot

**Files:**
- Create outside Git: `/private/tmp/koneko-complete-snapshot-20260812.json`

**Interfaces:**
- Consumes: the 22 current active Koneko detail pages and the mode-0600 account secret file.
- Produces: a fresh validated snapshot containing full gallery URLs, video, short notes, and full descriptions in ja/zh/en.

- [ ] Capture every source page through the read-only browser and record the active account/status mapping.
- [ ] Translate short notes and full introductions faithfully without adding claims; preserve the Japanese source text exactly.
- [ ] Validate unique IDs, two-account coverage, valid statuses/prices/birthdays, non-empty 6-part text, full-size photos, and YouTube IDs.
- [ ] Preflight every image URL and every distinct video ID; stop on any invalid media.

### Task 4: Dry-run, apply, and API equality

**Files:**
- Create outside Git: `/Users/willma/Documents/猫舍/_backups/kittens-<timestamp>-完整同步前.json`

**Interfaces:**
- Consumes: the validated snapshot, deployed-compatible sync CLI, and `FULUCK_ADMIN_PASS` from the existing secret environment.
- Produces: a reviewed zero-delete plan, item-scoped production writes, a backup, and a machine-readable equality result.

- [ ] Run `node tools/sync-koneko.js --snapshot <path> --mirror-active` and require zero deletes and expected updates only.
- [ ] Run the same command with `--apply`; require zero failures and copy the complete pre-write backup to the local protected backup directory.
- [ ] Re-read the authenticated API and require exact equality for the 22 active records across all source-owned fields and photo ordering.

### Task 5: Deploy and public verification

**Files:**
- Modify/generated: public static kitten lists and detail pages through `regenerate-site.yml`.

**Interfaces:**
- Consumes: tested Worker code and an API-equal production catalogue.
- Produces: public API descriptions and 66 verified localised detail pages.

- [ ] Deploy the Worker through the repository's guarded deploy-and-smoke script; require all smoke checks to pass.
- [ ] Commit/push the reviewed implementation branch and integrate only the scoped changes into `main`.
- [ ] Trigger `regenerate-site.yml` on `main`; require the full regression suite and generated-output integrity gate to pass.
- [ ] Require the Pages deployment SHA to equal `main` and verify all three lists plus all 66 detail pages for ID, gallery count, YouTube ID, short note, and full introduction.
- [ ] Finalise the browser session and write the verified result and permanent safety semantics back to the knowledge base.
