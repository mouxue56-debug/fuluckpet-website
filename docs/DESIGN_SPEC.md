# DESIGN_SPEC — Fable 审美亲笔（施工照抄基准）

> 本文件为 UI 施工唯一视觉基准。每条 UI 改动上线前逐条对照本文件 + 末尾「审美红线」验收。本地文档，勿提交公开仓库。

## 4.0 设计立场
这家店的独特性不在配色，在事实：**低致敏西伯利亚 × 2025 上半期全国 1 位 × 5.0★/113 件**。视觉工作 = 把这三个真实事实做成有形状、可反复辨认的元素；其余保持现有 mint/cream 的克制。

## 4.1 色彩 tokens（含语义映射）
```css
:root {
  /* 现有品牌色 · 不可改值 */
  --mint:        #7DD3C0;  /* 品牌装饰。chip 底、hover 面、图形浅描边。禁做正文文字色 */
  --mint-dark:   #5BC4A8;  /* 装饰深阶。渐进 hover、边框。禁做文字色 */
  --mint-deep:   #357C68;  /* 唯一可交互色。链接、主按钮底、focus ring、签名线稿描边。白/cream 上过 AA */
  --cream:       #FFFCF0;  /* 页面地色 */
  --surface:     #FFFFFF;  /* 卡片面 */
  --amber:       #946000;  /* 仅限 ★评分 与 实绩数字（全国1位/5.0/113件）。禁作警告/促销/其他强调 */
  /* 新增 · 补齐语义缺口 */
  --ink:         #26332F;  /* 正文。带绿调近黑 */
  --ink-soft:    #5C6B66;  /* 次级文字：日期/出典/caption。cream 上 ≥AA */
  --danger:      #B3261E;  /* 仅限表单错误。amber 永不做警告色 */
  --line:        #E8E2D4;  /* 分隔线/卡片描边 */
}
```
口诀：**能点的只有 deep，发光的只有 amber，铺面的只有 mint，说话的只有 ink。** 说不出归属的颜色删掉。

## 4.2 间距刻度
4px 基数，仅九档：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`。
- 卡片内边距：移动 24 / 桌面 32。区块垂直节奏：移动 64 / 桌面 96（只用这对值）。grid gap 24。
- 正文行宽：ja/zh `max-width:36em`；en `max-width:68ch`。超宽通栏正文=违规。
- 圆角：卡片 28px，小元素（chip/按钮）12px，无中间值。

## 4.3 字体阶梯
新增唯一字体 **Zen Maru Gothic**（Google Fonts，仅 500/700，subset 日文常用+假名，`font-display:swap`）。圆体柔＝毛茸茸品牌联想，和 28px 圆角同语言。zh 无覆盖回落 Noto Sans SC 700；en 用 Zen Maru 拉丁字形。
| 层级 | 字体/字重 | 尺寸 | 行高 | 用途 |
|---|---|---|---|---|
| Display/H1 | Zen Maru 700 | clamp(28,5vw,44)px | 1.25 | 每页仅一 |
| H2 | Zen Maru 700 | clamp(22,3.5vw,32)px | 1.3 | 区块标题 |
| H3 | Zen Maru 500 | 20px | 1.4 | 卡片标题 |
| 正文 ja/zh | Noto Sans JP/SC 400 | 16px | 1.9 | 日文行高≥1.8 |
| 正文 en | Inter 400 | 16px | 1.6 | |
| Caption/出典 | Inter/Noto 400 | 13px | 1.5 | 色用 --ink-soft |
| 数字（价格/统计） | Inter 600 tabular-nums | 随层级 | — | ¥140,000 类数字永远 Inter |

## 4.4 签名元素三件套（U4 品牌记忆点）
**① 実績帯（最重要）** — Hero 正下方通栏白底横带，--line 上下各 1px，三格、格间 1px --mint 竖线，每格居中两行：上行 amber 大数字（Inter/Zen Maru 700，22–28px），下行 --ink-soft 13px 说明。真实文案（照抄）：
> **全国 1位**　みんなの子猫ブリーダー 2025年上半期
> **★ 5.0**　レビュー113件
> **全頭**　遺伝子検査済み

移动端三格纵排、格间横线。「子猫一覧」「見学予約」页脚上方复用同组件（≤2 次/页）。别家抄不走——数字是真的。

**② 一笔线稿签名** — 西伯利亚猫单线连续线稿 SVG：`stroke:var(--mint-deep);stroke-width:2.5;fill:none;`，重点画蓬松尾巴那一卷。白名单四处：hero 右下 20% 透明、diary 空态插图、404 页、页脚左侧。禁铺 pattern。记忆点=一条尾巴，不是一堆爪印。

**③ 低致敏 chip** — `background:var(--mint);color:var(--ink);border-radius:12px;padding:4px 12px;font:500 13px Zen Maru;` 三语「低アレルゲンのシベリアン / Hypoallergenic Siberian / 低致敏西伯利亚猫」。位置：hero 副标题旁、每张子猫卡右上。**红线：chip 及其 tooltip 禁出现 Fel d1 数值/百分比**，除非 owner 提供来源。

## 4.5 U1 口碑区（替换截图）
结构（照抄）：`<section>` → h2「お客様の声」→ `<p class="reviews-proof">★ 5.0 ・ レビュー113件 ・ みんなの子猫ブリーダー</p>` → `.review-grid`（1col；≥768px 2col；gap 24）内 `<blockquote class="review-card">`：`.stars`(role=img aria-label=5点満点中5点 ★★★★★) + `.review-body`(逐字转录截图，一字不改) + `<footer class="review-meta">`(仅转录可见署名/地区/日期，看不见留空) → `<p class="review-source"><a href="(みんなの子猫ブリーダー真实评价页URL)">すべてのレビューを見る（113件）→</a>`。
样式：--surface 白 28px 圆角、现有分层阴影；左上装饰引号「"」Zen Maru 700 96px `color:var(--mint)` opacity .18 绝对定位溢出 8px；★ 内联 SVG 五枚 `fill:var(--amber)` 16px；正文 16/1.9 --ink 可选中；meta 13 --ink-soft。删两张 PNG。hover：translateY(-2px)+阴影，150ms。**转录红线：唯一来源是那两张截图本身，逐字；看不清宁可整条不用，不许脑补。**

## 4.6 U2 日记空态
/diary/ 保留 URL，主导航+首页 teaser 撤下。居中单列 max-width 36em，上下留白各 96。
- 插图：签名线稿(4.4-②) 宽 240px。
- 标题(H2)：ja「成長日記は、ただいま準備中です」/ en「Our kitten diary is coming soon」/ zh「成长日记筹备中」。
- 副文(正文,--ink-soft)：ja「その間に、現在ご紹介中の子猫たちをご覧ください。」/ en「In the meantime, meet the kittens currently looking for homes.」/ zh「在此期间，欢迎先看看正在寻找新家的小猫们。」
- 主按钮一枚：`background:var(--mint-deep);color:#fff;border-radius:12px;padding:12px 32px;` ja「子猫を見る」/en「See available kittens」/zh「查看待售小猫」→ 子猫列表。
- 禁：假日期/假条目/骨架屏假加载/「第一篇即将发布」类具体承诺。

## 4.7 层级总则
每页视线三跳：① H1/hero（说事实非形容词——hero 副标题直接放实绩帯，不写「最高品質」空话）→ ② 一个主 CTA（每屏至多一枚 --mint-deep 实底按钮，其余降级文字链）→ ③ 证据层（实绩帯/口碑/登録番号）。第一種動物取扱業登録固定进页脚 13px --ink-soft 全页可见。

## 审美红线（施工方绝不许做）
1. 绝不编造 owner 数据：Fel d1、价格、保证条款、客评文字、兽医名、任何统计。缺=空=问 owner。
2. 客评只许逐字转录，不润色/缩写/翻译后单独展示（翻译交浏览器，因已是真文本）。
3. 不可破坏：mint/cream 主色值、28px 卡片圆角、白卡分层阴影、amber 仅限★与实绩。
4. --amber 永不是警告色；错误态只用 --danger 且只在表单。
5. --mint / --mint-dark 永不做正文/按钮文字色；可交互只用 --mint-deep。
6. 禁爪印 pattern、emoji 当图标、stock 照片、彩虹渐变、第三主色。
7. 禁 lorem ipsum、占位标题、除「Coming soon」外的假内容。
8. 禁再用截图承载文字（U1 模式全站禁绝）。
9. 新增 web font 仅 Zen Maru Gothic（500/700 subset）一款。
10. 每屏至多一枚主按钮；间距只用九档；正文对比度 ≥AA。
11. 签名线稿只在 4.4-② 四个白名单位置。
