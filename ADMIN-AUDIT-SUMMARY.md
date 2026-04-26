# fuluckpet 编辑体验 Audit 摘要

> 调研日：2026-04-26 · 来源：完整代码扫描 + EMPLOYEE-GUIDE 比对

## 现有系统能力（你已经有的，没坏）
- ✅ admin 网页登录 + 11 个 JS 模块（4400 行）
- ✅ Cloudflare Worker 28 个 API（R2 图片 + KV 数据）
- ✅ 设备直传图片到 R2（`/api/admin/upload`）
- ✅ Google Drive Service Account 集成（每 30 分钟同步）
- ✅ 発行する → GitHub Actions dispatch → 静态页重生（每天凌晨 3 点也自动跑）
- ✅ AI Story Card（Gemini + 千问）
- ✅ i18n.js ja/en/zh **三语都是 350 key 完整对齐**（不需要补翻译）

## 真痛点（具体三处）

### 痛点 ①：同步失败死胡同（核心 — 80% 求助来源）
- 红色 ⚠️「同步失败」弹出 → **没有重试按钮**
- 教程写「不要点発行する，联系管理员」→ 员工就僵在那
- **Kimi 修复**：自动指数退避重试 3 次 + 手动「🔄 重试同步」按钮

### 痛点 ②：图片三条路径只一条真通，且 Drive 是误导
- URL 粘贴 ✅ 通（但要先有 URL）
- 设备直传 ✅ 通到 R2（**这是唯一真路径**）
- Google Drive ❌ **只读不能 import** — 教程写的「自动显示」是假的；员工照做但其实没绑到 album
- **Kimi 修复**：modal 里加 checkbox 选 + 「📥 Drive 选中导入」按钮（1 行调 `addGalleryPhoto`）

### 痛点 ③：手机点击目标太小 + 18 次点击/猫
- 操作按钮 padding `5px 10px`（20×24px）→ 低于 iOS 44px 安全值
- 添加一只新猫 = **18 次点击 + 2 次外部 app 切换**
- 语言偏好不持久（每次进 admin 默认日语，要手动切中文）
- **Kimi 修复**：padding 增大 + localStorage 存语言

## 死代码可清
- ~~`admin/js/migrate.js`（79 行，从未调用）~~ **修正 2026-04-26**：实际被 `admin-data.js:54 runMigration()` 调用，绑定「クラウドに移行」按钮 — 保留
- `admin/js/admin-export.js`（按钮 `display:none`） — **已于 commit `7c7a7dc` 删除**
- `migrateData()` legacy `coverPhoto` 转换（已无遗留数据） — 保留以防老 DB

## 端到端推进总盘

```
阶段 1（现在 · Kimi 跑 · ~4.5h）
   ① 同步失败重试         → admin-core.js patch
   ② Drive 导入到 album   → admin-drive.js + admin-photos.js
   ③ 手机 UX + 语言持久化  → admin/index.html CSS

阶段 2（你 + 我 · 视觉升级 · 等 Claude Design bundle）
   主站 + admin 共用 Ice Cream + iOS26 液态玻璃
   bundle 来后我接力套到 redesign/2026-04-glass-jp 分支

阶段 3（清死代码 · 1h）
   migrate.js / admin-export.js / 隐藏按钮全删
```

完整 audit（每条都带 file:line）：见 conversation log。
