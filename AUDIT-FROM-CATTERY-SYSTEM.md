# fuluckpet.com 审计报告 (cattery-system 视角)

> 审计基线: HEAD `1ed1ae7` (2026-04-28 Sprint #2 完了, tag `v2.0-stable-2026-04-27`)
> 审计日期: 2026-05-06
> 审计角度: 业务系统集成 (区别于 fc21fcc 的纯技术 audit)

---

## A. 现状评分 (5 维)

| 维度 | 评分 | 说明 |
|---|---|---|
| **技术架构** | A+ (95/100) | Workers + KV + R2 + Drive 干净分层；5-LLM chain；CI/CD 完整 |
| **内容深度** | A (90/100) | 178 篇博客 + 89 图 + 38 product schema；JP 主语言完整 |
| **客户旅程** | B (75/100) | Booking → Telegram OK；Notion CRM 缺；售后零自动化 |
| **多账号管理** | C+ (65/100) | Single brand 显示；担当ブリーダー 字段无；财务无拆分 |
| **中国客户** | C (60/100) | i18n zh 有；海外发货流程未明示；calculator 无 |

**整体**: A- (77/100)。技术非常成熟，业务集成是下一阶段重点。

---

## B. 高 ROI 优化清单 (按 cattery-system 视角)

### B1. 立即可做 (业主自己, 0 代码改动)

#### 1. SPF + DKIM TXT (HANDOVER §7 确认) — **预计 5 分钟**

问题: Booking → mouxue56@gmail.com 邮件失败。
方案: Cloudflare DNS 加 3 条 TXT 记录 (HANDOVER §10 已给完整文案)。
影响: 业主邮件确认恢复，但不阻塞 (因为 Telegram 工作)。
优先级: 中。

#### 2. Google Business Profile 设置 — **预计 30 分钟 (renovation 完了后)**

问题: 大阪本店没有 GBP 收录。
方案: 业主走 `docs/GOOGLE-BUSINESS-PROFILE-SETUP.md`。
影响: 大阪本地 SEO 提升 ~30% 流量；google review 与 koneko-breeder 评价互补。
优先级: 高 (但等装修完毕)。

#### 3. KNOWN-FACTS 校对 — **预计 15 分钟**

问题: cattery-system/KNOWN-FACTS.md 中有 8+ `[TODO_用户填写]`。
方案: 业主填写实际值。
影响: 让 cattery-system 所有文档参数一致。
优先级: 高 (这是其他工作的前置)。

---

### B2. Phase 1 范围 (1-2 周, G-02 已规划)

参考 `cattery-system/G-02-第一批增量功能.md` 全 6 个 task:

1. Booking schema 扩展 (担当ブリーダー / 海外发货 / 预算 / 渠道)
2. Telegram 通知模板增强
3. Notion API 集成 (单向: Worker → Notion)
4. 售后回访 cron (D7/D30/D90/Y1)
5. China shipping 新页面
6. Admin Dashboard 月度销售视图

**ROI 排序**:
- 最高: Task 4 (售后自动化) — 直接降低客户流失，提升复购
- 高: Task 1+2 (CRM 数据闭环) — 后续所有分析的基础
- 中: Task 3 (Notion 同步) — 业主操作便利
- 中: Task 5 (China shipping 页) — 中国客户专题流量
- 低: Task 6 (Dashboard) — 数据可视化，但 CSV 也能用

---

### B3. Phase 2 范围 (1-2 月, G-03 已规划)

5 大块:
1. Notion ↔ Worker 双向同步
2. 客户 LTV 自动计算
3. koneko-breeder 月次数据 import
4. AI 客服整合
5. 多账号 admin filter

**ROI 排序**:
- 最高: Task 2 (LTV) — 量化重点客户，决策辅助
- 高: Task 5 (多账号 filter) — 财务/运营按账号拆分必要
- 高: Task 1 (双向同步) — 业主操作 Notion 即更新网站
- 中: Task 3 (koneko import) — 月度数据回写
- 中: Task 4 (AI 整合) — 训练数据共享

---

## C. cattery-system 暴露的网站新缺口 (HANDOVER 未提)

### C1. 客户 D7-Y1 售后旅程在网站完全断层

**问题**: 网站只到 booking 完成。引渡后客户与网站的连接丢失。

**业务影响**:
- 客户售后体验靠 LINE 人工 (单点) 
- 95% 客户引渡后再不访问网站
- D90 的 koneko-breeder 评价请求转化低

**优化建议**:
- 加 `/aftercare/` 静态页 (含 D7/D30/D90/Y1 标准任务清单 + 紧急联络方式)
- 引渡时给客户专属 URL `/aftercare/?customer_id=...&cat_id=...` (含个性化时间表)
- 链接到 koneko-breeder 评价页 (D90 时间窗口)

### C2. 多账号 (羅方遠 / 刘暁棉) 在网站完全不可见

**问题**: 公开页面单一品牌，但 koneko-breeder 是两个独立账号。客户从平台进来不知道是同一家。

**业务影响**:
- 流量归因失败
- 评价合并显示不可能
- 客户疑问 "你家几个账号？"

**优化建议**:
- About 页加 "我们的两个 koneko-breeder 店铺" section
- Footer 加双平台 link
- Schema.org `LegalBusiness` 加 `sameAs[]` array

### C3. 中国客户海外发货完全无信息

**问题**: 中国客户 = 30% 来源，但网站零专题。

**优化**: G-02 Task 5 已规划。

### C4. 财务/订单/客户在网站完全不可见

**问题**: 业主 admin 看到的是 booking 记录，不是 CRM 视图。看不到一个客户全生命周期。

**优化**: G-02 Task 6 + G-03 Task 2 (LTV) 已规划。

### C5. 继续教育内容 (Day 91+ 客户保留) 缺

**问题**: 引渡后客户养猫资讯靠记忆和 LINE 临时问。如果出现网站持续提供资讯入口，客户黏性大增。

**优化建议**:
- 网站 nav 显眼位置加 "オーナー専用ガイド" (引渡后客户专题)
- 内容: 季节性护理 / 月龄健康 / 紧急情况 / 行为问题 等
- 引渡时给客户提供专属密码 (简单 cookie，不复杂)
- 来源: knowledge-base/01-猫舍経験/05-猫舍運営/ 已有大量内容

---

## D. 不建议优化的 (保持现状)

✗ **重做整个 admin UI** — 当前 vanilla 够用
✗ **换框架 (Next/React)** — 现有静态 + Worker 模式很合适，重构 ROI 负
✗ **AI Chat 完全替代人工** — 信任成本太高，3 个月内不动
✗ **加更多语言 (韩/泰/越)** — JP/EN/ZH 已经覆盖核心市场
✗ **改默认语言** — JP 是基本盘，不动
✗ **大改配色 / 设计** — 现有 brand identity 一致，不动
✗ **加复杂的会员系统** — 业务规模不到，技术债重
✗ **加付费墙 / SaaS 订阅模式** — 不符合猫舍商业模式

---

## E. 风险点 (持续监控)

### E1. Kimi 403 (HANDOVER §7)

- 状态: 已知，4-LLM fallback 工作
- 风险: 如果 Infi / MiniMax 也 403, 链断
- 监控: `wrangler tail` 看 [tg] + provider logs
- 缓解: 添加 Cloudflare AI / Anthropic Claude API 作为 fallback (低优先级)

### E2. Booking 邮件失败 (HANDOVER §7)

- 状态: 业主待办 (DNS)
- 风险: 邮件历史可能丢失部分
- 缓解: KV 90 天 TTL 已经覆盖

### E3. Drive 图片 CLS

- 状态: 已知小风险
- 缓解: 加 placeholder + lazy load (低优先级)

### E4. 自动 regen 导致 git history 混乱

- 状态: 已通过 §1.regenerate-site.yml concurrency control 缓解
- 监控: git log 中 Auto-regenerate 数量 (本月 5+ 次为正常)

### E5. APPI / PIPL 跨境 (新 — cattery-system 暴露)

- 风险: 中国客户 PII 同步到 fuluck-api (cf-jp)，需 PIPL 评估
- 缓解: 客户 PII 仅同步必要字段 (姓 + LINE，不传完整身份)
- 长期: 如果中国客户量持续增长，考虑数据本地化

---

## F. 建议优先级矩阵 (3 个月行动计划)

| 优先 | 项目 | 估时 | ROI |
|---|---|---|---|
| P1 | 业主校对 KNOWN-FACTS | 15 分 | 高 |
| P1 | 业主加 SPF/DKIM | 5 分 | 中 |
| P1 | G-02 Task 4 (售后 cron) | 2 天 | 高 |
| P1 | G-02 Task 1+2 (booking schema) | 1.5 天 | 高 |
| P1 | G-02 Task 3 (Notion sync) | 3 天 | 高 |
| P2 | G-02 Task 5 (China shipping page) | 3 天 | 中 |
| P2 | G-02 Task 6 (Admin dashboard) | 2 天 | 中 |
| P2 | C1 (售后旅程页) | 3 天 | 中 |
| P2 | 业主走 GBP 设置 | 30 分 | 高 |
| P3 | C2 (多账号 about 显示) | 1 天 | 低 |
| P3 | C5 (继续教育内容) | 1 周 | 中 |
| P3 | G-03 全部 | 1-2 月 | 中 |
| P4 | G-06 微信小程序 | 4-5 月 | 低 (现阶段) |

---

## G. Verify 命令 (审计后再跑一次)

```bash
cd /Users/lauralyu/projects/fuluckpet-website

# 1. HEAD 没变
git rev-parse HEAD                             # 期望 1ed1ae7

# 2. 没有 dirty
git status                                      # 期望 clean

# 3. 9 URL 全 200
for path in "" kittens.html parents.html about.html gallery.html reviews.html faq.html booking.html blog.html; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://fuluckpet.com/$path")
  echo "$status fuluckpet.com/$path"
done

# 4. Worker 4 API
curl -s https://fuluck-api.mouxue56.workers.dev/api/kittens | jq 'length'
curl -s https://fuluck-api.mouxue56.workers.dev/api/parents | jq 'length'
curl -s https://fuluck-api.mouxue56.workers.dev/api/faq | jq 'length'
curl -s https://fuluck-api.mouxue56.workers.dev/api/reviews | jq 'length'

# 5. AI Chat
SID="audit-$RANDOM"
curl -s -X POST https://fuluck-api.mouxue56.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"こんにちは、子猫いますか?\",\"sessionId\":\"$SID\"}" \
  | jq '.provider, .telegram_status'
```

---

## H. 结论

fuluckpet.com 当前 production state 优秀，无紧急 production 问题。
本审计未提议任何**直接代码改动**，所有优化通过 cattery-system Phase 1/2 增量推进。

下一步:
1. 业主 review cattery-system 整体 (ACTION-PLAN 行动清单)
2. 业主校对 KNOWN-FACTS
3. 决定 G-02 Task 落地节奏 (按周 / 月)
4. 由 codex / Claude 实施 G-02 (按 G-05 开发说明书)
5. 每个 task 独立 verify + push + verify

**生产保护**: 无论何时 push, 跑 §G verify 失败立即 revert。

---

## I. 引用

- `~/projects/fuluckpet-website/HANDOVER-CODEX.md` (技术 baseline)
- `~/projects/fuluckpet-website/PROJECT-MEMO.md` (Sprint #2 baseline)
- `cattery-system/G-01-现状评估与差距清单.md`
- `cattery-system/G-02-第一批增量功能.md`
- `cattery-system/G-03-第二批增量功能.md`
- `cattery-system/G-05-给程序员开发说明书.md`
- `cattery-system/ACTION-PLAN.md`
