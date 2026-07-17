# Fuluck SEO/GEO 真实门控自动化设计

日期：2026-07-17

## 目标

在不编造配送、退货、价格有效期、评价数、健康或性格事实的前提下，修复当前可证明的 SEO/GEO 技术缺口，并建立可重复执行的 GitHub Workflow。第一轮以 Search Console、活站源代码、生产生成器和 Google 官方规范为证据，完成结构化数据收敛、抓取噪音清理、机器可读文档纠偏和持续质量门禁。

本轮不把“消除所有 Search Console 建议”当作成功标准。成功标准是：需要事实的字段保持缺席；可自动判断的错误在本地、CI、每日再生成和生产活站四层被阻断；Search Console 中已由活站修正的历史错误进入重新验证。

## 已验证现状与根因

2026-07-17 的 Search Console 实时基线为：最近三个月 144 次点击、约 3,390 次展示、CTR 4.2%、平均排名 18.1；产品摘要为 36 个有效、0 个无效；商家信息仍显示 33 个有效、3 个无效。3 个无效项来自 2026-07-04 抓取的旧列表页重复 `brand` 记录，而当前活站列表页已有 9 个 Product 对象、无重复 ID、availability 全部为合法枚举。

邮件中的 `hasMerchantReturnPolicy` 与 `shippingDetails` 是非严重建议。生产生成器曾为消除建议填入无 owner/legal 真相源的“不可退货、免费配送、固定处理与运输时效”，随后在 2026-07-10 的真实性加固中删除。当前缺字段是合规决策，不是生成器漏跑。

另有四个可证明缺口：

1. 三语 `kittens.html` 列表页为不同子猫输出多个 Product/Offer，Google 的 Merchant Listing 指南要求商品富结果聚焦单一商品页。
2. 首页和博客页仍输出已于 2024-11 停止展示的 sitelinks Search Box `SearchAction`，并已让 `blog.html?q={search_term_string}` 出现在“已抓取、尚未编入索引”样本中。
3. `llms.txt` 与 `llms-full.txt` 含易漂移的 `113` 条评价声称；`llms.txt` 还使用已返回 404 的具体子猫 URL 作示例，`llms-full.txt` 把文章数量描述为“indexed”，超出本地真相源能够证明的范围。
4. 现有 Quality Gate 与每日再生成门会跑全量测试和生成校验，但没有一个独立、可输出审计结果的 SEO/GEO 契约，也没有每周只读巡检入口。

## 方案选择

采用“真实事实门控”方案，而不是以下两条路线：

- 不采用只点 Search Console 验证的监控方案，因为它不能阻止下一次生成重新引入相同问题。
- 不采用 Merchant-first 补字段方案，因为配送与退货规则尚无可公开、可长期维护的 owner/legal 真相源。

## 架构

### 1. 商品实体层

三语子猫列表页只输出一个 `ItemList`。每个 `ListItem` 只携带 `position`、详情页 `url`、可见 `name` 和已有图片；列表页不再输出 Product 或 Offer，因此不会被误判为多商品 Merchant Listing 页面。

每个可公开且有真实价格的三语子猫详情页继续输出一个 Product。Product 使用跨语言稳定实体 ID：

```text
https://fuluckpet.com/kittens/<breederId>.html#product
```

页面语言继续由 `inLanguage` 表达，Offer 的 `url` 指向当前语言详情页。Product 的 `seller` 只引用首页已经存在的实体：

```json
{"@id":"https://fuluckpet.com/#cattery"}
```

`brand` 只出现一次。Offer 只接受 Google 支持的 Schema.org availability URL。没有真实政策时，所有列表、子猫详情和未来小动物 Product 都禁止生成 `hasMerchantReturnPolicy`、`shippingDetails` 和 `priceValidUntil`。

### 2. 抓取与可收录层

保留首页 `WebSite` 和博客页 `CollectionPage` 实体，但删除两处 `potentialAction/SearchAction`。不创建替代查询 URL，不把带搜索参数的 URL加入 sitemap、canonical、hreflang 或内链。

现有 canonical、noindex、sitemap 和 lastmod 合约继续由 `tools/verify-generated.js` 与现有测试负责。本轮不会通过批量 `noindex` 隐藏“已抓取未收录”页面，也不会为 404 历史子猫 URL创建无事实依据的重定向。

### 3. GEO 机器可读层

`llms.txt` 与 `llms-full.txt` 继续作为辅助说明，不宣称它们是 Google AI 搜索的必要条件。两份文件遵守以下事实规则：

- 评价只写稳定的 `100+` / `100件以上`，不写易漂移的精确数量。
- 子猫详情只描述 `/kittens/<breederId>.html` 路径模式，不引用任意时点的具体在售个体。
- 博客只描述“知识库/文章入口”，不声称有多少篇已被搜索引擎收录。
- 内部绝对 URL 必须能映射到仓库中的公开文件、目录首页或 sitemap 中的生成页面。
- 不添加新的健康、配送、退货、价格、奖项或服务承诺。

### 4. 确定性审计器

新增无第三方依赖的 `tools/seo-geo-audit.js`。它读取仓库静态输出并返回机器可读结果，检查：

1. 三语列表页恰好一个 ItemList、零 Product/Offer。
2. 每个公开子猫详情页最多一个 Product；有价格时恰好一个 Product。
3. Product ID、Offer URL、seller 引用、brand cardinality 和 availability 合法。
4. 未验证的 Merchant 政策字段在所有 Product/Offer 中缺席。
5. `SearchAction` 与 `{search_term_string}` 在公开 HTML 中缺席。
6. `llms*.txt` 不含精确评价数、具体易失效子猫示例或无法解析的站内 URL。
7. 审计输出包含可复现的基线提交时间、`baseCommit`、实际被审文件集合的 `inputDigest`、检查数量、errors、warnings 和状态；commit 前候选输出不得冒充旧 HEAD 的 tree。不得写 wall-clock、runner 名、绝对路径或随机值，同一输入文件集合的输出必须 byte-stable；有 error 时进程非零退出。

审计器支持把同一结果确定性写为 JSON 与 Markdown。Markdown 用于人读，JSON 用于 CI artifact 和冻结调查报告事实输入。

### 5. GitHub Workflow

新增 `SEO GEO Quality` Workflow：

- 触发：`workflow_dispatch`、每周日 19:17 UTC（周一 04:17 JST），以及全部 push / pull_request；周计划避开现有每日 18:00 UTC 再生成窗口。
- 权限：仅 `contents: read`。
- 环境：Ubuntu、Node 24，无依赖安装、无第三方 API、无生产凭据。
- 步骤：checkout 固定 SHA → 运行 SEO/GEO 专项测试 → 运行审计器生成 JSON/Markdown → 运行 `verify-generated` → 上传审计 artifact。
- 所有 GitHub-maintained actions 固定到不可变 commit SHA。

现有 `quality.yml` 和 `regenerate-site.yml` 也要调用审计器。每日再生成在 commit 前执行；如果 push 前发生 rebase，则重新生成后再次执行，避免旧结果穿过重试分支。

GitHub Pages 的动态发布工作流目前与 Quality 并行，独立 SEO/GEO Workflow 不能阻止一个已经由 main push 触发的 Pages 发布。因此生产硬门仍是：人工 push 前本地全门，以及 `regenerate-site.yml` 在自动 commit 前和 rebase retry 后的双重审计。除非另立 Pages 架构项目，本轮不把“并行检测”表述成“部署阻断”。

### 6. 第一轮内容机会

第一轮只处理可由现有事实证明、且与当前 GSC 信号直接相关的页面：大阪サイベリアン词群落地页、首页到该落地页的内链，以及高展示低点击的成本文章。允许的改动是标题、description、可见开场摘要、内部链接锚文本和 FAQ 结构重排；所有句子必须来自页面当前事实或已发布的企业实体资料。

如果代码审查发现这些页面已经满足唯一搜索意图，本轮只写入机会队列与验收基线，不为了“做内容”而制造重复段落。不得更改价格、评数、健康保证、配送范围、退货或法律承诺。

## 数据流

```text
公开 API / 已审核静态事实
        ↓
tools/generate-site.js
        ↓
列表 ItemList + 详情 Product + sitemap/lastmod
        ↓
seo-geo-audit.js + 现有测试 + verify-generated
        ↓
Quality / Regenerate / SEO GEO Quality
        ↓
main 静态发布 → 活站抽查 → GSC 历史错误验证
```

GSC 数据本轮通过 Laura 已登录的只读浏览器会话采集，不把账号、Cookie 或 OAuth 凭据写入仓库或 GitHub Secrets。没有 Search Console API 授权前，GitHub Workflow 不伪装成能自动读取 GSC。

## 错误处理与发布

- 生成器、专项审计、全量测试或 `verify-generated` 任一失败即停止，不提交、不推送。
- 从 `origin/main` 隔离 worktree 开发；发布前重新 fetch。若远端前进，rebase 后重新生成并重跑全部门。
- 只发布静态站代码。Worker 源码、KV、R2、Admin 密码、DNS、客户/预约/动物生产数据均不在本轮范围。
- 发布后确认 Quality、Pages 与目标 SHA，再检查首页、列表、三语详情、robots、llms 和目标内容页。
- 只对已经在活站修正的重复 brand 与非法 availability 历史项点击 Search Console“验证修正”。缺失配送、退货和 validFrom 的建议保持原状。
- 如果生产 smoke 失败，停止 GSC 验证；按 Git 历史回退静态提交，不部署 Worker 作为补救。

## 测试与验收

实现必须测试先行：

1. 新测试先证明当前列表页 Product、SearchAction、llms 漂移和缺少 Workflow 门禁会失败。
2. 写最小实现后，专项测试转绿；不得通过放宽断言或删除现有真实性测试过门。
3. 运行生成器两次，第二次必须无业务输出漂移。
4. 运行 `node --test tests/*.test.js`、`node tools/verify-generated.js`、`node tools/seo-geo-audit.js` 和 `git diff --check`。
5. 本地抽查桌面与手机：首页、博客、三语子猫列表、三语子猫详情、大阪落地页、成本文章；控制台无 error、无 body 横向溢出。
6. 发布后以同一 SHA 验证静态页面和 JSON-LD；GSC 验证只针对已修正历史项。
7. 在工作树外 `/Users/willma/Documents/猫舍/报告/Fuluck-SEO-GEO-质量与发布审计-2026-07-17/` 生成 `mode: investigation` 的 Heisei Editorial Grid 1.0 冻结报告包，包含 JSON、Markdown、HTML、review、QA 和三张审阅图。
8. 按知识库规则更新 NEXT、session log 与 Fuluck 发布 runbook，并 commit/push。

## 明确不做

- 不虚构或推断配送费用、运输时效、退货期限、退货费用或政策 URL。
- 不把不可退订金条款包装成商品退货政策。
- 不创建 Merchant Center 账号、feed 或广告活动。
- 不承诺搜索排名、收录数量、AI Overview 展示或富结果出现。
- 不使用付费模型/API，不发送消息，不修改 DNS，不部署 Worker，不触碰生产业务数据。
- 不公开 Search Console 登录信息、账号标识或浏览器凭据。
