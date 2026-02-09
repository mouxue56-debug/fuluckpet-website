# 福楽キャッテリー 网站交接文档

> **本文档供下一个 AI 会话使用，用于快速了解本项目的全部背景。**
> 最后更新：2026-02-09

---

## 1. 项目概览

| 项目 | 内容 |
|------|------|
| **网站名称** | サイベリアン｜大阪・福楽キャッテリー（大阪西伯利亚猫舍） |
| **域名** | fuluckpet.com |
| **域名注册商** | Cloudflare Registrar |
| **CDN** | Cloudflare |
| **托管** | GitHub Pages（push 到 main 分支后自动部署） |
| **GitHub 仓库** | https://github.com/mouxue56-debug/fuluckpet-website （公开仓库） |
| **本地路径** | `/Users/willma/fuluckpet-website` |
| **网站类型** | 纯静态站点（HTML/CSS/JS），无框架，无构建工具 |
| **网店** | https://fukurakupet.stores.jp/ （STORES.jp 平台） |

**业主说中文**，沟通请用中文。网站内容以日语为主，支持英语和中文切换。

---

## 2. 技术栈与托管

- **纯静态站点**：没有 React/Vue，没有 npm/webpack
- **HTML/CSS/JS** 直接编写，push 即部署
- **GitHub Pages** 自动部署：push 到 `main` 后 1-2 分钟生效
- **Cloudflare** 负责 DNS 解析、CDN 缓存和域名管理
- **CNAME 文件** 包含 `fuluckpet.com`
- **`.nojekyll`** 告诉 GitHub Pages 不用 Jekyll

---

## 3. 文件结构

```
fuluckpet-website/
├── index.html          # 首页（メインページ）
├── siberian.html       # 品种介绍（サイベリアンの魅力）
├── about.html          # 奖项认证（受賞歴・認定）
├── gallery.html        # 毕业猫画廊（卒業猫ギャラリー）
├── reviews.html        # 客户评价（お客様の声）
├── kittens.html        # 幼猫列表（子猫一覧）— 含外链图片!
├── parents.html        # 种猫介绍（親猫紹介）— 含外链图片!
├── 404.html            # 404 错误页
├── style.css           # 全局样式
├── script.js           # 全局 JS（i18n、导航、动画）
├── i18n.js             # 翻译字典（JA/EN/ZH）
├── sitemap.xml         # SEO sitemap（7 页）
├── robots.txt          # 爬虫规则（屏蔽 /admin/ 和 /api/）
├── CNAME               # 自定义域名
├── .nojekyll           # 禁用 Jekyll
├── .gitignore
├── README.md
├── HANDOVER.md         # 本文档
├── TUTORIAL.md         # 教学文档（给业主学习）
├── images/             # 图片目录（目前空，OGP 待添加）
│   └── .gitkeep
├── admin/
│   └── index.html      # 管理后台（~1401行，完全自包含）
└── api/
    ├── worker.js        # Cloudflare Worker（未部署）
    ├── wrangler.toml    # Worker 配置
    └── deploy.sh        # 部署脚本
```

---

## 4. 管理后台（Admin Panel）

| 项目 | 内容 |
|------|------|
| **地址** | https://fuluckpet.com/admin/ |
| **密码** | `fuluck2025` |
| **实现** | 单 HTML 文件，CSS/JS 全内联 |
| **存储** | 浏览器 `localStorage`，key: `fuluckData` |
| **认证** | `sessionStorage`，关闭浏览器需重新登录 |

### 核心功能
1. **幼猫管理** — CRUD + 状态（available/reserved/sold/graduated）
2. **种猫管理** — CRUD + 退役标记
3. **照片相册** — 每猫 0-N 张 Google Photos 链接，选封面
4. **分页** — 每页 10 条，`PAGE_SIZE = 10`
5. **HTML 导出** — 生成代码粘贴到前台页面
6. **JSON 导入导出** — 数据备份恢复
7. **数据迁移** — `migrateData()` 自动转换旧格式
8. **BreederID** — 纯文本，员工手填

---

## 5. 数据模型

### 幼猫 kittens
```javascript
{
  name, breed, color, gender, birthday, price,
  status: 'available/reserved/sold/graduated',
  breederId, father, mother,
  photos: ['google_photos_url', ...],  // 0-N 张
  coverIndex: 0,                        // 封面索引
  personality, vaccinated, neutered, microchipped
}
```

### 种猫 parents
```javascript
{
  name, breed, color, gender, birthday, weight,
  photos: ['url', ...],
  coverIndex: 0,
  personality, geneticTest, retired
}
```

### 关键函数
- `getCoverPhoto(item)` — 获取封面照片 URL
- `migrateData(data)` — 旧 coverPhoto → 新 photos[] + coverIndex
- `renderGalleryGrid()` — 照片相册网格
- `renderPagination(total, current, callback, containerId)` — 分页

---

## 6. 多语言（i18n）

- 日语（默认）、英语、中文
- `i18n.js` 翻译字典 + `script.js` 切换器
- HTML 用 `data-i18n` 属性标记

---

## 7. 外部服务

| 服务 | 标识/说明 |
|------|-----------|
| **GA4** | `G-EK459EK55M`，全 8 页已嵌入 |
| **Search Console** | 已验证，sitemap 已提交成功 |
| **Cloudflare** | DNS + CDN + 域名注册 |
| **GitHub Pages** | push main 自动部署 |
| **STORES.jp** | https://fukurakupet.stores.jp/ Footer 已链接 |
| **Instagram** | @fuluckpet |
| **YouTube** | 福楽キャッテリー |
| **TikTok** | @fuluckpet |
| **LINE** | 已在网站链接 |

### SEO 状态
- ✅ title + meta description（全页面）
- ✅ OGP meta 标签（全页面）
- ✅ JSON-LD 结构化数据（全页面）
- ✅ canonical URL（全页面）
- ✅ sitemap.xml（7 页）
- ✅ robots.txt（屏蔽 admin/api）
- ✅ GA4（全 8 页）
- ✅ Search Console 验证 + sitemap
- ⚠️ `images/ogp.jpg` 不存在（社交分享无预览图）

---

## 8. 已知风险

### 🔴 高：图片外链
`parents.html` 和 `kittens.html` 有 16+ 张图从 koneko-breeder.com 外链。
对方禁止外链或删图 → 网站大面积破图。
**解决**：替换为 Google Photos 链接或自托管。

### 🟡 中：localStorage 数据
管理后台数据仅在浏览器。清缓存/换电脑 = 数据丢失。
**建议**：定期导出 JSON 备份。

### 🟡 中：OGP 图片缺失
`images/ogp.jpg` 不存在。LINE/Twitter 分享无预览。

---

## 9. 待办事项（TODO）

### P1 高优先级
1. **OGP 图片** — 需 1200x630px，放到 `images/ogp.jpg`。业主有"小孩抱猫"照片，推荐 Canva 裁剪。
2. **替换外链图片** — koneko-breeder.com → Google Photos。涉及 `parents.html` `kittens.html`。

### P2 中优先级
3. **Cloudflare Workers** — `api/worker.js` 已写未部署，业主说以后需要。
4. **员工培训** — 教员工用 Admin Panel。

### P3 低优先级
5. **删旧域名 fuluck.com** — 业主确认可删，需在 Cloudflare Dashboard 手动操作。

---

## 10. Git 工作流

```bash
cd /Users/willma/fuluckpet-website
git pull origin main          # 每次必须先拉最新！
# ... 修改文件 ...
git add <文件名>
git commit -m "描述修改

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main          # 1-2 分钟自动部署
```

---

## 11. 给下个 AI 的关键提醒

1. **先 git pull** — 避免冲突
2. **Admin 是单文件** — `admin/index.html` ~1401 行，CSS/JS 全内联
3. **没有数据库** — localStorage key `fuluckData`
4. **业主说中文** — 沟通用中文
5. **网站日语** — i18n 支持 EN/ZH
6. **照片用 Google Photos URL** — 不是文件上传
7. **别改密码** — `fuluck2025`，改前问业主
8. **外链图片危险** — koneko-breeder.com 随时可能挂
9. **公开仓库** — 别提交敏感信息
10. **纯静态** — 改文件 push 就行，没有构建步骤
