# fuluckpet.com — Codex Handover

> **For**: Codex CLI agent picking up this project to verify/continue
> **Created**: 2026-04-28
> **Last Opus session HEAD**: `fc21fcc`
> **Production live**: https://fuluckpet.com (GitHub Pages) + https://fuluck-api.mouxue56.workers.dev (Cloudflare Worker)
> **Stable backup tag**: `v2.0-stable-2026-04-27`

This handover is **self-contained**. Every claim has a verify command. Run them in order. If a check fails, do not assume — investigate before changing.

---

## 0. Project Definition (one paragraph)

**福楽キャッテリー (Fuluck Cattery)** — Osaka Siberian cat breeder. JP-first website (default `lang="ja"`) with EN/ZH switch. Owner: 羅方遠 / ラホウエン. Legal: 福楽株式会社, 第一種動物取扱業 220012A (〜2027/4/26) + 240051A (〜2029/7/16). Address: 大阪市城東区東中浜. Phone: 080-5416-7843 (schema-only, NOT publicly visible — owner privacy). LINE: https://page.line.me/915hnnlk (primary contact channel). Telegram bot for owner monitoring: @luoxueclaw_bot, chat_id 6744771747.

**Pricing**: ¥160k–¥290k. **Reviews**: 5.0★ × 113件. **Graduates**: 200+. **Awards**: みんなの子猫ブリーダー 2025 全国上半期1位.

---

## 1. Architecture (ASCII)

```
                            Customer (mobile/desktop)
                                       │
                                       │ HTTPS
                                       ▼
                  ┌────────────────────────────────────────┐
                  │ Cloudflare CDN  → fuluckpet.com        │
                  │ (DNS: Cloudflare Registrar; cache 5m)  │
                  └─────────────────────┬──────────────────┘
                                        │
                  ┌─────────────────────┴──────────────────┐
                  ▼                                        │
   ┌──────────────────────────┐         ┌──────────────────┴─────────┐
   │ GitHub Pages             │         │ Cloudflare Worker          │
   │ static origin            │         │ fuluck-api                 │
   │ ─────────                │         │ at fuluck-api.mouxue56     │
   │ 12 root HTML             │         │ .workers.dev               │
   │ 178 blog/*.html          │         │ ─────────                  │
   │ 24 kittens/*.html        │         │ 28+ routes                 │
   │ 16 parents/*.html        │         │   /api/kittens|parents|... │
   │ admin/* (3 pages + 11 js)│         │   /api/booking → KV+TG     │
   │ assets/chat/* (widget)   │         │   /api/chat → RAG + 5-LLM  │
   │ images/blog/ (24 webp)   │         │   /api/admin/* (Bearer)    │
   │ images/blog-edu/(154 wp) │         │   /api/auth (SHA-256+salt) │
   │ style.css (3213 lines)   │         └────┬───────────────────────┘
   │ i18n.js (1599 lines)     │              │
   │ sitemap.xml (227 URLs)   │              │ KV/R2 bindings
   │ llms.txt + llms-full.txt │              ▼
   └──────────────────────────┘    ┌─────────────────────────┐
                                   │ Cloudflare KV  "DATA"   │
                                   │  • articles (171 JSON)  │
                                   │  • kittens / parents    │
                                   │  • faq / reviews        │
                                   │  • settings             │
                                   │  • kb:siberian/about/.. │
                                   │    (7 RAG KB chunks)    │
                                   │  • chat:system_prompt   │
                                   │  • chat:log:*  (30d)    │
                                   │  • chat:ratelimit:*     │
                                   │  • lead:*  (90d)        │
                                   │  • booking:* (90d)      │
                                   │  • pw:salt + pw:hash    │
                                   └─────────────────────────┘
                                   ┌─────────────────────────┐
                                   │ Cloudflare R2  "BUCKET" │
                                   │  fuluck-images          │
                                   │  • uploads/* (admin)    │
                                   │  • Drive proxy cache    │
                                   └─────────────────────────┘

           5-LLM provider chain (in /api/chat handler)
           ──────────────────────────────────────────
           1. Infi deepseek-v3.2-thinking  (primary, JP cleanest)
           2. MiniMax M2.7-highspeed       (fallback 1)
           3. Kimi k2.6                    (fallback 2 — currently 403 from CF)
           4. DashScope qwen3.6-plus       (fallback 3, optional)
           5. Gemini 2.0-flash-lite        (fallback 4, optional)

           Side-effects per chat turn (await, not waitUntil)
           ──────────────────────────────────────────────────
           • RAG retrieval from KV (kittens/parents/faq/reviews + 7 kb:*)
           • Reply forwarded to Telegram @luoxueclaw_bot
           • Lead detection (email/phone/LINE regex) → Telegram NEW LEAD
           • chat:log:<sid>:<ts> persisted (30d TTL)

           Booking pipeline (/api/booking)
           ────────────────────────────────
           • validateBooking → 400 on fail
           • KV save FIRST  (booking:<reverse-ts>:<id>, 90d)
           • MailChannels email → mouxue56@gmail.com  (currently fails: SPF/DKIM not set)
           • Telegram → @luoxueclaw_bot (works)
           • GA4 generate_lead event (client-side)
```

---

## 2. Repo File Tree (key paths only)

```
~/projects/fuluckpet-website/
├── HANDOVER-CODEX.md             ← THIS FILE
├── HANDOVER.md                   ← old (pre-Sprint #2)
├── PROJECT-MEMO.md               ← Sprint #2 baseline (2026-04-27)
├── REDESIGN-BRIEF.md             ← Claude Design brief
├── ADMIN-AUDIT-SUMMARY.md
├── EMPLOYEE-GUIDE.md             ← owner-facing admin manual
├── GOOGLE-DRIVE-SETUP.md
├── TUTORIAL.md
├── CNAME                          (fuluckpet.com)
├── .env                          ← LOCAL ONLY, gitignored
├── .gitignore
├── _headers                      ← Cloudflare Pages headers (GitHub Pages ignores)
├── llms.txt                      ← AI engine summary (2.4 KB)
├── llms-full.txt                 ← AI engine full content (17 KB)
├── robots.txt                    ← AI bots allowed (Wave A)
├── sitemap.xml                   ← 227 URLs + 94 image entries
├── 404.html
│
├── 11 root HTML pages:
│   index.html, kittens.html, parents.html, siberian.html,
│   about.html, gallery.html, reviews.html, faq.html,
│   booking.html, blog.html, chat-test.html
│
├── style.css                     ← 3213 lines, layered:
│                                    base / glass / JP / a11y / mobile-cta /
│                                    readability / mobile-fab / top-crowding-fix
├── i18n.js                       ← 1599 lines, 405 keys × ja/en/zh
├── script.js                     ← global navigation + utilities
├── analytics.js                  ← GA4 ecommerce events
├── mobile-cta.js                 ← bottom sticky LINE+booking bar
├── card-loader.js                ← kitten cards from /api/kittens
├── drive-loader.js               ← Drive image proxy
├── blog-loader.js                ← blog list + Article schema injection
├── kitten-carousel.js
├── faq.css, blog.css
├── faq-loader.js, faq-page-loader.js
│
├── assets/chat/                  ← AI customer service widget (vanilla JS)
│   ├── widget.js                 ← 21 KB, window.FuluckChat
│   ├── widget.css                ← 11 KB, .fuluck-chat-* scoped
│   ├── system-prompt.txt         ← 「ふくにゃん」persona + 知識ベース rules
│   ├── avatar/fukunyan.svg
│   └── live2d/DECISION.md        ← why we use SVG, not Live2D
│
├── images/
│   ├── blog/                     ← 24 SNS atmosphere webp (Wave F, 2.1 MB)
│   │                                12 photos × 2 sizes (1200, 600)
│   └── blog-edu/                 ← 154 educational webp (Wave G, 15 MB)
│                                    77 photos × 2 sizes
│
├── blog/                         ← 178 static blog/{slug}.html files
├── kittens/                      ← per-kitten detail pages
├── parents/                      ← per-parent detail pages
├── guide/                        ← お迎えガイド subpages
├── story/                        ← stories/case studies
│
├── admin/                        ← admin panel (vanilla, no build)
│   ├── index.html                ← main panel
│   ├── blog-editor.html          ← rich-text blog editor
│   ├── bookings.html             ← booking list + filter
│   └── js/                        ← 11 modules:
│       admin-core / admin-articles / admin-blog-editor /
│       admin-bookings / admin-data / admin-drive /
│       admin-faq / admin-images / admin-photos /
│       admin-render / admin-settings / migrate / api-client
│
├── api/                          ← Cloudflare Worker
│   ├── worker.js                 ← 2221 lines (single file, fetch handler)
│   ├── wrangler.toml             ← name=fuluck-api, KV+R2 bindings
│   └── deploy.sh
│
├── tools/                        ← Node scripts (no npm deps for prod)
│   ├── generate-site.js          ← regenerates kittens/*.html, parents/*.html, sitemap
│   ├── gen-blog-kimi.mjs         ← Wave B/C/G/I article generator (Kimi)
│   ├── gen-blog-static-pages.mjs ← /blog/{slug}.html emitter
│   ├── seed-kb.js                ← outputs wrangler kv put commands for kb:* chunks
│   ├── upload-blog-bulk.sh       ← KV merge+upload helper
│   ├── translate-blog-articles.js
│   ├── scan-blog-articles.js
│   └── url-map.json
│
├── docs/
│   ├── CHAT-KB-SETUP.md          ← RAG KB seeding playbook
│   ├── CHAT-KIMI-CODINGPLAN-NOTES.md  ← why Kimi 403s from CF (Bot Fight Mode)
│   └── GOOGLE-BUSINESS-PROFILE-SETUP.md  ← post-renovation owner action
│
└── .github/workflows/
    └── regenerate-site.yml       ← cron + repository_dispatch
                                    + concurrency:regenerate-site
                                    + 5-attempt push retry with rebase
```

---

## 3. Credentials Map (locations only — never log values)

| Credential | Location | Used by |
|---|---|---|
| `KIMI_API_KEY` | `~/.env` (local) + `wrangler secret` (worker) | chat fallback 2 |
| `MINIMAX_API_KEY` | `wrangler secret` (worker) | chat fallback 1 |
| `INFI_API_KEY` | `wrangler secret` (worker) | chat primary |
| `GEMINI_API_KEY` | `wrangler secret` (worker) | chat fallback 4 + Story Card |
| `QIANWEN_API_KEY` | `wrangler secret` (worker) | Story Card AI |
| `TELEGRAM_BOT_TOKEN` | `wrangler secret` (worker) | chat sync + booking + lead alerts |
| `TELEGRAM_CHAT_ID` | `wrangler secret` (worker) | `6744771747` |
| `GOOGLE_SA_KEY` | `wrangler secret` (worker) | Drive image proxy |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `wrangler secret` (worker) | Drive root folder |
| `ADMIN_PASSWORD` | LEGACY: `wrangler secret`. **Active:** KV `pw:salt` + `pw:hash` (SHA-256). Plain: `fuluck5632` | admin login |
| GitHub PAT | `gh auth` (logged in as `mouxue56-debug`) | wrangler deploy + git push |

**Verify all secrets present**:
```bash
cd ~/projects/fuluckpet-website/api
wrangler secret list 2>&1 | grep -oE '"name": "[^"]+"' | sort -u
```
Expected names: `ADMIN_PASSWORD GEMINI_API_KEY GITHUB_TOKEN GOOGLE_DRIVE_ROOT_FOLDER_ID GOOGLE_SA_KEY INFI_API_KEY KIMI_API_KEY MINIMAX_API_KEY QIANWEN_API_KEY TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID`

---

## 4. Git History This Sprint (since `v2.0-stable-2026-04-27`)

```
fc21fcc Wave J  · detailed audit + polish (i18n FAQ 48 keys × 3 langs, sitemap/schema/mobile/perf)
b71694b merge   · auto-regen + GSC schema fix
00b57d9 fix(seo): hasMerchantReturnPolicy + shippingDetails on all Product/Offer (GSC fix)
a6ac938 Wave I  · 77 edu photos perfect 1-to-1 mapping + 4 new orphan articles via Kimi
cd3dae7 fix(chat): Telegram sync silent failure → switch ctx.waitUntil → await + status field
021645f fix(mobile): top crowding — sticky trust-strip + hero padding + iOS notch
e79390e fix(mobile-ux): chat widget → bottom-left + mobile nav FAB → bottom-right
1d363a2 fix(ci): regenerate-site workflow concurrency + push retry with rebase
cc93f3f Wave G  · 77 educational illustrations + 31 new Kimi articles
529b456 Wave F  · semantic 12-photo remap via Kimi (replaces lazy regex)
99e2efe Revert Wave E (lazy regex mapping)
a6de8d2 Wave E  · ❌ lazy regex 12-photo mapping (reverted)
3bb048d Wave D  · readability + UX polish (legal-box opacity AA fix, 38 issues)
8bd0cfa docs    · GBP setup guide for owner
fa41def Wave C  · 8 zero-overlap articles (5 Osaka/Kansai-local + 3 fuluckpet-exclusive)
20522d8 Wave B  · 10 JP long-tail blog articles via Kimi
a6fda4c fix(seo): telephone added to LocalBusiness schema (schema-only invisible)
939a39c Wave A  · AI bots unlocked + llms.txt + Article schema + LocalBusiness areaServed
594e253 docs    · PROJECT-MEMO.md baseline (Sprint #2)
v2.0-stable-2026-04-27           ← stable backup tag
```

40+ "Auto-regenerate static pages" commits filtered out — those are GitHub Actions auto-runs from admin clicks.

**Verify history**:
```bash
cd ~/projects/fuluckpet-website
git log --oneline v2.0-stable-2026-04-27..HEAD | grep -vE 'Auto-regenerate static pages$' | wc -l
# expect ~19 substantive commits
```

---

## 5. Production State (verify each)

### 5.1 Frontend live
```bash
for u in / /admin/ /llms.txt /sitemap.xml /robots.txt /blog.html /kittens.html /booking.html /faq.html; do
  printf "%-30s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "https://fuluckpet.com$u"
done
# expect: all 200
```

### 5.2 Worker live
```bash
curl -sI https://fuluck-api.mouxue56.workers.dev/api/kittens | head -3
# expect: HTTP/2 200
curl -s https://fuluck-api.mouxue56.workers.dev/api/articles | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
# expect: 171
```

### 5.3 Chat AI works (RAG-grounded)
```bash
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/chat \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"messages":[{"role":"user","content":"代表は誰ですか？"}],"session_id":"codex-verify"}' \
  --max-time 60 | python3 -c "
import json, sys
j = json.loads(sys.stdin.read())
assert j.get('provider'), 'no provider'
assert '羅方遠' in j.get('message','') or 'ラホウエン' in j.get('message',''), 'KB grounding broken'
assert j.get('telegram_status') == 'sent', f'tg failed: {j.get(\"telegram_status\")}'
print('OK provider=', j['provider'], 'tg=', j['telegram_status'])
"
# expect: OK provider=infi-deepseek-v3.2 tg=sent
# Telegram @luoxueclaw_bot should also receive a sync message within 1-2s
```

### 5.4 Booking flow
```bash
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/booking \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{}' -w '\n%{http_code}\n'
# expect: {"error":"Validation failed",...} HTTP 400

curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/booking \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"name":"Codex Verify","email":"codex@example.com","preferred_date":"2026-12-31","message":"handover verify"}' \
  -w '\n%{http_code}\n'
# expect: {"ok":true,...,"warning":"saved_but_email_failed"} HTTP 200
# (email warning is expected — MailChannels DNS not set yet; Telegram still fires)
```

### 5.5 Admin login
```bash
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/auth \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"password":"fuluck5632"}' -w '\n%{http_code}\n'
# expect: {"success":true} HTTP 200
```

### 5.6 SEO/GEO signals
```bash
# AI bots allowed
curl -s https://fuluckpet.com/robots.txt | grep -E "GPTBot|ClaudeBot|PerplexityBot"
# expect: "Allow: /" lines for each

# llms.txt valid
curl -s https://fuluckpet.com/llms.txt | head -20
# expect: # fuluckpet.com header + 大阪サイベリアン専門ブリーダー + page links

# sitemap parseable
curl -s https://fuluckpet.com/sitemap.xml | xmllint --noout - && echo OK
# expect: OK

# JSON-LD on index
curl -s https://fuluckpet.com/ | grep -c "application/ld+json"
# expect: 2 (LocalBusiness + FAQPage)

# i18n parity
node -e "
const fs = require('fs');
const txt = fs.readFileSync('$HOME/projects/fuluckpet-website/i18n.js', 'utf8');
const re = /^\s+'(\w+(?:\.\w+)*)':/gm;
const langs = {ja:0, en:0, zh:0};
let cur = null;
for (const line of txt.split('\n')) {
  const lm = line.match(/^  (ja|en|zh):\s*\{/);
  if (lm) { cur = lm[1]; continue; }
  if (cur && line.match(/^\s+'[^']+':/)) langs[cur]++;
}
console.log(langs);
"
# expect: { ja: 405, en: 405, zh: 405 }
```

### 5.7 Phone privacy (must NOT leak in HTML)
```bash
cd ~/projects/fuluckpet-website
grep -rEn '08054167843|080-5416-7843' --include='*.html' . | grep -v 'application/ld+json' | grep -v '<script type' | head
# expect: 0 matches (phone only in schema blocks)
```

---

## 6. Deployment Flow

### 6.1 Frontend → GitHub Pages
```bash
git push origin main
# auto: GitHub Pages deploys in ~1-2 min
# auto: regenerate-site workflow runs `tools/generate-site.js`
#       and commits "Auto-regenerate static pages" with concurrency lock + push retry
```

### 6.2 Backend Worker → Cloudflare
```bash
cd ~/projects/fuluckpet-website/api
wrangler deploy
# updates fuluck-api at fuluck-api.mouxue56.workers.dev
# preserves all KV/R2 bindings + secrets
```

### 6.3 KV writes
```bash
# Articles array (full replace):
curl -s https://fuluck-api.mouxue56.workers.dev/api/articles > /tmp/articles.json
# edit /tmp/articles.json
wrangler kv key put --namespace-id=d319e99874ef40d5b5836587edfee243 --remote articles --path=/tmp/articles.json

# System prompt:
wrangler kv key put --binding=DATA --remote "chat:system_prompt" --path=../assets/chat/system-prompt.txt

# Static knowledge base chunks (kb:siberian/about/visit/pricing/health/aftercare/legal):
node tools/seed-kb.js          # outputs 7 wrangler kv put commands
# (paste each into shell)
```

### 6.4 Admin password reset
```bash
SALT=$(openssl rand -hex 16); PASS="新密码"
HASH=$(printf "%s" "${PASS}:${SALT}" | shasum -a 256 | awk '{print $1}')
printf "%s" "$SALT" > /tmp/_s; printf "%s" "$HASH" > /tmp/_h
wrangler kv key put --binding=DATA --remote "pw:salt" --path=/tmp/_s
wrangler kv key put --binding=DATA --remote "pw:hash" --path=/tmp/_h
rm /tmp/_s /tmp/_h
# IMPORTANT: printf without trailing newline or auth will fail (echo adds \n)
```

### 6.5 Rollback
```bash
# Quick rollback to last stable:
git checkout v2.0-stable-2026-04-27   # detached HEAD inspection
# Or revert specific bad commit:
git revert <bad-commit>
git push origin main
# DO NOT use `git push -f` to main (owner policy + system-blocked)
```

---

## 7. Known Limitations / Pending Owner Actions

| Item | State | Blocker |
|---|---|---|
| Booking email to mouxue56@gmail.com | ⏸️ saves to KV + Telegram works; email fails | Owner must add SPF + DKIM TXT to Cloudflare DNS for fuluckpet.com (3 records, see Wave B agent report) |
| Google Business Profile | ⏸️ guide written | Owner store interior under renovation — claim after done. See `docs/GOOGLE-BUSINESS-PROFILE-SETUP.md` |
| Kimi.com 403 from Cloudflare Workers | 🛑 unfixable from our side | Kimi.com Cloudflare Bot Fight Mode rejects CF egress IPs. MiniMax+Infi cover. See `docs/CHAT-KIMI-CODINGPLAN-NOTES.md` |
| 72 of 171 KV articles have empty content.ja | ✅ by design | Body lives in static `/blog/{slug}.html`; KV stub used by listing. blog-loader.js redirects `?slug=` to static pages. |
| Drive-hosted kitten photos lack img width/height | ⚠️ small CLS risk | Worker can't pre-detect external dimensions. Acceptable. |
| Apple Touch Icon / PWA manifest / dark mode | 📋 not done | Low priority. Not blocking. |

---

## 8. What the Most Recent Sprint Did (so codex understands intent)

**Goal**: Real organic traffic from JP search + AI engines (ChatGPT/Perplexity/Claude/Gemini answers).

**Outcome**:
- 36 → 171 KV articles (+135 written by Kimi, all Japanese, all with cattery facts woven in)
- 89 distinct images (77 educational illustrations 1-to-1 with dedicated articles + 12 SNS atmosphere photos rotating across legacy generic articles)
- AI bot crawl unlocked, llms.txt opt-in policy
- Schema.org enriched: LocalBusiness + areaServed Kansai + telephone (invisible) + 38 Product entries with `hasMerchantReturnPolicy` + `shippingDetails` (GSC fix)
- Chat AI grounded in own KB (RAG via keyword retrieval); Telegram chat-sync now `await` mode (was silent-failing fire-and-forget)
- Mobile UX polished: chat widget moved to bottom-left, floating nav FAB at bottom-right, top crowding fix accounting for sticky header + trust strip + iOS notch, 38 readability fixes (most critical: legal-box opacity 0.6 → 0.85 — was making 動物取扱業 disclosure unreadable, AA fail)
- CI workflow concurrency + retry rebase to stop the email flood from racing dispatches
- i18n.js: 354 keys × 3 → 405 keys × 3 (P0 fix: FAQ 48 keys were missing entirely, EN/ZH switch left FAQ in Japanese)

**Key decisions**:
- Reverted Wave E (a6de8d2) when owner reported "图片和文章对不上" — it had used regex pattern matching giving 43/136 articles same `08_health_care` photo. Rebuilt via Kimi semantic judgment (Wave F), then 1-to-1 strict mapping in Wave I.
- Switched chat primary from Kimi → Infi after live deploy revealed Kimi 403'd from CF egress IPs (deeper than UA spoofing — Bot Fight Mode pattern analysis).
- Phone number `080-5416-7843` placed ONLY in JSON-LD schema, never visible HTML — owner explicitly asked to avoid spam calls + Japanese-language pressure (owner non-native JP speaker).

---

## 9. Codex Verify Checklist (run in order)

```bash
# 1. Repo health
cd ~/projects/fuluckpet-website
git fetch origin && git status                           # expect: clean, up-to-date
git rev-parse HEAD                                       # expect: fc21fcc...
git tag | grep v2.0-stable-2026-04-27                    # exists

# 2. Frontend smoke
for u in / /admin/ /blog.html /booking.html /faq.html /llms.txt /sitemap.xml /robots.txt; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "https://fuluckpet.com$u"
done                                                     # expect: all 200

# 3. Worker smoke
curl -s https://fuluck-api.mouxue56.workers.dev/api/articles | jq length    # 171
curl -s https://fuluck-api.mouxue56.workers.dev/api/kittens | jq length     # any int
curl -s https://fuluck-api.mouxue56.workers.dev/api/parents | jq length     # any int
curl -s https://fuluck-api.mouxue56.workers.dev/api/faq | jq length         # 24

# 4. Chat E2E (this also lights up Telegram @luoxueclaw_bot)
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/chat \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"messages":[{"role":"user","content":"価格はいくらですか？"}],"session_id":"codex-handover-verify"}' \
  --max-time 60 | jq '{provider, telegram_status, msg_len: (.message|length)}'
# expect: provider=infi-deepseek-v3.2, telegram_status=sent, msg_len > 100

# 5. Booking pipeline
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/booking \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"name":"Codex","email":"c@x.com","preferred_date":"2026-12-31"}' | jq
# expect: ok=true, request_id present, warning=saved_but_email_failed (DNS not set)

# 6. Admin auth
curl -sX POST https://fuluck-api.mouxue56.workers.dev/api/auth \
  -H 'Content-Type: application/json' -H 'Origin: https://fuluckpet.com' \
  -d '{"password":"fuluck5632"}' | jq
# expect: success=true, token=<bearer>

# 7. SEO sanity
curl -s https://fuluckpet.com/ | grep -c 'application/ld+json'           # 2
curl -s https://fuluckpet.com/kittens.html | grep -c 'application/ld+json'  # 2 (BreadcrumbList + Product array)
curl -s https://fuluckpet.com/sitemap.xml | xmllint --noout - && echo XML-OK

# 8. Phone privacy
grep -rEn '08054167843|080-5416-7843' --include='*.html' ~/projects/fuluckpet-website | \
  grep -v 'application/ld+json' | grep -v '<script type' | wc -l
# expect: 0 (phone only in schema)

# 9. i18n parity (no missing keys per language)
cd ~/projects/fuluckpet-website && node -e "
const t = require('./i18n.js');
const c = (o) => Object.keys(o || {}).length;
console.log('ja:', c(t.translations?.ja), 'en:', c(t.translations?.en), 'zh:', c(t.translations?.zh));
" 2>/dev/null || echo "(i18n.js exports differently — count via regex instead)"
# expect each lang ~ 405

# 10. wrangler secrets present
cd ~/projects/fuluckpet-website/api
wrangler secret list 2>&1 | grep -oE '"name": "[^"]+"' | sort -u
# expect 11 entries: ADMIN_PASSWORD GEMINI_API_KEY GITHUB_TOKEN GOOGLE_DRIVE_ROOT_FOLDER_ID
# GOOGLE_SA_KEY INFI_API_KEY KIMI_API_KEY MINIMAX_API_KEY QIANWEN_API_KEY
# TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
```

---

## 10. Where to Continue

**If owner asks for new content**: extend Kimi article pipeline. Pattern in `tools/gen-blog-kimi.mjs` works. Always 1500-2500 chars, JP-only, 2+ cattery facts, internal links, LINE CTA, JP-only.

**If owner wants email working**: add 3 TXT records to Cloudflare DNS for fuluckpet.com:
```
TXT @                v=spf1 a mx include:relay.mailchannels.net ~all
TXT _mailchannels    v=mc1 cfid=fuluck-api.mouxue56.workers.dev
TXT mailchannels._domainkey  v=DKIM1; p=<openssl-generated public key>
```

**If owner says "GBP renovation done"**: walk through `docs/GOOGLE-BUSINESS-PROFILE-SETUP.md`. After GBP listing exists, owner gives you GBP URL + CID + Place ID. Inject into:
- `index.html` LocalBusiness `sameAs[]` array
- `about.html` Google Maps embed
- footer "Google レビュー" button

**If owner wants new images**: drop into `~/Desktop/科普素材/<date>/`, write index.md, then run a Wave-G-style sonnet agent following the recipe in `cc93f3f` commit.

**If chat AI degrades**: check `wrangler tail` for `[tg]` and provider error logs. Likely culprits in order: (a) Telegram bot token rotated, (b) Infi/MiniMax key revoked, (c) Worker hit CPU limit on long replies — bump max_tokens down.

**Stable rollback point**: `git tag v2.0-stable-2026-04-27` (Sprint #2 + RAG/Telegram).

---

## 11. Owner Communication Style (for non-Opus agents)

Owner: Will (羅方遠), Chinese-speaking, communicates in 中文. **Preferences captured from prior interactions**:

- **Concise replies**: don't summarize at the end of every action; owner reads diffs themselves
- **Don't go in circles**: same bug fixed twice → escalate to root cause, don't keep patching
- **Photo size**: NEVER load >2000px images into conversation (kills session); use sips -Z 1600 first
- **Secrets policy**: local plaintext `.env` is OK; don't suggest rotation/Keychain/redaction
- **Branch policy**: NEVER force-push to main; create reverse-revert commits instead
- **AI provider preferences**: Kimi + MiniMax + Infi CodingPlans (all flat-fee monthly). Don't suggest OpenAI/Anthropic direct billing.
- **Privacy**: phone schema-only; he is non-native Japanese, doesn't want spam calls or Japanese-pressure cold calls
- **Content policy**: don't invent owner biography facts (only public-known: 中国出身, 大阪 cattery, license numbers, awards). Frame founder articles as "business logic for choosing Siberian + Osaka" not personal narrative.

---

## 12. Project Structure Habit (forward instruction)

Owner's parting instruction: **all future projects must include**:

1. **Architecture diagram** (ASCII or Mermaid) — see Section 1 for format
2. **Local git history** — section quoting recent commits with `git log --oneline`
3. **Self-contained handover** — every claim has a verify command, no hidden state

Every multi-agent project should produce a `HANDOVER-<agent>.md` like this one before pausing/handing off.

---

*Generated: 2026-04-28 | HEAD: fc21fcc | Status: production live*
