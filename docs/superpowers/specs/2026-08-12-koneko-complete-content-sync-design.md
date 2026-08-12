# Koneko Complete Content Sync Design

## Goal

For the 22 kittens currently listed as `販売中` or `商談中` across Koneko breeder accounts `c995680` and `d696506`, make Fuluck's production catalogue and Japanese, English, and Chinese public pages contain the same current catalogue facts, the complete ordered photo gallery, the current YouTube video, the short appeal, and the breeder's full kitten introduction.

## Scope for 2026-08-12

- Koneko remains read-only. The run may log in, filter, paginate, and read list/detail/media fields. It must not edit listings, send customer messages, submit contracts, or delete data.
- Fuluck may create missing records and update existing records one at a time after a reviewed dry-run and a full pre-write backup.
- No Fuluck `DELETE` request is allowed in this run. Records missing from the two current active Koneko sets may be marked `sold`, but historical records remain stored.
- This run does not install a scheduler or build the future employee/AI coordination centre.

## Source and target model

The fresh snapshot is the immutable input for one run. Each active kitten contains:

- identity and catalogue facts: `breederId`, account group, status, breed, colour, sex, price, birthday, and parents;
- `photos`: every full-size Koneko detail image in visible gallery order;
- `video`: the current YouTube video, compared by its 11-character video ID;
- `notes.ja`: the Koneko appeal text, plus faithful `notes.zh` and `notes.en` localisations;
- `descriptions.ja`: the full `ブリーダーからの子猫紹介文`, plus faithful `descriptions.zh` and `descriptions.en` translations.

Fuluck stores the long introduction in `description`, `descriptionZh`, and `descriptionEn`. The short appeal continues to use `note`, `noteZh`, and `noteEn`. The public Worker projection exposes all six fields. The static detail page renders the long introduction as escaped paragraphs with preserved line breaks; list cards continue to show only the short note.

## Mirror semantics

An explicit `--mirror-active` run is stricter than the legacy conservative sync:

- For every source-active record, catalogue facts, ordered photos, video, parents, short notes, and long descriptions are compared with Fuluck and patched when different.
- A changed or removed video clears/replaces the website value; equal YouTube IDs do not cause format-only writes.
- Empty translated text is allowed in storage but is not accepted for this production run: all 22 source-active records must have non-empty Japanese, English, and Chinese short notes and long descriptions before apply.
- A source-active record with zero photos, an invalid price/birthday/status, or an invalid video fails closed before any production write.
- `--mirror-active` never executes the snapshot's deletion list. Physical deletion remains a separately authorised operation.
- Existing `isNew`, promotion fields, Fuluck UUIDs, timestamps, and other Fuluck-only metadata are preserved.

The image URLs remain the current full-size Koneko media URLs for this run. Each URL must return a successful image response before apply. Copying the gallery into owned R2 storage is a separate future reliability project, not part of today's content repair.

## Data flow and failure handling

1. Read both accounts in one browser-backed session and capture all 22 active detail pages.
2. Validate account coverage, unique breeder IDs, status mapping, complete media, and three-language text.
3. Fetch Fuluck's authenticated catalogue and produce a human-readable dry-run.
4. Refuse apply unless the plan has zero deletes and every photo/video preflight succeeds.
5. Write one kitten per request after saving the complete 55-record pre-write backup.
6. Re-read the target and require exact equality for all source-owned active fields.
7. Deploy the Worker field projection, regenerate static pages, and verify all 22 detail pages in all three languages, including gallery counts, video IDs, short notes, and long introductions.

Any write failure stops acceptance. Existing records and the backup remain available for recovery; static regeneration is not accepted until API equality passes.

## Acceptance criteria

- Source: 22 active kittens, with both account groups present; every kitten has complete facts, at least one full-size photo, one valid YouTube ID, and non-empty six-part multilingual text.
- Target API: exactly 18 `available` and 4 `reserved`; the active breederId set equals the source set; zero field mismatches across source-owned fields; total active photo count equals the source total.
- Public site: Japanese, English, and Chinese lists each contain all 22 active IDs. All 66 detail pages return 200 and render the expected gallery count, YouTube ID, localised short note, and localised full introduction.
- Safety: zero Koneko writes/messages/deletes, zero Fuluck physical deletes, a readable mode-0600 pre-write backup, successful regression tests, successful Worker smoke, successful regeneration workflow, and successful Pages deployment.
