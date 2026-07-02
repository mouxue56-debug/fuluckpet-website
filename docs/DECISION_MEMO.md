# fuluckpet.com 优化升级 · 决策备忘录 (DECISION_MEMO)

> 主会话 Opus 4.8 起草 · 待 Fable 裁决 · 2026-06-30
> 背景：整站近期已完成 13 轮 UI/SEO/a11y 打磨 + 两个生成器 bug 根治（资产漂移 / UTF-8 乱码）+ 6 维对抗式审计（结论：健康体检）。UI 层已重做导航/子猫卡片/口碑卡片/页脚/booking 表单/对比度。
> 本备忘录只列 **单向门 / 大影响** 的方向性决策供 Fable 裁决；可逆小决策我已自决并记于第三节，Phase 3 直接施工。

---

## 一、决策点（单向门优先 · 每条 ≤10 行 · 待裁）

### D1 · 是否引入「构建 / 压缩」步骤（部署架构 · 半单向门）
现状：纯静态无构建，HTML/CSS/JS 原样发布。`style.css` **236KB**、`i18n.js` **98KB** 均未压缩；CF 已 1 年缓存但首访仍全量下载。
- **A** 维持无构建，手工维护 — 代价：236KB CSS 每次首访全下载，无法删死代码/tree-shake
- **B** 在 cron/publish 管线加一步压缩（源码保持可读，仅部署产物 min）— 代价：管线多一步 + 需与 `?v=` 版号策略配合
- **C** 引入 esbuild/Vite 全量构建 — 代价：静态站复杂度骤升、cron 幂等性要重验
- **推荐默认：B**。验收：首屏 CSS/JS 传输体积↓≥30%，源码仍可读，cron 仍幂等且 `?v=` 自愈不破。

### D2 · i18n 架构（前端架构 · 单向门）
现状：`i18n.js` 98KB 含**全站所有页面**三语文案，每页都加载（虽 defer + 缓存）；多数页面靠客户端 JS 翻译，仅 cornerstone 有静态 `/en/ /zh/`。
- **A** 维持单文件全量 — 代价：每页多载 ~98KB 才能翻译，非 ja 内容对爬虫弱
- **B** 按页/按段拆分 i18n 包 — 代价：引用与构建复杂度上升
- **C** 更多核心页走构建期静态 `/en/ /zh/`（生成器扩展）— 代价：页面数×3、生成器工作量、hreflang 维护
- **推荐默认：C 优先（SEO + 免客户端翻译），B 兜底**。验收：核心转化页有静态三语 URL + 正确 hreflang，i18n.js 首屏负载下降。

### D3 · 重复 breederId 的根治层（数据完整性 · 单向门）
现状：3 对小猫共用同一编号 → 列表重复卡（同缩略图不同父母、同链接）、详情页互相覆盖（一只无独立页）、sitemap 曾重复。生成器已加 sitemap 去重兜底，但**根因是数据 + admin 保存不校验唯一性**。
- **A** 只在生成器兜底 + flag 给 owner — 代价：脏数据仍在，UI 仍显重复卡、仍有猫无页
- **B** admin 保存时校验 breederId 唯一（拒绝/警告）— 代价：admin 改动；owner 仍需先清历史脏数据
- **C** 生成器遇 fileId 冲突显式告警且不静默覆盖 — 代价：治标不治本
- **推荐默认：B + C（B 防未来，C 防静默）**。owner 侧清历史脏数据仍须她做。验收：admin 撞号被拦；生成器冲突有明确日志而非静默覆盖。

### D4 · 子猫图片投递路径（基础设施 · 影响转化 · 半单向门）
现状：子猫详情/画廊图走 `fuluck-api.workers.dev/api/drive/img/<id>`（Worker 代理 Google Drive），**无 CDN 缓存、渲染慢**（沙箱截图会卡死正是此因）；这是转化最关键的图。
- **A** 维持 Worker 直代理 Drive — 代价：每次回源 Drive，慢、占 Worker CPU、无边缘缓存
- **B** Worker 代理响应写 R2 + 长缓存头（首次慢、之后 CDN HIT）— 代价：R2 写入逻辑 + 失效策略
- **C** 生成期把图拉成本地/静态资源随站发布 — 代价：仓库体积、与 admin 上传流程耦合
- **推荐默认：B（缓存代理，改动小、收益大）**。验收：子猫图第二次访问 `cf-cache-status: HIT`，详情页 LCP 明显下降。

---

## 二、UI / 体验问题（只列现状问题 + 证据 · 方案属 Fable 独占）

> 近期已重做导航/卡片/口碑/页脚/booking/对比度；以下为仍存问题，**不给方案，待 DESIGN_SPEC**。

- **U1** 口碑区用**截图 PNG** 呈现真实客评（`images/review-screenshot-1.png` 254KB、`-2.png` 240KB），非原生排版组件 — 观感像"贴图"，且重、不可选中/翻译/响应式。
- **U2** 旗舰内容位「子猫成長日記」`/diary/` 已上线但**全空**（仅空态卡），首屏级功能长期留白。
- **U3** 对外**价格信号不一致**：LocalBusiness schema 与页面显示 `¥160,000–¥290,000`，但在售实价 `¥140,000–¥350,000`（5 只出界，来自 /api/kittens 真数据）。
- **U4** **品牌视觉记忆点弱**：薄荷/奶油配色统一、干净，但缺一个"只属于这家猫舍"的独特识别（hero 为通用猫舍观感）。此条纯审美，完全交 Fable。
- **U5** 首页 JS 体积：`i18n.js`98KB + `script.js`40KB + `nav.js`16KB + 多个 loader，均 defer 但对低端机首次可交互（INP/TBT）仍有压力（与 D2 关联）。

---

## 三、我自决的可逆小决策（已定 · Phase 3 直接做 · 不劳裁决）

- **本地大图转 webp + 压缩**：`siberian-group.jpg`288KB、`siberian-main.jpg`234KB、`hero-main.jpg`152KB、insta-*.jpg 等 → webp/尺寸优化（可回退）。
- **CI 完整性闸门**：在 `regenerate-site.yml` 的 generate 与 commit 之间加 `tools/verify-generated.js`（乱码 / 资产漂移 / 重复 loc 检测，失败即不 commit）——增量、可回退、防今晚同类静默退化复发。
- **Node 18 → 20 LTS**（node18 已 EOL，生成器纯原生 API，零风险）。
- **成長日記生成器 eager `<iframe>` → 站点同款 `.yt-facade` 懒加载**（零当前影响、可回退）。
- **图片 alt / loading 细节补齐**（增量）。

---

## 附录 · 证据

- 资产体积：style.css 236,009B / i18n.js 98,615B / script.js 39,899B / nav.js 16,369B。
- 本地 images 共 30MB，260 webp + 8 jpg + 5 png；最大：siberian-group.jpg 288KB、review-screenshot png 254/240KB、siberian-main.jpg 234KB、hero-main.jpg 152KB。
- 加载策略（已优）：fonts preconnect+preload+display=swap+noscript 兜底；hero-main.webp `preload as=image fetchpriority=high`；API preconnect；所有脚本 defer；GA4 async。核心页 84 个 JSON-LD 全 valid。
- 缓存头：css/img `max-age=31536000` + CF HIT；html `max-age=600` DYNAMIC。
- 子猫图：`/api/drive/img/<id>`（Worker 代理 Drive），无 CDN 缓存。
- 构建：无 package.json / 无构建；workflow node 18；cron `0 18 * * *`（GitHub 实际延迟 80–120 分钟）。
- 已修（勿重列）：两生成器资产漂移 + `res.setEncoding('utf8')`、自愈正则斜杠可选、sitemap 去重、5 处 a11y 对比度、2 处 ZH 博客乱码、nav `#awards` 断锚。
