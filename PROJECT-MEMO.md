# fuluckpet.com 项目备忘录

> 最后更新：2026-04-27 (Sprint #2 完成 + RAG/Telegram/Lead capture 上线)
> Stable tag：`v2.0-stable-2026-04-27`

---

## 🎯 一句话定位

**福楽キャッテリー（Fuluck Cattery）** — 大阪サイベリアン専門ブリーダー的官方网站，提供子猫展示、见学预约、客户支持。日语为主（默认）+ 英/中三语切换。

代表：羅方遠（ラホウエン）/ 法人：福楽株式会社 / 所在地：大阪府大阪市城東区東中浜
登录番号：220012A（〜2027/4/26） + 240051A（〜2029/7/16）

## 🌐 生产端点

| 项 | 值 |
|---|---|
| 主域 | `https://fuluckpet.com` |
| Worker | `https://fuluck-api.mouxue56.workers.dev` |
| GitHub | https://github.com/mouxue56-debug/fuluckpet-website |
| 本地代码 | `~/projects/fuluckpet-website/` |
| 部署 | GitHub Pages（push to main 自动） + Cloudflare CDN |
| 域名管理 | Cloudflare Registrar + DNS |

## 🔐 凭证 / Secrets（仅记位置，不记值）

| 凭证 | 位置 |
|---|---|
| Admin 密码 | KV `pw:salt` + `pw:hash`（明文：`<REDACTED — rotate; creds in ~/.secrets/yuki/fuluck-admin.env>`，SHA-256+salt 哈希存储）|
| Kimi API key | `~/projects/fuluckpet-website/.env` + Cloudflare secret `KIMI_API_KEY` |
| MiniMax API key | Cloudflare secret `MINIMAX_API_KEY`（来源：`~/.openclaw/openclaw.json` minimax-coding）|
| Infi API key | Cloudflare secret `INFI_API_KEY`（来源：openclaw.json infini-ai）|
| Telegram bot | `8381253715:...`（@luoxueclaw_bot，来源：openclaw.json）|
| Telegram chat_id | `6744771747`（业主个人 Will）|
| Google Service Account | Cloudflare secret `GOOGLE_SA_KEY`（Drive 图片同步）|

## 🏗️ 架构

```
Frontend (GitHub Pages, 11 static HTML)
   ├─ index/kittens/parents/siberian/about/gallery
   ├─ reviews/faq/booking/blog/404
   ├─ i18n.js (354 keys × ja/en/zh)
   ├─ style.css (2900+ lines, glass + JP + a11y)
   ├─ assets/chat/ (widget.js + .css + SVG cat)
   ├─ analytics.js + mobile-cta.js
   └─ Sticky CTA bar / Trust badges / GA4 events
       │
       ▼ HTTPS
Cloudflare Worker fuluck-api (28+ routes)
   ├─ /api/kittens|parents|reviews|gallery|...     ← Public
   ├─ /api/booking → KV save + email + Telegram
   ├─ /api/chat → RAG retrieve + 5-LLM chain
   ├─ /api/admin/* → Bearer auth + CRUD
   ├─ /api/admin/articles/upsert (blog editor)
   ├─ /api/admin/bookings (list page)
   └─ /api/auth (SHA-256 hash verify)
       │
       ├──► KV DATA (data + 7 KB chunks + chat:*)
       ├──► R2 BUCKET (uploaded photos)
       ├──► Google Drive (cat photo folders)
       └──► 5-LLM Chain (Infi → MiniMax → Kimi → Qwen → Gemini)
```

## 📦 组件清单

### Frontend（11 root HTML + admin/ + assets/）
- `index.html` — 主页（hero + 子猫展示 + 親猫 + 评价 + LINE CTA）
- `kittens.html` / `parents.html` — 列表页（24 kittens + 16 parents Product/Animal schema）
- `siberian.html` — 品种介绍
- `about.html` — 关于猫舍 + 受赏歴
- `gallery.html` — 200+ 卒業猫相册
- `reviews.html` — 客户评价（113 条 / 5.0 ★）
- `faq.html` — FAQ + Schema FAQPage
- `booking.html` — 预约表单（POST /api/booking）
- `blog.html` — 博客列表（动态 from KV）
- `404.html` — 错误页

### Admin（内部）
- `admin/index.html` — 主面板（子猫/親猫/評価/設定/Drive 同步）
- `admin/blog-editor.html` — 富文本博客编辑器
- `admin/bookings.html` — 预约一览（自动刷新）
- 11 个 admin/js/ 模块

### Worker（`api/worker.js` ~1900 lines）
关键函数：
- `retrieveKnowledge(env, query)` — RAG 检索
- `tokenizeQuery(q)` — CJK bigram/trigram 分词
- `callKimiChat / callMiniMaxChat / callInfiChat / callDashScopeChat / callGeminiChat`
- `verifyAndMaybeMigrate(env, password)` — 哈希 + 自动迁移
- `validateBooking(body)` — 预约 validation
- `sendBookingEmail` (MailChannels) + `sendTelegramMessage`
- `extractContacts(text)` — email/phone/LINE regex 检测

### Knowledge Base
- 动态 KV：`kittens` / `parents` / `faq` / `reviews` / `settings`
- 静态 KV（`tools/seed-kb.js` 生成）：
  - `kb:siberian` — 品种介绍 (330 字)
  - `kb:about` — 猫舍故事 (301 字)
  - `kb:visit` — 见学流程 (292 字)
  - `kb:pricing` — 价格政策 (140 字)
  - `kb:health` — 健康管理 (182 字)
  - `kb:aftercare` — 售后支持 (143 字)
  - `kb:legal` — 动物取扱业 (181 字)

## 📈 已落地能力

### 视觉/UX
- Ice Cream 色板 + 液态玻璃 desktop / 纯白 mobile
- JP 阅读 metrics + Mobile-first + 老年友好（body 18px / CTA 56px / WCAG AA）
- 跳过到主内容 + aria-label + prefers-reduced-motion + prefers-contrast

### Admin 编辑体验
- 同步失败自动重试 + Drive 一键导入 album
- 富文本博客编辑器（图片拖拽到 R2 + ja/en/zh 多语言）
- 预约一览（状态筛选 + 自动刷新）

### 后端
- AI 客服 ふくにゃん：RAG ground 自有知识库 + 5-LLM chain（Infi 主）
- Telegram 同步：每对话发到 @luoxueclaw_bot
- Lead 自动告警：email/phone/LINE 检测 + 🎯 NEW LEAD
- 预约：KV 存（90d TTL）+ 邮件（待 DNS）+ Telegram
- 安全：admin SHA-256+salt / CORS scoped / try-catch + cache fallback

### SEO/GEO（已有）
- 24 kitten Product schema + 16 parent Animal schema
- LocalBusiness + FAQPage schema
- 175 entries / 94 image entries sitemap.xml
- hreflang ja/en/zh + canonical
- Open Graph + Twitter Card
- meta description 全 11 页 unique
- 123 处 alt text（日语，详细）
- Google Analytics 4 + ecommerce events

## 🔄 部署流程

### 前端
```
git push origin main → GitHub Pages auto-deploy ~1-2 分钟
```

### 后端 Worker
```
cd api && wrangler deploy
```

### KV 静态知识库
```
node tools/seed-kb.js  # 编辑后重跑
# 配合 wrangler kv key put 每个 chunk --path
```

### admin 密码改
```
SALT=$(openssl rand -hex 16); PASS="新密码"; HASH=$(printf "%s" "${PASS}:${SALT}" | shasum -a 256 | awk '{print $1}')
printf "%s" "$SALT" > /tmp/_s; printf "%s" "$HASH" > /tmp/_h
wrangler kv key put --binding=DATA --remote "pw:salt" --path=/tmp/_s
wrangler kv key put --binding=DATA --remote "pw:hash" --path=/tmp/_h
```

## 📝 commit 历史 highlights（自 145f9be 起）

```
v2.0-stable-2026-04-27 ← Sprint #2 完成稳定点
eaa315e feat(chat): Infi primary
9d40d34 fix(chat): strip MiniMax tool_call leak
4b733ca feat(chat): JP language lock + Hermes notes
7b54ed5 feat(chat): provider chain reorder
3363a96 feat(chat): RAG grounding
dacd0ff fix(chat): tighten LINE regex
98e0982 feat(chat): 5-provider + Telegram + lead capture
9e8405f feat(chat): switch to Kimi primary
3ca79ac fix(chat+line): FAQ fallback + LINE dedup
49a89aa fix(booking): camelCase aliases for admin
7be2734 chore(a11y+contrast): R3+R10 a11y fixes
145f9be docs: Sprint #2 baseline
aac3b3d Auto-regenerate static pages (pre-sprint baseline)
```

## ⚠️ 已知限制 / 待办

- ❌ Kimi.com 从 CF Worker 调用被 BFM 拦（403）— Infi/MiniMax 接管
- ⏸️ MailChannels SPF + DKIM DNS 未配置 — booking 仅 Telegram，邮件未发
- ⏸️ AI bot crawler（GPTBot/ClaudeBot 等）当前在 robots.txt 屏蔽 — Will 选择，需做 GEO 时放开
- ⏸️ Apple touch icon / PWA manifest / 暗色模式缺

## 🔗 相关文档

- `REDESIGN-BRIEF.md` — Claude Design 用 brief
- `ADMIN-AUDIT-SUMMARY.md` — admin 痛点审计
- `docs/CHAT-KB-SETUP.md` — RAG KB 设置流程
- `docs/CHAT-KIMI-CODINGPLAN-NOTES.md` — Kimi 实战经验
- `HANDOVER.md` — 旧版交接文档
- `EMPLOYEE-GUIDE.md` — 员工后台操作手册
- `GOOGLE-DRIVE-SETUP.md` — Drive Service Account 配置

## 🔄 紧急回滚（safe）

如需回到本备份点：
```bash
cd ~/projects/fuluckpet-website
git checkout v2.0-stable-2026-04-27   # detached HEAD 查看
# 或者
git revert <bad-commit>..HEAD          # 创建反向 commit
git push origin main                    # 正常推送（非 force）
```

---

*备份点：git tag `v2.0-stable-2026-04-27`（已 push 到 origin）*
