# Blog Illustrations — plan, Style DNA, image2 recipe (2026-06-21)

Goal: every blog article gets one high-information-density illustration. Realistic
Siberian Forest cat models, **varied colors**. Reuse existing 科普素材 where it fits,
generate only the gaps via Codex image2.

## Scope (measured)
- 178 blog articles. **99 already have an edu figure. 79 are gaps.** (gap list: `grep -L blog-figure blog/*.html`)
- 科普素材 has **701 images** already made — many are slug-named infographics (e.g.
  `BLOG_natural_cat_breeds.png`, 1254×1254) that are **already exactly on-brief**:
  title + 4 numbered educational points + a "自然発達 vs 人工交配" comparison + realistic
  Siberians in silver/colorpoint/brown-tabby + brand footer. **Reuse these first.**
- Site edu images: `images/blog-edu/<CODE>_<slug>_1200.webp` (1200px WebP), referenced as
  cover `<img class="blog-cover">` + inline `<figure class="blog-figure">` + `og:image` + JSON-LD `image`.

## Architecture reality (why this needs sign-off)
Articles are stored in **Cloudflare KV** (source of truth); static `/blog/*.html` are
**generated** from KV. So adding a figure = (1) put WebP in `images/blog-edu/`, (2) inject
the `<figure>` into the article's `content.{ja,en,zh}` in KV, (3) regenerate static pages,
(4) `git push` + GitHub Pages deploy. Steps 1–4 are production writes (gated).

## Two blockers for the *generation* (gap) half
1. **codex CLI is broken** — `~/.codex/config.toml:11` has `service_tier = "default"`, which
   codex-cli 0.125 rejects (wants `fast`/`flex`). `codex mcp list` / any `codex exec` fails.
   Fix: remove that line (use built-in default) or set `service_tier = "flex"`.
2. **No locatable image2 runner** — the orchestration prompt references "项目现有 image2
   出图脚本 / codex exec image2 / image2_网页资产打法.md", but none exist on disk. The 701
   images came from an "OpenClaw image worker" batch system that isn't reconstructable from
   here. **Need the exact image2 command** (or the worker entrypoint) to generate gaps.

## Plan
**Phase A — Reuse (no image2 needed, mechanical → Sonnet):**
For each of the 79 gaps, match against 科普素材 by slug (`BLOG_<slug>.png`, `<CODE>_<topic>.png`).
For matches: `sips -Z 1200 + WebP` → `images/blog-edu/<slug>_1200.webp` → inject figure into
KV article content (ja/en/zh, translated figcaption) → regen → deploy. This likely covers a
large share of the 79.

**Phase B — Generate the true gaps (image2, once unblocked):**
Articles with no reusable image → image2 with the Style DNA below → review → same inject path.

---

## STYLE DNA BLOCK  (paste verbatim into every image2 call for consistency)

```
STYLE: Editorial educational infographic for a premium cat cattery. Warm, calm,
trustworthy — NOT clip-art, NOT flat-vector, NOT cartoon. Photoreal cat subjects
composited into a soft illustrated layout.

CAT SUBJECTS: realistic, photographic-quality Siberian Forest cats (long triple coat,
tufted ears, plumed tail, sturdy build). Show 2–4 cats in DIFFERENT colors across the
set — silver tabby, brown classic tabby, seal colorpoint (Neva Masquerade), red/cream,
black-and-white — calm natural poses, soft catchlights in the eyes.

PALETTE (hex + name, use ONLY these):
  #F5EFE1 ivory paper   #EDE3CE warm cream   #3C5A40 forest green (headings/accents)
  #7DA67F sage          #A9744F warm walnut   #7DD3C0 brand mint (small accents only)
  #2E2A24 ink (text).  No neon, no high-saturation candy colors.

LAYOUT: large title band top; a numbered list of 3–4 educational points down the right
(number badge + short heading + 1-line note + a small relevant icon); a supporting
comparison panel or labelled diagram lower-left; realistic cat photos integrated on the
left/top. Generous whitespace. Subtle paper grain + soft botanical leaf flourishes.

BRAND: small "福楽キャッテリー / Fuluck Cattery" wordmark + paw motif in the footer.

CONSTRAINTS: no watermark; no stock-logo; no garbled text. Keep ALL Japanese text to the
verbatim strings given below and ≤12 words each — if unsure, leave the area BLANK for
HTML/SVG overlay. Square 1024×1024 (export 1200 for the site).
```

**Three-layer consistency lock (per §3):** ① paste the Style DNA every call; ② after the
first approved image, pass it as the `-i` anchor reference to all later calls; ③ change one
variable per iteration; re-anchor every 4–5 images.

## image2 PROMPT RECIPE (per article)
`<STYLE DNA BLOCK>` + per-article: TITLE (verbatim JA, ≤12 words) + the 3–4 numbered point
headings (verbatim, ≤6 words each) + which cat colors to feature + any diagram subject.
Long body text / exact data → leave a blank panel, overlay later with HTML/SVG. Never let
the model write paragraphs or numbers.

## Validation target
`natural-cat-breeds.html` (currently 0 images) — reuse `BLOG_natural_cat_breeds.png`
(already perfect). Do this one end-to-end first to prove the inject→regen→deploy path,
then batch.
