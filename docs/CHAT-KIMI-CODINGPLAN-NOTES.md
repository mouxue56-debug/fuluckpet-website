# Kimi Coding Plan — 实战经验（来自 Hermes Gateway 医院系统）

> 来源：业主 Will 的 Hermes Gateway（yyai:20053 医院 AI 客服）实战经验
> 状态：在 Hermes 本地 server 工作 ✅ / 在 fuluckpet Cloudflare Worker 不工作 ❌（Cloudflare BFM）

## TL;DR

**Coding Plan 的 Anthropic-compat endpoint 只在「非 Cloudflare egress IP」上能调通**。
fuluckpet 用 CF Worker 调 Kimi → 403 BFM 拦。
fuluckpet 当前用 MiniMax 主用（同 Coding Plan 结构，无此限制）。

## 协议规范（备未来用）

```
endpoint:    https://api.kimi.com/coding/v1/messages
auth:        x-api-key: sk-kimi-***
header:      anthropic-version: 2023-06-01
format:      Anthropic Messages API
SDK:         @anthropic-ai/sdk v0.40.1（在 Node.js）
            或直接 fetch（在 CF Workers）
model name:  kimi-k2.6（送进去）
返回 model:  kimi-for-coding（内部 alias，正常）
```

## 视觉支持

```
✅ {type:"image", source:{type:"base64", media_type:"image/jpeg", data:"..."}}
❌ {type:"image", source:{type:"url", url:"https://..."}} → unsupported image url
```

需要 worker 自己下载图 + base64 编码后发送。8MiB 上限 + MIME 校验。

## 包月模式优势

包月 flat fee，所有调用都不计费 → 二次 memory extraction / followups parsing / tool dispatch 都不增加成本。
适合 traffic 难预测的场景（医院 / 客服）。

## 实测延迟参考（Hermes 生产 6 条日志）

```
in=6147  out=172  6.3s  ✓
in=474   out=54   2.4s  ✓
in=5589  out=256  8.9s  ✓
in=240   out=75   2.8s  ✓
in=7339  out=164  6.1s  ✓
in=451   out=64   1.8s  ✓
```

## Fallback 链结构（Hermes 模式）

```
Kimi K2.6 (Coding Plan, anthropic shape, 3 retry exp backoff)
   ↓ fail
Qwen3-max (DashScope, openai shape, 3 retry)
   ↓ fail
MiniMax-M2.7-highspeed (MiniMax Coding Plan, anthropic shape, 3 retry)
   ↓ fail
throw → 500
```

每 provider 内部 3 次 exponential backoff。整链 30s 超时。

## fuluckpet 当前 chain（CF Worker — 顺序为 BFM 限制调整）

```
1. MiniMax-M2.7-highspeed   主用（无 BFM）
2. Infi deepseek-v3.2-thinking
3. Kimi-k2.6                fallback（待 CF allowlist）
4. DashScope qwen3.6-plus
5. Gemini 2.0-flash-lite
```

## Cloudflare Worker → Kimi.com 403 根因

Kimi.com 自己在 Cloudflare 后面，BFM (Bot Fight Mode) 用 pattern analysis：
- IP 段（CF egress IP 被识别为 Worker）
- TLS 指纹
- 行为序列

**单纯加 User-Agent + Accept + Origin headers 无法绕过**（已实测 3 次，仍 403）。
Cloudflare WAF 文档明确说 BFM 不能 IP allowlist 由调用端 bypass，需要 Kimi 那边主动放行。

## 3 个可行解法

### A. Hermes 代理中转（最优）
yyai:20053 加 `POST /proxy/kimi/chat`，CF Worker 调用 yyai 而非 kimi.com。
yyai 是本地 IP → BFM 放行。

### B. MiniMax 主用（fuluckpet 当前选择）
同 Coding Plan 结构，包月 flat fee，CF Worker 调用无限制。
中日双语稍弱可通过 system prompt 加强日语锁定。

### C. Moonshot 标准平台
api.moonshot.cn/v1（OpenAI-compat），无 BFM。但按 token 计费，需要单独 key（不是 sk-kimi-）。

## 已踩过的坑

- 完整路径必须 `/coding/v1/messages` — 漏 `/v1` 会 resource_not_found_error
- Cache control 不一定生效 — 日志看到 cache_read_input_tokens 但效率低
- 视觉只接 base64 不接 URL
- model 字段送 `kimi-k2.6`，返回 `kimi-for-coding` 是正常 alias

---

*文档来源：业主提供的 Hermes Gateway 生产实战总结，2026-04-27 存档*
