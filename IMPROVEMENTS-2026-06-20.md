# fuluckpet.com — Improvement Sprint 2026-06-20

> Branch: `improve/audit-2026-06-20` (6 commits, **not pushed** — production deploy gated on owner OK).
> Source: 8-dimension audit (visual/UX, perf, a11y, SEO/GEO, worker, admin, security, i18n) with adversarial verification.
> Stable rollback point: `git checkout main` / tag `v2.0-stable-2026-04-27`.

The site was already healthy (SEO 78, design 68). This sprint fixed one real **P0 data-loss bug** and shipped a tier of low-risk frontend/backend improvements. Everything below is committed on the branch and reversible.

---

## 1. What shipped (committed on the branch)

| Commit | Area | Change | Risk |
|---|---|---|---|
| `816fe6b` | **P0 admin** | `getData()` no longer pushes hardcoded April defaults to KV on a fresh browser — was silently reverting the live catalogue (auth'd with the default password) before login | med→fixed |
| `1d299d6` | admin | Password change now rotates the **server** password (`/api/admin/password/reset`, verifies current pw) instead of only localStorage; sidebar becomes a hamburger **drawer** on phones (was `display:none`) | low |
| `010fb3b` | frontend | Legal `動物取扱業` disclosure contrast **1.2:1 → 5.7:1** (AA); removed the 4th-repeated mobile trust strip + reclaimed its padding; scroll bar rainbow → single mint | low |
| `1d488e3` | perf | Hero img intrinsic dims `640×480 → 960×1200` (CLS) + `fetchpriority` + preload + worker preconnect; **deferred** i18n/drive-loader/card-loader/script.js (~157KB); first 2 kitten cards eager | low |
| `8229c88` | a11y | FAQ accordion `aria-expanded`/`aria-controls`/`role=region`; booking result banners `role=status`/`role=alert` + `aria-live` | low |
| `bdf917e` | **backend** | LLM chain per-provider 13s timeout + 26s budget; removed dead Kimi hop; per-kitten `aggregateRating` dropped from generator (Google policy) + `priceValidUntil` added | low (**deploy-gated**) |

Verified in a live browser preview: admin drawer opens/closes, legal contrast measured 5.7:1, deferred scripts still execute (hero/nav/stats/count-up/char-reveal intact), FAQ `aria-expanded` toggles false→true. Worker + generator pass `node --check`.

---

## 2. Deploy plan (the gate)

Nothing is live yet. To ship, in order:

```bash
cd "/Volumes/M4 SSD/Yuki-Mayuki/projects/fuluckpet-website"

# 1) Frontend (GitHub Pages auto-deploys ~1-2 min). Merge the branch to main:
git checkout main && git merge --no-ff improve/audit-2026-06-20
git push origin main         # owner policy: never force-push main

# 2) Backend worker (chat timeout + Kimi removal). Test on success path first:
cd api && wrangler deploy
#   smoke: curl -sX POST .../api/chat -d '{"messages":[{"role":"user","content":"価格は？"}],"session_id":"deploy-verify"}'
#   expect provider=infi-deepseek-v3.2, a reply, telegram_status=sent

# 3) Regenerate static pages so kittens.html drops the per-kitten 5.0/113 schema:
#    happens automatically on next admin "発行" / cron, or trigger the
#    regenerate-site workflow manually.
```

**Recommendation:** ship `816fe6b` (the P0) **today** regardless of the rest — it's a standing data-loss risk every time the owner opens admin on a new device. It's a pure frontend JS change (no worker deploy needed).

---

## 3. Codex backend specs (hand to Codex via `/goal` — heavier, need design + testing)

### 3.1 Real session-token auth for admin (security — highest remaining)
The raw admin password is the Bearer token on every API call and the literal default `<REDACTED — rotate; creds in ~/.secrets/yuki/fuluck-admin.env>` is baked into 4 shipped JS files (`api-client.js`, `admin-core.js`, `admin-bookings.js`, `admin-blog-editor.js`), visible in GitHub Pages view-source. The worker treats the Bearer **as** the password, so it can't be rotated independently of the wire credential.
**Spec:** `/api/auth` mints a short-lived opaque token in KV (`sess:<token>` with exp) and returns it; `checkAuth` validates the token against KV instead of `verifyAndMaybeMigrate(password)`. Update the admin JS to store/send the returned token as Bearer. Immediate partial mitigation independent of the token work: delete the hardcoded `<REDACTED — rotate; creds in ~/.secrets/yuki/fuluck-admin.env>` fallback literals from the 4 files. Coordinate with the password-change fix already shipped in `1d299d6`.

### 3.2 Brute-force protection on `/api/auth`
No rate limit / lockout on the login endpoint. Add a per-IP counter in KV (e.g. `authfail:<ip>:<hourbucket>`), lock after N failures for a cooldown, return 429. Pair with 3.1.

### 3.3 Booking id→key index + chat rate-limit hardening
Booking DELETE/PUT do an unbounded `list({prefix:'booking:'})` + linear find — beyond ~1000 bookings a mutation on an old record 404s incorrectly and every mutation is O(all). **Spec:** at creation write `booking:id:<id>` → fullKey so DELETE/PUT do one `get`. Separately the chat rate-limiter is non-atomic (parallel-request bypassable) and resets its 3600s TTL every message, so a steady chatter never expires — key on a fixed hour bucket `chat:rl:<sid>:<floor(now/3600)>` and only set TTL on key creation.

### 3.4 generate-site.js: kittens.html head perf (fold into the next regen)
In the kittens.html head template emitted by the generator, add `<link rel="preconnect" href="https://fuluck-api.mouxue56.workers.dev">` and set `loading="eager" fetchpriority="high"` on the first 2 static siberian cards (mirrors the client-side `card-loader.js` change already shipped in `1d488e3`). Version `style.css` in the shared head (`?v=`) so CSS cache-busts on deploy.

### 3.5 (Optional) AbortController upgrade for the chat timeout
`bdf917e` uses `Promise.race` (sufficient — losing fetch is runtime-cancelled). The fuller version threads a per-provider `AbortController` signal into each `fetch(...)` so the connection is actively freed mid-flight. Low priority; `Promise.race` covers the user-facing hang.

---

## 4. image2 design prompt — hero photograph (owner brand decision)

The current hero (`images/hero-main.jpg`) is a photo-of-a-printed-flyer: low-res baked-in Japanese text + a "福楽ペット" watermark. It reads cheap against the otherwise-polished design. Replacing it is the single biggest perceived-premium lift. **This is an owner call** (it's their brand photo); the prompt is ready when wanted.

> **image2 prompt:** Editorial-quality photograph of a single Siberian cat, close and sharp, three-quarter view, looking toward the camera. Warm late-afternoon window light, soft natural shadows, shallow depth of field. Palette: cream and soft mint (#FFFCF0 background, hints of #7DD3C0), warm and calm, premium not cute. **Composition: the cat occupies the right two-thirds; leave clean negative space on the left for an HTML headline overlay.** Subtle film grain, true-to-life fur detail. No text, no watermark, no logo, no border, no people. 4:5 portrait, 960×1200, high quality.

Then overlay the existing headline/badges as HTML (never bake text into the image). Secondary assets if the owner wants to break the template feel further: a clean vector of the 2025 national-#1 award seal, and a kitten-specific OG/share image for kittens.html (currently shares the generic `/images/ogp.jpg`, also a relative path).

---

## 5. Owner actions (human-only)

- **Booking email** still fails (MailChannels SPF/DKIM not set) — saves to KV + Telegram works. Add the 3 TXT records (see `HANDOVER-CODEX.md` §10).
- **Price band**: live listings include 140k / 300k / 350k kittens, outside the `160k–290k` stated in schema/`llms.txt`/FAQ. AI answer engines quote that band verbatim, under-selling. Decide: widen everywhere, or add a "typical" qualifier.
- **Trilingual SEO**: `hreflang` advertises `?lang=en/zh` but the switch is JS-only and all three serve byte-identical JP HTML with a JP canonical — EN/ZH aren't independently indexable. Real fix = generate static `/en/` `/zh/` pages (a build change). Owner call whether EN/ZH organic reach is worth it (JP market ranks fine today).
- **Cloudflare Cache Rule** for `*.css/*.js/images` (`_headers` is dead config on GitHub Pages) — zone-level, cuts repeat-visit round-trips.

---

## 6. Deferred (tracked, lower priority)
Unify the two article systems (in-page panel vs blog-editor share `articles` KV with incompatible writes + colliding globals); escape interpolated data in admin render fns (latent XSS); throttle the 7 unthrottled scroll listeners into one rAF handler; static no-JS anchor grid of `/kittens/{id}.html` for AI crawlers; drop Noto Sans SC from the default font load (JP-first); PWA manifest + apple-touch-icon; tighten JP line-height 2.0→1.7; reduce mobile floating-control stacking; move Telegram chat-sync to `waitUntil`; emoji-icons → SVG line-icon set + tighten the 7-candy palette to mint+amber (a deliberate brand pass, not an autonomous sweep).
