# REFACTOR_PLAN — 合并执行计划（Fable 裁决 + 我的可逆项）

> 本地文档，勿提交公开仓库。施工顺序（Fable）：U3&D3 → D1 → D2 → D4(并行) → UI(U1→U4→U2)。
> 状态图例：✅已上线 · 🔒待 owner · 🏗️大工程/待专场 · ⏸️降级/推迟

---

## 已上线（本轮安全自决 + 已测 + 活站验证）

- ✅ **CI 完整性闸门** `c53ac6a` — `tools/verify-generated.js`（乱码/资产漂移/重复loc→构建失败），wire 进 workflow generate 与 commit 之间；Node 18→20。测过：好产物过、注入三类故障各被挡；活站 cron 产物过。
- ✅ **生成器撞号告警（D3-C 安全版）** `aa8567d` — generate-site.js 检出重复 breederId 时在 cron 日志显式告警（不再静默覆盖），实测报出 `2509-01171 / 2508-00310 / 2508-02468`。**升级为 exit-1 待 owner 清脏数据后一行翻转**（现在硬失败会断 cron）。
- ✅ **cornerstone 图片 → webp** `aa8567d`+`c713c51` — siberian-group 288KB→37KB、siberian-main 234KB→31KB（siberian.html 省 ~454KB，siberian-main 是 LCP eager 图）；width/height 修正为真实尺寸（修 CLS）。活站 200 验证。

---

## 待 owner 拍板（Fable §5 开放问题 · 解锁后我即可施工）

- 🔒 **U3 价格一致性（Fable 全单最高优先级）** — schema/页面写 ¥160,000–¥290,000，实价 ¥140,000–¥350,000（5 只出界）。**两个问题给 owner**：(a) 这 5 只的价格是否正确（还是同 breederId 那类录入错误）？(b) 公示口径：全幅 ¥140,000–¥350,000 vs 下限式「¥140,000〜」？ → 确认后我改为构建期从真实在售数据计算 min/max，页面与 schema 同源，全站消灭手写价格副本。**红线：价格我绝不擅改。**
- 🔒 **U1 口碑原生化** — 删两张截图 PNG（~494KB），逐字转录为原生卡片（DESIGN_SPEC §4.5）。**给 owner**：截图里客户署名/地区可否原样公示（隐私）？「すべてのレビュー」外链确切 URL（疑似 koneko-breeder 评价页）？→ 授权后我读截图逐字转录施工。
- 🔒 **U2 日记降级** — Fable 建议把 /diary/ 撤出主导航+首页 teaser，保留 URL + 设计空态（§4.6），owner 交付 ≥3 篇真实图文后恢复入口。**给 owner**：同意暂时撤下导航入口吗？（这是你本轮亲自建+放进导航的功能，故不擅自撤。）
- 🔒 **U4 品牌字体 Zen Maru Gothic（半单向门）** — §4.4 签名三件套（実績帯/一笔猫线稿/低致敏 chip）用真实数据，可做；但新字体上线前 Fable 要求给 owner 看前后对比图签字。実績帯/chip 用现有字体的版本可先做，字体待签。
- 🔒 **D3 脏数据清理** — 3 对重复 breederId 哪只留原号、哪只换（涉已索引 URL），owner 拍板。清完我把生成器告警翻转成 exit-1 + 上 admin 唯一性校验。
- 🔒 **Fel d1** — owner 有无可引用检测数据/出处 → 决定低致敏 chip 能否加详情层。

---

## 大工程 / 待专场（Fable 已准，但非一夜安全可完成）

- 🏗️ **D2 i18n（准 C 限定 + B 兜底）** — 子猫列表/详情 + cornerstone 出静态 /en//zh/ + hreflang 进 sitemap；其余页 i18n 按页拆分（单页 ≤15KB），消灭 98KB 单文件。**大生成器工程**，需专场 + 逐页回归。收益：非 ja 内容对爬虫可见 + 首屏 i18n 负载下降（现每页 31KB br）。
- 🏗️ **D4 图片投递 R2 缓存（准 B）** — Worker 把 Drive 图响应写 R2 + immutable 长缓存，子猫图移出热路径。**需 worker 改 + wrangler deploy + R2 成本确认**（owner 提供 Drive 图量估算，大概率免费额内）。收益：子猫详情页 LCP 明显下降（当前最慢的图）。
- 🏗️ **D3-B admin 唯一性校验** — admin 保存 breederId 撞号即拒 + 报错文案。需 worker/admin 改 + deploy；建议与 D3 清数据一起做。

---

## ⏸️ 降级 / 推迟（含新测得的事实）

- ⏸️ **D1 minify（Fable 准 B，但实测后降级）** — **关键新事实：资产已被 Cloudflare brotli 压过** —— style.css 236KB→**37KB br**、i18n.js 98KB→**31KB br**、script.js→**10KB br**（首页 ~78KB br，Fable 目标 ≤60KB）。brotli 已吃掉大部分空白/重复，minify 边际收益仅 ~10KB br 且手工压缩有破坏风险（无构建工具链）。**结论：先做 D2（拆 i18n，31KB br/页是更大杠杆）+ 已做的图片，minify 价值远低于原始 236KB 数字的暗示。** 记录此测量以更新 D1 优先级（不重新送裁）。
- ⏸️ 剩余本地图 webp（insta-1/2/3、hero-main.jpg 冗余项）— 增量小，随手可补。
- ⏸️ diary 生成器 eager iframe → .yt-facade 懒加载 — 零当前影响（无视频帖），与 U2 一起处理。
- ⏸️ CSS 死代码清除（Fable 砍单：误删风险>收益，等有视觉回归测试再做）。

---

## 立法遵循（FABLE_PRINCIPLES 已内化）
1 真值赢（价格构建期算）· 2 双层校验（admin 拒 + 构建失败，兜底只做第三道）· 3 层级取最靠前（生成期>Worker>客户端）· 4 缺位降级不占位 · 5 先删字节再谈技术（判准：首屏可交互 + 转化页 LCP）。
