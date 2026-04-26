# fuluckpet.com 视觉升级 Brief（给 Claude Design 用）

> 用法：在 claude.ai 左侧栏点 palette icon → 新建 Claude Design 项目 → 上传本文件 + 截图 → 粘贴下方 prompt

---

## 1. 项目事实（不要改）

| 项 | 值 |
|---|---|
| 站名 | サイベリアン｜大阪・福楽キャッテリー |
| 业务 | 大阪 Siberian 猫舍，¥160k–¥290k 子猫销售 |
| 主语言 | **日本語（默认）**，副 EN / ZH |
| 客户 | 日本本地养猫家庭，部分对猫毛过敏需求 |
| 网店外链 | https://fukurakupet.stores.jp/ |
| 评价基线 | 113+ レビュー / 5.0★ / 200+ 卒業猫 |
| 部署 | GitHub Pages，纯静态多页 HTML（无 React/Vue） |
| 域名 | fuluckpet.com |

## 2. 现有视觉资产（不要推翻）

- **色板**: Ice Cream Palette
  - mint `#7DD3C0` / strawberry `#F9B8D0` / blueberry `#B8D4F9` / mango `#FFE5A0` / taro `#D4BCF0` / peach `#FFDAB8`
  - milk 系（背景）: 同色 +95% 浅化
  - 文字: heading `#5A7A7A`, body `#5A6A6A`
- **字体**: Inter（拉丁） + Noto Sans JP（日文） + Noto Sans SC（中文）
- **圆角**: 12 / 16 / 24 / 32 px
- **阴影**: soft / card / hover / float（rgba 90,122,122 系）

> ⚠️ 这套 Ice Cream 是业主认可的基础。**不要换成糖果色 / 奶油 hero / 紫粉 candy 风** — 上次 will-ai-lab 走那条路被全盘否决。

## 3. 升级目标（按优先级）

### P0 · 日语阅读 + 下单转化
1. **JP 字体 metrics**：line-height、字距、行宽要按日语阅读优化（Noto Sans JP 在 17px 下需要 line-height 1.85 左右；行宽 ≤ 32 字最舒服）
2. **价格 / CTA 层级**：`¥160,000～¥290,000（税込）` 这种数字要醒目；"見学を予約する" / "気になる子がいたらお問い合わせ" 长按钮要好按
3. **kittens 卡片**：状态徽章（販売中 / 商談中 / ご家族決定）一眼可辨；价格 + 性别 + 月齢 三件信息位置稳定
4. **Hero 信任感**：奖项 + 评分 + 卒業猫数三个指标要平衡，别糖化

### P1 · iOS26 / 液态玻璃质感
1. 头部导航栏改 frosted glass（backdrop-filter blur(20px) + 半透明白）
2. kitten card / parent card 加 subtle glass 边缘（inner highlight + 1px 半透明边）
3. modal / dropdown 用真液态玻璃（不要伪 glass — 真的 backdrop-filter）
4. 微动效：iOS spring `cubic-bezier(0.34, 1.56, 0.64, 1)` — 现有 var(--ease-spring) 已经定义

### P2 · 信息架构微调
1. nav 现在 8+ 项太多 → 二级菜单合并
2. FAQ / 知識ライブラリ / 受賞歴 三个内容页可以共用一套 article layout
3. 评价区做 testimonial carousel 取代长 list

## 4. 不要做的事

- ❌ 不要换色板基色
- ❌ 不要把品牌名改罗马字 / 改字体到衬线
- ❌ 不要做 masonry 瀑布流（will 否决过）
- ❌ 不要 hero 大字幻灯（will 否决过）
- ❌ 不要把日语副位、英语主位
- ❌ 不要引入 React / Vue / Tailwind build chain（保持纯 HTML/CSS/JS）

## 5. Claude Design 操作步骤

1. claude.ai → 左侧栏 palette icon → New project
2. **Web capture**: 输入 `https://fuluckpet.com/`，让 Claude 提取现有 token
3. 上传本文件（REDESIGN-BRIEF.md）作为约束
4. 粘贴下方 prompt
5. 迭代到满意 → "Package for Claude Code" 导出 handoff bundle
6. 把 bundle zip 路径丢给我（在 ~/Downloads/ 即可），我接力套到 `~/projects/fuluckpet-website/redesign/2026-04-glass-jp` 分支

## 6. 推荐起手 prompt（直接粘贴）

```
This is fuluckpet.com — a Siberian cattery in Osaka selling kittens
¥160k–¥290k. Default language is Japanese. The current site already
uses an "Ice Cream" pastel palette I want to keep — do NOT change the
base colors.

Goal: keep Ice Cream tokens, add iOS 26 / Liquid Glass surface
treatment (frosted glass nav, glass cards with subtle inner highlight,
real backdrop-filter modals), and optimize Japanese reading + purchase
conversion. JP font metrics: line-height ~1.85, comfortable line width.

Generate a redesigned home page + kittens listing page + kitten detail
modal first. Show me 3 hero variants varying only the trust-signals
arrangement (award badge / star rating / graduate count). Keep all
copy in Japanese. Output should be drop-in CSS + HTML deltas — no
React, no Tailwind, no build step.
```

## 7. 我（Claude Code）这边的接力

- 工作分支：`redesign/2026-04-glass-jp`（已建好）
- 拿到 bundle 后：先在 `index.html` + `kittens.html` 套小 patch 看效果，再批量铺其他 9 个 HTML
- 多语言批量改写（i18n.js 增量翻译）→ 走 Kimi k2.6
- 每改一波本地起 `python3 -m http.server` 让你视觉确认 → 再 push main
