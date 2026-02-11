# 福楽キャッテリー 网站交接文档

> **本文档供下一个 AI 会话使用，用于快速了解本项目的全部背景。**
> 最后更新：2026-02-11 Session 21c-2

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
├── index.html          # 首页（メインページ）~970行
├── siberian.html       # 品种介绍（サイベリアンの魅力）
├── about.html          # 奖项认证（受賞歴・認定）
├── gallery.html        # 毕业猫画廊（卒業猫ギャラリー）36张真实毕业猫照片
├── reviews.html        # 客户评价（お客様の声）
├── kittens.html        # 幼猫列表（子猫一覧）
├── parents.html        # 种猫介绍（親猫紹介）
├── blog.html           # 知識ライブラリ列表页（104篇静态卡片，10分类）Session 17 静态化
├── faq.html            # FAQ 独立页面（24项静态HTML + FAQPage JSON-LD）Session 17 静态化
├── booking.html        # 見学予約ページ（三語対応フォーム→Google Form POST）Session 21c-2 新増
├── 404.html            # 404 错误页
├── style.css           # 全局样式
├── blog.css            # 知识库专用样式 Session 15 新增（Session 16 追加 .article-sources 引用块样式）
├── script.js           # 全局 JS（i18n、导航、动画、modal、YouTube embed、猫咪ナビ）~780行
├── i18n.js             # 翻译字典（JA/EN/ZH）+ data-i18n-html 块替换 + langChanged 事件
├── card-loader.js      # 动态渲染（从 API 加载子猫/种猫/评价卡片）Session 15b 新增（Session 16 追加 JSON-LD Product schema）
├── kitten-carousel.js  # 动态猫咪轮播+分类化CTA（10分类×3语言上下文CTA映射）Session 18 新增，Session 19 重写
├── cta-widget.js       # 固定底栏 CTA 组件（子猫募集中+LINE 引流）Session 16 新增
├── blog-loader.js      # 知识库前端加载（blog.html列表渲染+slug重定向）Session 17 改造
├── blog-listing-i18n.js    # 博客列表页翻译数据（104篇EN/ZH标题+摘要，auto-generated）Session 21c-2
├── blog-listing-i18n-apply.js # 博客列表页运行时翻译（监听langChanged，替换hero/分类/卡片）Session 21c-2
├── faq-loader.js       # FAQ 动态加载（旧版，首页已不使用）Session 15
├── faq-page-loader.js  # FAQ 独立页面加载器（faq.html 专用，增强静态HTML）Session 17
├── sitemap.xml         # SEO sitemap（167+URL，含104篇博客文章+23猫咪详情页+booking）Session 21c-2 追加
├── robots.txt          # 爬虫规则（屏蔽 /admin/ 和 /api/）
├── CNAME               # 自定义域名
├── .nojekyll           # 禁用 Jekyll
├── .gitignore
├── README.md
├── HANDOVER.md         # 本文档
├── TUTORIAL.md         # 教学文档（给业主学习）
├── kittens/            # 猫咪独立详情页（generate-site.js 生成）Session 19 新增
│   └── *.html ×23      # 每只 available/reserved 猫咪独立页面（Product JSON-LD+BreadcrumbList）
├── blog/               # 104篇静态博客文章 Session 17
│   ├── blog-i18n.js    # 博客文章语言切换（读取 window._blogArticleI18n）
│   ├── siberian-character.html  # 例：サイベリアンの性格と特徴
│   └── ... (104篇 .html)       # 10分类：猫種知識/健康管理/飲食栄養/日常ケア/行動しつけ/子猫育て/ブリーダー選び/アレルギー/猫ライフ/シニア猫
├── images/             # 图片目录
│   ├── README-IMAGES.txt  # 双语图片准备指南
│   ├── hero-main.jpg      # 首页主图（已压缩至1200px）
│   ├── hero-main-original.jpg  # 原图备份
│   ├── ogp.jpg              # OGP社交分享预览图（1200×630px）Session 18 添加
│   ├── siberian-main.jpg  # 西伯利亚猫品种主图
│   ├── siberian-group.jpg # 西伯利亚猫集合写真
│   └── .gitkeep
├── guide/              # お迎えガイド（14子页面）
│   ├── index.html      # Guide 首页（カード一覧）
│   ├── guide.css       # Guide 专用样式
│   ├── i18n-guide-body.js  # 正文翻译（14页 × EN/ZH，1323行）
│   └── *.html ×14      # 各子页面（见第6节 i18n 说明）
├── admin/
│   ├── index.html      # 管理后台（~1160行 HTML/CSS，JS 已模块化）Session 15 重构
│   └── js/             # Admin JS 模块（Session 15 拆分）
│       ├── api-client.js    # Worker KV API 调用层（FuluckAPI 对象）
│       ├── migrate.js       # localStorage→KV 一键迁移（FuluckMigrate 对象）
│       ├── admin-images.js  # 语言系统 + 图片管理（t(), admLang, 必须最先加载）
│       ├── admin-core.js    # 核心：数据管理、认证、导航、modal/toast
│       ├── admin-render.js  # 渲染：dashboard + kittens/parents/reviews CRUD
│       ├── admin-photos.js  # 照片相册 modal
│       ├── admin-export.js  # HTML 代码生成
│       ├── admin-drive.js   # Drive 状态面板
│       ├── admin-data.js    # 数据导入导出重置
│       ├── admin-faq.js     # FAQ 管理（Session 15 新增）
│       ├── admin-articles.js # 文章管理（Session 15 新增）
│       └── admin-settings.js # 密码设置 + 初始化
├── tools/
│   ├── generate-site.js # 全站静态页面生成脚本（从API数据重新生成HTML）Session 18 新增
│   ├── generate-blog-listing-i18n.js # 博客列表页翻译数据提取（→blog-listing-i18n.js）Session 21c-2
│   ├── translate-blog-articles.js # 博客文章翻译工具（提取/注入EN/ZH）Session 21b
│   ├── migrate-images.js # 图片迁移脚本（Session 14，已完成）
│   └── url-map.json     # URL映射表（76条）
└── api/
    ├── worker.js        # Cloudflare Worker（已部署 ✅ fuluck-api.mouxue56.workers.dev）
    ├── wrangler.toml    # Worker 配置
    └── deploy.sh        # 部署脚本
```

---

## 4. 管理后台（Admin Panel）

| 项目 | 内容 |
|------|------|
| **地址** | https://fuluckpet.com/admin/ |
| **密码** | `fuluck5632` |
| **实现** | HTML/CSS 单文件（~1160行）+ 12个外部 JS 模块，全站中日双语（Session 15 模块化） |
| **存储** | Worker KV（主存储）+ `localStorage`（离线 fallback）— Session 14 已接入 |
| **认证** | Worker API 优先验证 + localStorage 兜底；`sessionStorage` 存会话密码 |

### localStorage Keys
| Key | 用途 |
|-----|------|
| `fuluck-admin-data` | 子猫/种猫/评价数据 |
| `fuluck-admin-pass` | 密码（默认 fuluck5632） |
| `fuluck-admin-log` | 操作日志 |
| `fuluck-admin-images` | 画像管理配置（URL/路径） |
| `fuluck-admin-lang` | 全站管理后台语言（ja/zh）—— Session 10 升级为全局 |

### 核心功能模块
1. **ダッシュボード** — 概览统计 + 操作日志
2. **子猫管理** — CRUD + 状态（available/reserved/sold/graduated）+ 分页
3. **親猫管理** — CRUD + 退役标记 + 分页
4. **お客様の声** — 评价管理
5. **🖼️ 画像管理** — 全站图片管理（URL + 上传 + 尺寸标签 + 预览 + HTML 生成）
6. **HTML出力** — 生成子猫/种猫/评价 HTML 代码
7. **☁️ Drive写真** — Drive 同步状态查看 + 缓存清除
8. **📝 FAQ管理**（Session 15 新增） — FAQ CRUD + 种子数据 + 三语编辑
9. **📖 文章管理**（Session 15 新增） — 知识库文章 CRUD + 8分类 + 三语编辑
10. **データ管理** — JSON 导入/导出/重置
11. **操作ガイド** — 使用指南
12. **パスワード変更** — 密码设置

### Admin JS 模块加载顺序（Session 15 模块化）
```html
<script src="js/api-client.js"></script>
<script src="js/migrate.js"></script>
<script src="js/admin-images.js"></script>  <!-- t(), admLang 必须最先 -->
<script src="js/admin-core.js"></script>     <!-- data, saveData 等核心 -->
<script src="js/admin-render.js"></script>
<script src="js/admin-photos.js"></script>
<script src="js/admin-export.js"></script>
<script src="js/admin-drive.js"></script>
<script src="js/admin-data.js"></script>
<script src="js/admin-faq.js"></script>
<script src="js/admin-articles.js"></script>
<script src="js/admin-settings.js"></script>
```
所有函数保持全局作用域（无 IIFE），各文件可直接互相访问 `data`、`saveData()`、`t()` 等。

### 画像管理配置的 18 个图片位置
| Tag | 页面 | 推荐尺寸 |
|-----|------|---------|
| hero-main | index.html Hero | 800×600px |
| gallery-1~4 | index.html 卒業猫预览 | 400×400px |
| insta-1~4 | index.html Instagram | 400×400px (1:1) |
| insta-url | Instagram 链接地址 | — |
| sib-main | siberian.html 品种主图 | 600×800px |
| sib-group | siberian.html 集合写真 | 800×450px |
| review-1 | reviews.html 罗方远截图 | 390×844px |
| review-2 | reviews.html 刘晓棉截图 | 390×844px |
| award-1~3 | about.html 受赏徽章 | 300×200px |
| genetic | about.html 基因检测证明 | 800×450px |
| ogp | 全ページ OGP | 1200×630px |

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
  video: '<iframe ...> or youtu.be/xxx',  // YouTube 嵌入代码（Session 10）
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

### 文章 articles（Session 15 新增，存 KV key: `articles`）
```javascript
{
  id, slug,
  title: { ja, en, zh },
  excerpt: { ja, en, zh },
  content: { ja, en, zh },  // HTML 格式
  category: "health|nutrition|grooming|behavior|breed|kitten|senior|lifestyle",
  coverImage: "R2 URL",
  tags: [],
  published: true,
  publishedAt, createdAt, updatedAt
}
```

### FAQ（Session 15 新增，存 KV key: `faq`）
```javascript
{
  id,
  question: { ja, en, zh },
  answer: { ja, en, zh },
  category: "general|purchase|care|health",
  order: 1,
  published: true,
  createdAt, updatedAt
}
```

### 关键函数
- `getCoverPhoto(item)` — 获取封面照片 URL
- `migrateData(data)` — 旧 coverPhoto → 新 photos[] + coverIndex
- `renderGalleryGrid()` — 照片相册网格
- `renderPagination(total, current, callback, containerId)` — 分页
- `loadImageConfig()` — 加载画像管理配置
- `handleImgUpload(fileInput, targetInputId)` — 文件上传转 base64
- `toggleAdminLang()` / `applyAdminLang()` — **全站**管理后台双语切换（Session 10）
- `toggleLoginLang()` — 登录页面双语切换
- `t(ja, zh)` — 双语文本辅助函数（用于 JS 动态生成的文本）
- `toggleImgLang()` / `applyImgLang()` — 向后兼容别名（实际调用 Admin 版本）
- `doLogin()` — 先调 Worker API `/api/auth` 验证，失败后 fallback 到 localStorage 密码（Session 13）
- `loginSuccess(pwd)` — 登录成功后存 `sessionStorage` 会话密码，供后续 API 调用
- `getSessionPass()` — 获取当前会话密码（sessionStorage → localStorage fallback）
- `loadDriveStatus()` — Drive 同步状态面板（调 `/api/admin/drive/status`）
- `clearDriveCache()` — 清除 Drive 缓存（调 `/api/admin/drive/refresh`）
- `loadDrivePhotosForItem(type, item)` — 照片管理弹窗中加载 Drive 照片预览
- `syncFromAPI()` — 从 Worker KV 拉取最新数据并更新 UI（Session 14）
- `runMigration()` — 一键迁移 localStorage 到 KV（Session 14）

---

## 6. 多语言（i18n）

- 日语（默认）、英语、中文
- `i18n.js` 翻译字典 + `script.js` 切换器
- HTML 用 `data-i18n` 属性标记
- **Admin 全站双语**（Session 10 升级）：用 `data-adm-ja` / `data-adm-zh` 属性覆盖全部页面
  - 登录页面、侧边栏、顶部栏、仪表盘、子猫管理、种猫管理、评价管理、图片管理、HTML导出、数据管理、操作指南、密码设置
  - 所有表单标签、表格表头、按钮文本、Toast 消息、确认对话框
  - `data-img-ja` / `data-img-zh` 属性保留向后兼容（画像管理页面）
  - JS 动态文本通过 `t(ja, zh)` 辅助函数实现双语

### Guide 子页面 i18n（Session 11 新增）

**机制**：`data-i18n-html` 整块 innerHTML 替换（区别于逐元素的 `data-i18n`）

**原理**：
1. `i18n.js` 第 863-878 行：检测 `[data-i18n-html]` 属性的元素
2. 切换到 en/zh 时：保存原始 HTML 到 `el._i18nOriginal`，用翻译 HTML 替换
3. 切回 ja 时：恢复 `el._i18nOriginal`
4. 翻译数据来自 `guide/i18n-guide-body.js`（`guideBodyTranslations` 全局变量）

**14个页面两种结构**：
- **Pattern A**（guide-header 在 guide-main 外面）：`data-i18n-html` 直接加在 `.guide-main` 上
  - 5个页面：visit, day1, multi-cat, neuter, price
- **Pattern B**（guide-header 在 guide-main 里面）：新增 `<div class="guide-body-content" data-i18n-html="...">` 包裹 sections
  - 9个页面：prepare, bring, home-safety, week1, family, grooming, behavior, passport, weight-log

**翻译 key 格式**：`guide.body.visit`、`guide.body.prepare`、`guide.body.homeSafety` 等

**脚本加载顺序**：`i18n.js` → `guide/i18n-guide-body.js` → `script.js`

**⚠️ 修改注意**：
- 修改 Pattern B 页面的日语正文时，只改 `guide-body-content` 内的 sections
- `guide-header` 内容（标题、导语）用的是 `data-i18n` 逐元素替换，翻译在 `i18n.js`
- 新增 guide 子页面需要：(1) 在 HTML 加属性 (2) 在 `i18n-guide-body.js` 加 EN/ZH 翻译

---

## 7. 外部服务

| 服务 | 标识/说明 |
|------|-----------|
| **GA4** | `G-EK459EK55M`，全 8 页已嵌入 |
| **Search Console** | 已验证，sitemap 已提交成功 |
| **Cloudflare** | DNS + CDN + 域名注册 |
| **GitHub Pages** | push main 自动部署 |
| **STORES.jp** | https://fukurakupet.stores.jp/ Footer 已链接 |
| **Instagram** | @fuluckpet / https://www.instagram.com/fuluckpet/ |
| **YouTube** | 福楽キャッテリー |
| **TikTok** | @fuluckpet |
| **LINE** | https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true |

### LINE 集成状态（Session 8-9）
- ✅ 全站浮动 LINE 按钮（redesigned with branded icon + animation）
- ✅ Hero 区域新增第3个CTA「まずはLINEで気軽に相談」
- ✅ 子猫区域 CTA 改为 LINE 按钮
- ✅ Modal 内 CTA 改为 LINE + 「購入前のちょっとした質問だけでもOK」
- ✅ 全 6 个子页面 LINE 浮动按钮修复（去重复 SVG + 加 target/rel）

### SEO 状态
- ✅ title + meta description（全页面，Session 16 关键词优化）
- ✅ `<meta name="keywords">`（全页面，Session 16 新增）
- ✅ OGP meta 标签（全页面）
- ✅ JSON-LD 结构化数据（全页面）— 含 FAQ + 动态 Product schema（Session 16）
- ✅ canonical URL（全页面）
- ✅ sitemap.xml（151+URL，含104篇博客文章+23猫咪详情页）Session 19 扩充
- ✅ robots.txt（屏蔽 admin/api）
- ✅ GA4（全页面已嵌入）
- ✅ Search Console 验证 + sitemap
- ✅ SEO 关键词全站布局（Session 16）：大阪/サイベリアン/ブリーダー/羅方遠/ラホウエン/みんなの子猫ブリーダー/口コミ
- ✅ kittens.html 动态 JSON-LD Product schema（每只 available 子猫独立 Product 数据）
- ✅ **104篇静态博客文章**（Session 17）：每篇独立 `/blog/{slug}.html`，含 BlogPosting JSON-LD + BreadcrumbList
- ✅ **FAQPage JSON-LD**（Session 17）：faq.html 包含24项静态FAQ + FAQPage结构化数据
- ✅ **hreflang 标签**（Session 17/19）：全站151+HTML文件添加 ja/en/zh/x-default + `?lang=` URL参数（Session 19）
- ✅ **静态博客列表页**（Session 17）：blog.html 包含104篇文章静态卡片，分10个分类
- ✅ **猫咪独立详情页**（Session 19）：23只猫独立 `/kittens/{breederId}.html`，含 Product JSON-LD + BreadcrumbList
- ✅ **分类化CTA**（Session 19）：博客文章按10个分类展示针对性引导文案（kitten-carousel.js）
- ✅ **预约按钮预留**（Session 19）：`#booking` 占位，待用户创建 Google Form 后替换
- ⚠️ `images/ogp.jpg` 尚未创建（社交分享无预览图）— OGP 路径已统一为 `/images/ogp.jpg`（Session 14）

### 内容优化状态（Session 9）
- ✅ 价格免责声明（3处：price section、FAQ、JSON-LD）
- ✅ 「トライアル」表述改为「アレルギー相性チェック」（3处：index FAQ、JSON-LD、siberian.html）
- ✅ LINE CTA 低门槛引导（3处：Hero、kitten section、modal）

---

## 8. 图片状态

### 已完成的替换
| 文件 | 位置 | 状态 |
|------|------|------|
| index.html | Hero 主图 | ✅ `images/hero-main.jpg`（已有文件） |
| index.html | 卒業猫预览 ×4 | ✅ koneko-breeder.com 外链（有真实图片） |
| siberian.html | 品种主图 | ✅ `images/siberian-main.jpg`（已有文件） |
| reviews.html | 口コミ截图 ×2 | ⚠️ `images/review-screenshot-1/2.jpg`（HTML 写好，文件待放） |

### 仍为占位符的（需要图片文件）
| 文件 | 位置 | 需要的文件名 | 尺寸 |
|------|------|-------------|------|
| index.html | Instagram ×4 | `insta-1~4.jpg` 或 URL | 400×400px |
| siberian.html | 集合写真 | ✅ `images/siberian-group.jpg`（已替换） |
| about.html | 受赏徽章 H1 | ✅ `award-2025-h1.png`（已替换） | 300×200px |
| about.html | 受赏徽章 H2 | ✅ `award-2025-h2.png`（已替换） | 300×200px |
| about.html | 评价徽章 | ✅ 已改为 CSS 展示（⭐5.00 + 113件，Session 14） | — |
| about.html | 基因检测证明 | `genetic-test.jpg`（占位符） | 800×450px |
| 全ページ | OGP | `ogp.jpg` | 1200×630px |

### ✅ siberian.html 集合写真
已替换为 `<img src="images/siberian-group.jpg">`（Session 14 确认）。

### 子猫モーダル機能（Session 12-13）
- **前後ナビボタン**：モーダル内で ‹ › ボタンで前後の子猫に切り替え（キーボード ← → 対応）
- **親猫クリック遷移**：モーダル内の父猫/母猫名をクリック → parents.html のカードにスクロール＋ハイライト
- **PC版**：ナビボタンは `position: fixed`、56px、モーダル外側に配置（overflow clipping 回避）
- **スマホ版**：40px、モーダル内側に配置
- **スクロール修正**：PC版は左右カラム独立スクロール（flex column + `min-height: 0`）、スマホ版はコンテナ全体スクロール

### ⚠️ 注意：images/ 文件夹未 git add
`hero-main.jpg`, `siberian-main.jpg`, `siberian-group.jpg`, `hero-main-original.jpg` 存在于本地但尚未 git add/commit/push。
**业主说他自己操作本地上传**，所以可能已经 push 了，先 `git status` 检查。

### ✅ koneko-breeder.com 外链图片（已迁移至 R2 — Session 14）
- 扫描发现 76 张独立图片（~165 处引用）
- 75 张成功下载并上传到 R2（1 张源站已 404）
- 所有 HTML 文件中的外链 URL 已替换为 `fuluck-api.mouxue56.workers.dev/r2/uploads/...`
- Worker 新增 `/r2/*` 公开路由提供图片服务（30 天 Cache-Control）
- 迁移工具在 `tools/migrate-images.js`，URL 映射在 `tools/url-map.json`
- **0 处 koneko-breeder.com 引用残留**（HTML 文件中）

---

## 9. 已知风险

### ✅ ~~高：图片外链~~ — 已解决（Session 14）
76 张独立图片已全部迁移至 R2，通过 Worker `/r2/` 路由提供服务。0 处外链残留。

### ✅ ~~中：localStorage 数据~~ — 已解决（Session 14）
Admin 数据现在同步到 Worker KV。每次保存自动推送到 KV，登录时自动从 KV 拉取。
数据管理面板新增"クラウドに移行"按钮可一键迁移。localStorage 保留为离线 fallback。

### 🟡 中：占位符未替换
about.html 还有 1 个占位符（基因检测证明），index.html Instagram ×4 个占位符。
受赏徽章 h1/h2 已有真实图片，评价徽章已改为 CSS 展示（Session 14）。siberian.html 集合写真已替换。

### 🟢 低：OGP 图片缺失
`images/ogp.jpg` 不存在。LINE/Twitter 分享无预览。

---

## 10. 待办事项（TODO）

### P0 立即（用户正在做）
- **用户自己操作** images/ 文件夹上传并 git push
- **用户准备** review-screenshot、award 徽章、genetic-test、instagram、ogp 图片

### P1 高优先级
1. ~~替换 siberian.html 集合写真占位符~~ — ✅ 已完成
2. **替换 about.html 2 个占位符**（评价徽章 + 基因检测）— 等用户准备好图片文件
3. **替换 index.html Instagram 4 个占位符** — 改为图片+超链接跳转Instagram
4. **OGP 图片** — 需 1200×630px，用于 LINE/Twitter/Facebook 分享
5. ~~替换外链图片~~ — ✅ 已迁移到 R2（Session 14）
6. **review-screenshot-1/2.jpg** — 用户之前上传过截图给 AI，但文件未放到 images/ 文件夹

### P0+ 全站架构升级（Session 13 规划 — 部分完成）

**A. 动态化改造**（✅ 完成 Session 14-15b）：
1. ✅ Worker 加 bulk import 端点 + `/r2/` 公开路由
2. ✅ Admin 数据双写（saveData 同步到 localStorage + KV）
3. ✅ Admin 登录后自动从 KV 拉取数据（syncFromAPI）
4. ✅ 数据管理面板一键迁移按钮 + 云端加载按钮
5. ✅ 前端动态渲染 `card-loader.js`（Session 15b）— 从 API 加载子猫/种猫/评价卡片
6. ✅ `script.js` 重构 — 提取 `window.rebindCards()` 等可重复绑定函数（Session 15b）
7. ✅ 4个 HTML 页面加载 card-loader.js（index/kittens/parents/reviews）
8. ✅ KV 种子数据导入（24子猫 + 16种猫 + 6评价 + 24FAQ + 16文章）
9. ✅ drive-loader.js 适配（Session 21c — 親猫モーダル写真カルーセル + data-images 属性追加）

**B. ✅ 知识库 + FAQ 系统 + Admin 模块化**（Session 15 完成）：
1. ✅ Admin 模块化：~1400行 inline JS 拆分为 12 个外部模块
2. ✅ Worker 加 articles + faq 端点（CRUD + bulk + 公开查询）
3. ✅ FAQ 系统：`faq-loader.js` 动态加载 + `admin-faq.js` 管理面板 + 种子数据
4. ✅ 知识库：`blog.html` + `blog.css` + `blog-loader.js`（8分类，列表+详情视图）
5. ✅ Admin 文章管理：`admin-articles.js`（三语编辑 + 8分类）
6. ✅ 全站导航更新：22个HTML文件 + i18n.js + sitemap.xml
7. ✅ 语言切换事件：i18n.js 新增 `langChanged` CustomEvent，FAQ/Blog 动态重渲染

**图片双通道**：直接上传到 R2（Admin 拖拽）+ Drive 同步（员工批量操作），两种并存。

### P1+ Google Drive 图片自动同步（Session 12 — 已完成部署 ✅）

**状态**：全部完成并已上线

**技术方案：Cloudflare Worker + R2 缓存 + Google Drive**
- 业主/员工往 Drive 放图片 → Worker 调 Drive API 获取列表 → 图片缓存到 R2（自动压缩至 2MB 以下）→ 前端从 CDN 加载

**Worker URL**: `https://fuluck-api.mouxue56.workers.dev`

**已完成**：
1. `api/worker.js` — Google Auth JWT 签名、Drive API、R2 缓存代理、**自动压缩（>2MB 时使用 Google 缩略图 API 缩小）**、缓存管理路由
2. `api/wrangler.toml` — KV namespace ID、R2 bucket、secret 变量说明
3. `drive-loader.js`（新文件）— 前端 Drive 图片加载模块
4. `script.js` — `buildCarousel()` 已改为 async，支持 Drive 异步加载
5. R2 bucket `fuluck-images` 已创建
6. KV namespace `DATA` 已创建 (ID: `d319e99874ef40d5b5836587edfee243`)
7. Secrets 已设置（GOOGLE_SA_KEY、GOOGLE_DRIVE_ROOT_FOLDER_ID、ADMIN_PASSWORD）
8. SA 密钥已轮换（旧密钥已删除）
9. Drive 文件夹已创建并共享给 SA
10. **员工教程**：`EMPLOYEE-GUIDE.md`

**Worker API 路由**：

公开端点：
- `POST /api/auth` — 密码验证（Admin 登录用）
- `GET /api/kittens` — 获取子猫列表
- `GET /api/parents` — 获取种猫列表
- `GET /api/reviews` — 获取评价列表
- `GET /api/articles` — 获取已发布文章列表（按 publishedAt 倒序）Session 15 新增
- `GET /api/articles/:slug` — 按 slug 获取单篇文章 Session 15 新增
- `GET /api/faq` — 获取已发布 FAQ 列表（按 order 排序）Session 15 新增
- `GET /r2/*` — R2 图片公开访问（30天缓存）
- `GET /api/drive/folders/:parentFolderId` — 列出子文件夹（KV 缓存 30 分钟）
- `GET /api/drive/images/:folderId` — 列出文件夹内图片（KV 缓存 30 分钟）
- `GET /api/drive/img/:fileId` — 代理图片（R2 永久缓存 + 自动压缩 + Cache-Control 7天）

管理端点（需 `Authorization: Bearer <password>` 认证）：
- `POST/PUT/DELETE /api/admin/kittens/:id` — 子猫 CRUD
- `POST /api/admin/kittens/bulk` — 子猫批量导入
- `POST/PUT/DELETE /api/admin/parents/:id` — 种猫 CRUD
- `POST /api/admin/parents/bulk` — 种猫批量导入
- `POST/PUT/DELETE /api/admin/reviews/:id` — 评价 CRUD
- `POST /api/admin/reviews/bulk` — 评价批量导入
- `POST/PUT/DELETE /api/admin/articles/:id` — 文章 CRUD Session 15 新增
- `POST /api/admin/articles/bulk` — 文章批量导入 Session 15 新增
- `POST/PUT/DELETE /api/admin/faq/:id` — FAQ CRUD Session 15 新增
- `POST /api/admin/faq/bulk` — FAQ 批量导入 Session 15 新增
- `POST /api/admin/upload` — 图片上传到 R2（multipart/form-data）
- `DELETE /api/admin/upload` — 从 R2 删除图片
- `GET /api/admin/drive/status` — Drive 同步状态
- `POST /api/admin/drive/refresh` — 清除所有 Drive 缓存
- `POST /api/admin/drive/refresh/:folderId` — 清除指定文件夹缓存

**Drive 文件夹结构（已创建）**：
```
fuluckpet-photos/  (ID: 1sbFIW5C7YfSw7zVIKhhAyCOuKivD8qUc)
├── kittens/       (ID: 1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4) ← 子猫（按 breederId 命名子文件夹）
├── parents/       (ID: 1GlqXIGEEzupIQ0WHmN4tOvlvCPE7uNuX) ← 种猫（按猫名命名）
└── gallery/       (ID: 1DilSsje7F6Oc1cktpzgIDHG8zlBEd5yt) ← 毕业猫
```

**SA 邮箱**：`fuluckpet@fuluckpet-drive.iam.gserviceaccount.com`
**GCP 教程**：`GOOGLE-DRIVE-SETUP.md`
**员工教程**：`EMPLOYEE-GUIDE.md`

**下一步**：给 HTML 页面的 kitten-card 添加 `data-drive-folder` 属性指向 Drive 文件夹 ID，实现前端自动加载

### P2 中优先级
7. ~~Google Photos 外链方案~~ → 已实施为 P1+ Worker+R2+Drive 方案（见上）
8. ~~Cloudflare Workers~~ — `api/worker.js` 已扩展 Drive 集成，等待部署
9. **FAQ 追加成交型问题** — 之前规划的但未执行

### P3 低优先级
10. **删旧域名 fuluck.com** — 业主确认可删，Cloudflare Dashboard 手动操作
11. **员工培训** — 教员工用 Admin Panel（操作指南已完善双语版）
12. **性能优化** — 考虑 lazy load / WebP / image CDN

---

## 11. Session 历史摘要

| Session | 主要工作 |
|---------|---------|
| 1-5 | 网站搭建、8页HTML、style.css、script.js、i18n、Gallery 36张毕业猫 |
| 6 | Admin 后台（子猫/种猫/评价管理 + HTML 导出 + 照片相册 + 分页） |
| 7 | GA4 + sitemap + Search Console + STORES.jp Footer + 404页 |
| 8 | LINE 浮动按钮重做 + Gallery 真实照片 + HANDOVER.md + TUTORIAL.md |
| 9 | 内容/CTA优化（价格免责、アレルギー措辞、LINE CTA）→ 图片占位符替换（Hero/Siberian/Reviews/Gallery）→ Admin 画像管理功能（双语、URL+文件上传、尺寸标签、Instagram超链接、预览）→ images/ 文件夹方案C + 双语图片指南 |
| 10 | YouTube 视频嵌入（子猫详情modal + Admin子猫表单）→ Admin 全站中日双语切换（从仅画像管理扩展到全部9个页面+登录页+所有modal+所有JS动态文本）→ 操作指南重写（8步详细双语指导）→ HANDOVER.md 更新 |
| 11 | Guide 子页面 i18n 正文切换（14页 × EN/ZH）→ Google Drive 图片同步方案规划 |
| 12 | Google Drive 图片同步全部完成：Worker+R2+Drive 方案代码 → R2/KV 创建 → Drive 文件夹+SA 配置 → Worker 部署上线 → 自动压缩功能（>2MB 图片自动缩小）→ 员工操作教程 EMPLOYEE-GUIDE.md |
| 13 | 子猫モーダル前後ナビ+親猫クリック遷移 → PC版ナビボタン拡大+スクロール修正 → Adminログイン API統合（プライベートモード対応）→ Admin Drive写真管理パネル → 写真管理モーダルにDriveプレビュー追加 → **全站架构升级计划**（动态渲染+知识库+FAQ） |
| 14 | HANDOVER修正+OGP统一+about评价徽章CSS → **图片迁移R2**（76张扫描→75张上传→Worker `/r2/` 路由→HTML URL全替换→0外链残留）→ **Admin数据持久化KV**（api-client.js+migrate.js+CRUD改造）→ 性能优化（lazy loading）|
| 15 | **Admin模块化**（~1400行inline JS→12外部模块）→ **Worker articles+FAQ端点** → **FAQ系统**（faq-loader.js动态加载+admin-faq.js管理+种子数据）→ **知识库**（blog.html+blog.css+blog-loader.js 8分类+admin-articles.js三语编辑）→ **全站导航更新**（22个HTML+i18n.js+sitemap.xml）→ i18n langChanged事件 |
| 15b | **前端动态渲染**：card-loader.js新建（~200行，从API加载子猫/种猫/评价卡片）→ script.js重构（rebindCards等可重复绑定）→ 4个HTML加载card-loader.js → KV种子数据导入（24子猫+16种猫+6评价+6FAQ）→ **FAQ改造**：首页恢复静态FAQ+添加"更多FAQ"链接 → faq.html独立页面+faq-page-loader.js（API动态加载+分类过滤）|
| 15c | **SEO优化**：blog.html/faq.html title+H1添加搜索关键词（猫の飼い方、猫のお迎えQ&A）→ **内容大扩充**：FAQ从6条→24条（4分类×6条，三语）+ 知识库16篇文章（8分类×2篇，三语HTML正文）→ faq.css高级UI（Ice Cream Design渐变+图标+徽章+动画）|
| 16 | **日期移除**：blog-loader.js 移除文章列表+详情的日期显示 → **全站SEO关键词优化**：25+个HTML文件title/description/keywords增加目标关键词（大阪/サイベリアン/ブリーダー/羅方遠/ラホウエン/みんなの子猫ブリーダー/口コミ）→ card-loader.js动态JSON-LD Product schema → **CTA引流组件**：cta-widget.js新建（固定底栏，子猫募集中X匹+LINE按钮，i18n，滚动显隐）→ 17个页面引入cta-widget.js → **知识库出处**：16篇文章追加权威引用（環境省/日本獣医師会/TICA/CFA等） |
| 17 | **SEO基础设施大升级**：104篇静态博客文章（`/blog/*.html`，含BlogPosting JSON-LD+BreadcrumbList+完整header/footer+LINE CTA+blog-i18n.js语言切换）→ blog.html列表页静态化（10分类×104篇卡片）→ faq.html静态化（24项FAQ+FAQPage JSON-LD结构化数据）→ hreflang标签全站129个文件（ja/en/zh/x-default）→ sitemap.xml扩充至128个URL → blog-loader.js slug重定向+静态链接 |
| 18 | **日期移除**（104篇博客文章+JSON-LD datePublished/dateModified）→ **kitten-carousel.js**（动态猫咪轮播组件，API实时数据+照片+价格+状态徽章，自动滚动+三语）→ **FAQ页面CTA增强**（猫咪轮播+お迎えガイド/知識ライブラリ引导）→ **OGP图片**（1200×630px品牌宣传图）→ **generate-site.js**（全站静态页面生成脚本，从API数据重新生成kittens/parents/reviews/sitemap） |
| 20 | **全站语言审计修复**：hreflang重复参数bug修复（128文件`?lang=en&lang=en`→`?lang=en`）→ i18n.js补充~50个缺失翻译键（instagram/kittens.sort/parentModal/gallery.moreLink/voice/visit.delivery/footer/kitten详情页等）+ 修正nav.shop/blog.tag日语错误 → card-loader.js 19处硬编码日语国际化（状态/性别/税/DNA检查/评价等，含langChanged监听自动刷新）→ blog-loader.js品牌名+错误消息三语化 → generate-site.js详情页模板添加data-i18n属性（面包屑/表格/CTA按钮）→ 23个详情页重新生成 |
| 19 | **占位符清理**（about.html遗传证书隐藏+index/parents親猫modal文案优化+script.js照片placeholder改善）→ **SEO排查**（noindex扫描全清✅+JSON-LD sameAs补全LINE）→ **预约按钮预留**（index.html见学区+猫咪CTA区+cta-widget.js底栏，`#booking`占位待Google Form创建）→ **分类化CTA**（kitten-carousel.js完全重写，10分类×3语言上下文CTA映射，博客文章按类别展示针对性引导文案）→ **猫咪独立详情页**（generate-site.js扩展，23只猫独立HTML页面`/kittens/{breederId}.html`，含Product JSON-LD+BreadcrumbList+照片画廊+YouTube嵌入+LINE/预约CTA）→ **列表页联动**（card-loader.js添加data-detail-url+script.js kittens.html点击跳转详情页、index.html保持弹窗）→ **hreflang ?lang=改进**（i18n.js URL参数读取+151个HTML文件hreflang添加?lang=en/?lang=zh后缀+generate-site.js模板更新）→ sitemap.xml扩充至151+URL |
| 21 | **Sitemap补全**：88篇博客HTML不在API→scan-blog-articles.js扫描导入102篇→API共118篇→sitemap 64→166 URL→generate-site.js增加磁盘扫描防漏 → **后台管理全面修复**：YouTube消失bug（saveData错误静默→同步状态指示器+错误toast+发布前强制re-sync）→图片预览19字段全部行内缩略图→DEFAULT_PASS修正→saveKitten初始化video → **奖项徽章动态化**：saveImageConfig同步settings API→about.html动态加载 |
| 21b | **博客文章三语化**：blog-i18n.js重写（兼容.blog-article HTML，自动包裹内容区域）→ translate-blog-articles.js批量工具（提取/翻译/注入/检查）→ 104篇博客文章注入EN/ZH翻译（window._blogArticleI18n数据，语言切换即时生效）→ **SEO结构化数据**：about.html添加LocalBusiness JSON-LD（奖项award/认证hasCredential/评分aggregateRating）→ EMPLOYEE-GUIDE.md更新（同步状态/YouTube操作/FAQ） |
| 21c | **見学予約フォーム連携**：Google Form作成（9项目）→全站#booking/見学を予約するボタン→Form URL置換（index×3/script.js modal/cta-widget+kitten-carousel BOOKING_URL/siberian+kittens+parents CTA/24個kitten詳細/generate-site.jsテンプレート）→ **親猫モーダル写真カルーセル**：openParentModal() async化+carousel構築（Drive写真対応）/ parentCardHTML() data-images追加 / parents.html modal-children補完 |
| 21c-2 | **博客列表页i18n**：generate-blog-listing-i18n.js提取脚本（104篇文章EN/ZH标题+摘要）→blog-listing-i18n.js数据文件（58.6KB）→blog-listing-i18n-apply.js运行时替换脚本（hero/分类/文章卡片/CTA翻译+JA缓存恢复）→ **見学予約ページ**：booking.html新建（9字段表单→Google Form POST+no-cors、Ice Cream Design System UI、sidebar信息卡+LINE替代入口）→i18n.js追加~40个booking.*翻译键（JA/EN/ZH）→全站32处予約リンクをbooking.htmlに変更（外部Form URL→内部ページ、target="_blank"削除）→sitemap.xml追加booking.html |

---

## 12. Git 工作流

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

## 13. 给下个 AI 的关键提醒

1. **先 git pull** — 避免冲突。用户可能已经自己 push 了图片
2. **先 git status** — 检查 images/ 文件夹是否已有新图片
3. **Admin 已模块化** — `admin/index.html` ~1160行 HTML/CSS + 12个 JS 模块在 `admin/js/`（Session 15）
4. **数据存储** — Worker KV（主）+ localStorage（离线 fallback），每次 saveData() 自动同步到 KV
5. **业主说中文** — 沟通用中文
6. **网站日语** — i18n 支持 EN/ZH
7. **Admin 全站双语** — 用 `data-adm-ja/zh` 属性 + `t(ja,zh)` 函数；画像管理保留 `data-img-ja/zh` 兼容
8. **YouTube 嵌入** — 子猫 `video` 字段支持 iframe embed/youtu.be/youtube.com URL，modal 自动播放
9. **照片方案** — 三种来源并存：手动 URL / 直接上传到 R2 / Drive 同步。照片管理弹窗内可预览 Drive 照片（Session 13）
10. **别改密码** — `fuluck5632`，改前问业主
11. ~~外链图片危险~~ — ✅ 已迁移到R2（Session 14），0处外链残留。图片通过 `/r2/uploads/...` 访问
12. **公开仓库** — 别提交敏感信息
13. **纯静态** — 改文件 push 就行，没有构建步骤
14. **LINE URL** — `https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true`
15. **两个 breeder 账号** — c995680（羅方遠/サイベリアン）和 d696506（刘暁棉/British/Ragdoll）
16. **Guide i18n 双机制** — guide-header 用 `data-i18n`（翻译在 i18n.js），正文用 `data-i18n-html`（翻译在 guide/i18n-guide-body.js）。两种 HTML 结构（Pattern A/B），详见第6节
17. **guide/i18n-guide-body.js** — 1323行，28个翻译块。修改日语正文后需同步更新此文件中对应的 EN/ZH 翻译
18. **Google Drive 同步已上线** — Worker 已部署至 `https://fuluck-api.mouxue56.workers.dev`
19. **员工教程** — `EMPLOYEE-GUIDE.md`，教员工如何用 Google Drive 上传猫咪照片
20. **Admin 登录已改造** — 先调 Worker API 验证，fallback 到 localStorage；隐私模式可正常使用（Session 13）
21. **Admin Drive 照片预览** — 照片管理弹窗内自动匹配 Drive 文件夹，显示缩略图网格，封面标记 📌（Session 13）
22. **⭐ 已完成&下一步** — ✅图片迁移R2 ✅Admin数据KV同步 ✅知识库+FAQ ✅Admin模块化 ✅前端动态渲染 ✅内容扩充 ✅全站SEO关键词优化 ✅CTA引流组件 ✅猫咪独立详情页 ✅分类化CTA ✅hreflang改进 ✅全站语言审计 ✅API缓存 ✅GitHub Actions ✅发布按钮 ✅多语言翻译 ✅GitHub Token配置 ✅Sitemap补全（Session21） ✅后台管理修复（Session21） ✅奖项徽章动态化（Session21） ✅104篇博客EN/ZH翻译（Session21b） ✅about.html LocalBusiness JSON-LD（Session21b） → 下一步：(1)用户创建Google Form后替换`#booking`链接 (2)drive-loader.js适配动态卡片 (3)GSC验证索引恢复
23. **Admin JS 模块** — 12个外部文件在 `admin/js/`，加载顺序关键：admin-images.js（提供 `t()`, `admLang`）必须在 admin-core.js 之前
24. **DRIVE_API 变量** — 在 `admin/js/admin-core.js` 中定义
25. **Drive 文件夹 ID 常量** — 在 `admin/js/admin-drive.js` 中：kittens `1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4`，parents `1GlqXIGEEzupIQ0WHmN4tOvlvCPE7uNuX`
26. **知识库 8 分类** — health, nutrition, grooming, behavior, breed, kitten, senior, lifestyle
27. **FAQ 4 分类** — general, purchase, care, health
28. **i18n langChanged 事件** — `setLanguage()` 触发 `window.dispatchEvent(new CustomEvent('langChanged'))`，faq-loader.js 和 blog-loader.js 监听此事件重新渲染
29. **localStorage key** — 语言设置用 `fuluckpet-lang`（不是 `fuluck-lang`）
30. **card-loader.js 动态渲染**（Session 15b）— IIFE 模式，从 API 加载数据替换硬编码 HTML 卡片。成功后调用 `window.rebindCards()` 重新绑定事件。API 失败则保留静态 HTML（SEO + 降级）
31. **script.js rebind 架构**（Session 15b）— 提取 4 个全局函数：`bindKittenCards()`（重绑点击+modal）、`bindParentCards()`（重绑click→openParentModal）、`bindAnimations()`（重绑 IntersectionObserver + glow 效果）、`rebindCards()`（总调用）
32. **card-loader.js 页面检测** — 通过 DOM 元素判断当前页面：`#kittensGrid`（index），`.page-hero` + title 关键词（kittens/parents/reviews 子页面）
33. **两个 group** — kittens/parents 按 group 分组：c995680（Siberian）和 d696506（British/Ragdoll），card-loader.js 自动分组渲染到对应网格
34. **KV 种子数据** — 24子猫 + 16种猫 + 6评价 + 24FAQ + 16文章 已导入 Worker KV，API 可直接返回数据
35. **脚本加载顺序**（前端页面）— i18n.js → drive-loader.js → card-loader.js → script.js（首页）；i18n.js → faq-page-loader.js → script.js（faq.html）；i18n.js → blog-loader.js → script.js（blog.html）
36. **FAQ 内容**（Session 15c）— 24条，4分类（general/purchase/care/health）各6条，全部三语（JA/EN/ZH），通过 `/api/admin/faq/bulk` 导入
37. **知识库文章**（Session 15c）— 16篇，8分类（health/nutrition/grooming/behavior/breed/kitten/senior/lifestyle）各2篇，每篇含三语title+excerpt+HTML content，通过 `/api/admin/articles/bulk` 导入
38. **bulk API 覆盖模式** — `/api/admin/*/bulk` 端点是全量替换（不是追加），每次 POST 会覆盖整个 KV key，发送时必须包含全部数据
39. **faq.css** — FAQ独立页面专用样式，Ice Cream Design System（渐变hero、图标筛选按钮、计数徽章、SVG手风琴图标、答案左边框高亮）
40. **faq-page-loader.js vs faq-loader.js** — faq-page-loader.js 是 faq.html 专用（用 `.active` class），faq-loader.js 是旧版首页用（用 `.open` class，有bug，已不加载）
41. **cta-widget.js**（Session 16）— IIFE 模块，固定底栏 CTA 组件。从 `/api/kittens` 获取 available 数量，显示「子猫募集中 X匹」+ LINE 按钮。内置 i18n（JA/EN/ZH），监听 `langChanged` 事件。滚动 300px 后显示，距 footer 200px 时隐藏。不在 index.html 和 admin 页面显示
42. **cta-widget 加载页面** — blog.html, faq.html, guide/index.html + 14个guide子页面（共17页）。guide 子页面用绝对路径 `/cta-widget.js`
43. **文章出处引用**（Session 16）— 16篇知识库文章末尾追加 `<div class="article-sources">` 引用块，三语。出处按分类：health→環境省/日本獣医師会/Anicom、nutrition→環境省/AAFCO/日本ペットフード協会、grooming→日本獣医師会/ICC、behavior→ASPCA/ICC/JSAB、breed→TICA/CFA/FIFe、kitten→環境省/日本獣医師会、senior→Anicom/日本獣医師会、lifestyle→環境省/日本ペットフード協会
44. **blog 日期已隐藏**（Session 16）— blog-loader.js 不再渲染日期（`formatDate()` 函数保留但不调用）。blog.css 已删除日期相关样式
45. **JSON-LD Product schema**（Session 16）— card-loader.js 在 kittens.html 渲染后，为每只 available 子猫注入 `@type: Product` JSON-LD，包含品种/性别/颜色/价格/大阪等 SEO 关键词
46. **脚本加载顺序更新** — blog.html/faq.html/guide子页面新增 cta-widget.js：i18n.js → blog-loader.js/faq-page-loader.js → cta-widget.js → script.js
47. **猫咪独立详情页**（Session 19）— generate-site.js 的 `generateKittenDetailPages()` 为每只 available/reserved 猫咪生成独立 HTML（`/kittens/{breederId}.html`）。含 Product JSON-LD + BreadcrumbList + 照片画廊 + YouTube 嵌入 + LINE CTA（自动带猫咪编号）+ 预约按钮 + 同品种推荐轮播。自动清理已售出猫咪页面
48. **分类化CTA映射**（Session 19）— kitten-carousel.js 完全重写，包含 `CTA_MAP` 对象（10分类×3语言）。博客文章通过 `.blog-meta-cat` 元素检测分类，显示针对性CTA标题和按钮（如过敏类→"アレルギーが心配？"，品种类→"サイベリアンの子猫に会いませんか？"）
49. ~~**预约按钮占位**（Session 19）~~ — ✅ Session 21c 已替换为 Google Form URL（见#78）
50. **hreflang ?lang= 参数**（Session 19）— i18n.js `initI18n()` 读取 URL `?lang=` 参数自动切换语言（优先级：URL参数 > localStorage）。所有151+HTML文件的 en/zh hreflang href 已加 `?lang=en`/`?lang=zh` 后缀
51. **详情页导航行为**（Session 19）— script.js `bindKittenCards()` 通过 `.page-hero` 检测是否在 kittens.html：是→点击跳转详情页（`data-detail-url`），否→打开弹窗（index.html 保持弹窗行为）
52. **card-loader.js data-detail-url**（Session 19）— 动态渲染猫咪卡片时自动添加 `data-detail-url="/kittens/{breederId||id}.html"` 属性，供 script.js 判断跳转目标
53. **Google搜索排查完成（Session 19）** — GSC检查结果：首页已被索引（2月9日抓取✅）但有Product JSON-LD问题（已修复）；kittens.html 已发现-尚未编入索引；blog.html Google尚未识别。已手动请求3个关键页面编入索引。Cloudflare Bot Fight Mode 确认已关闭✅，不影响Googlebot。根本原因：网站太新，Google正在处理中。sitemap已提交成功（128 URL已发现）
54. **hreflang重复参数修复（Session 20）** — Session 19的update-hreflang.py脚本运行了两次导致`?lang=en&lang=en`重复参数，已修复128个HTML文件
55. **card-loader.js i18n系统（Session 20）** — 顶部添加 `CARD_I18N` 翻译对象 + `ct()` 函数，19处硬编码日语字符串全部国际化。监听 `langChanged` 事件自动重新从API获取数据并刷新卡片。页面检测从 `document.title` 改为 `pathname` 检测以支持多语言
56. **i18n.js 翻译键完整度（Session 20）** — 修正：`nav.shop` JA从'Shop'改为'ショップ'，`blog.tag` JA/ZH从'Knowledge Base'改为正确语言。新增约50个翻译键覆盖：instagram区/kittens排序筛选/parentModal/gallery链接/voice评价来源/visit配送方式/footer标语法律/kitten详情页标签（品种/性别/毛色/生日/价格/状态/CTA按钮/面包屑等）
57. **猫咪详情页i18n（Session 20）** — generate-site.js的`buildKittenDetailHtml()`添加data-i18n属性（面包屑用common.home+kitten.breadcrumb.kittens，表格用kitten.breed/sex/color/birthday/status/note，CTA用kitten.lineChat/bookVisit/backToList，父母用parents.papa/mama+kitten.parentInfo，视频用kitten.video，税用kitten.taxIncl）
58. **API缓存修复（Session 20b）** — Worker API的`json()`函数添加Cache-Control参数：频繁变动数据（kittens/parents/reviews）设为`no-store`，静态数据（articles/faq/gallery/settings）设为`public, max-age=3600`。解决了正常浏览器缓存旧数据而隐私模式正常的问题
59. **GitHub Actions自动重建（Session 20b）** — 新建`.github/workflows/regenerate-site.yml`：支持repository_dispatch（API触发）、workflow_dispatch（手动触发）、schedule（每天JST 3:00定时）。运行`node tools/generate-site.js`后自动commit+push
60. **管理面板发布按钮（Session 20b）** — Worker添加`/api/admin/publish`端点（调用GitHub API触发repository_dispatch）；api-client.js添加`publish()`方法；admin/index.html顶栏添加「📤 発行する」按钮（带loading状态+toast反馈）；Dashboard添加操作提示卡片。~~需要配置：GitHub Fine-grained Token → Cloudflare Worker `GITHUB_TOKEN` 环境变量~~ ✅ Session 20c 已配置完成
61. **小猫内容多语言翻译（Session 20b）** — card-loader.js的CARD_I18N添加breeds/roles映射+ctBreed()/ctRole()函数，品种名（サイベリアン→Siberian/西伯利亚猫等）和角色名翻译；i18n.js添加breed.siberian等翻译键+data-i18n-birthday日期格式化处理；generate-site.js详情页数据值（品种/性别/状态/生日）全部添加data-i18n属性
62. **员工操作教程更新（Session 20b）** — EMPLOYEE-GUIDE.md全面重写，增加管理面板操作教程（添加/修改/售出小猫）、发布按钮说明、日常工作流程总结
63. **GitHub Token + Cloudflare配置完成（Session 20c）** — 创建 Fine-grained PAT `fuluck-worker-publish`（无过期时间，Actions+Contents权限，限定fuluckpet-website仓库）；Cloudflare Worker设置 `GITHUB_TOKEN` Secret；`wrangler deploy` 完成。发布按钮完全可用
64. **详情页导航404修复（Session 20c）** — generate-site.js的`extractDetailTemplate()`添加`toAbsoluteLinks()`函数，将header/footer中所有相对链接（`href="kittens.html"`）转为绝对路径（`href="/kittens.html"`），解决从`/kittens/xxxx.html`点击导航404的问题。同时创建`kittens/index.html`重定向页面作为fallback，清理逻辑排除index.html
65. **详情页Drive照片合并（Session 20c）** — generate-site.js新增`enrichKittensWithDrivePhotos()`函数，在生成静态页面前查询Drive API获取多照片，合并到kitten数据中。目前6只猫有Drive照片（5-6张/只），详情页自动显示缩略图画廊。无Drive照片的猫咪不受影响
66. **Drive图片加载时序修复（Session 20c）** — card-loader.js在所有页面渲染完成后dispatch `cardsLoaded`事件；drive-loader.js监听该事件后重新扫描卡片并替换Drive图片，解决card-loader替换HTML后drive-loader图片丢失的竞态问题
67. **动态卡片多语言完善（Session 20c）** — card-loader.js的`langChanged`事件处理扩展到kittens.html和parents.html页面（之前只支持index.html），语言切换时自动重新获取API数据并以新语言渲染卡片
68. **Sitemap补全（Session 21）** — 发现104篇博客HTML只有16篇在API/sitemap中。tools/scan-blog-articles.js扫描脚本从blog HTML提取元数据，102篇导入API（共118篇）。generate-site.js的updateSitemap()新增磁盘扫描：即使文章不在API也会被sitemap收录（防漏机制）。sitemap从64→166个URL
69. **后台管理系统修复（Session 21）** — YouTube地址消失根因：saveData() API错误被`.catch(function(){})` 静默吞掉。修复：(1)saveData显示☁️同步状态指示器（同步中/已同步/失败）+toast警告 (2)handlePublish改为先强制bulkImport再触发发布 (3)DEFAULT_PASS修正为fuluck5632 (4)saveKitten新建时初始化video字段 (5)syncFromAPI显示加载状态
70. **图片预览修复（Session 21）** — admin-images.js的updateAllPreviews()为所有19个图片字段自动创建行内缩略图预览（之前只有hero-main有）。handleImgUpload上传后立即刷新预览。base64图片显示⚠警告提示
71. **奖项徽章动态化（Session 21）** — saveImageConfig()同步图片配置到`/api/admin/settings`（PUT，存到KV key:settings）。about.html末尾添加脚本从`/api/settings`动态加载award图片URL替换硬编码src。流程：后台改图→保存→settings API更新→网页自动加载
72. **知识库文章API数据（Session 21）** — API现有118篇文章（16篇原始三语+102篇从HTML扫描导入仅日语title/excerpt）。scan-blog-articles.js可重复运行检测差异。10个分类：breed/health/nutrition/grooming/behavior/kitten/breeder/allergy/lifestyle/senior
73. **⚠ 后台关键流程** — 员工编辑→保存（localStorage+API bulkImport）→顶栏显示同步状态→点发布（先re-sync再触发GitHub Actions）→约2分钟后网站更新。如果同步状态显示⚠️失败，发布前会弹确认框警告
74. **博客文章三语化（Session 21b）** — 104篇博客全部注入EN/ZH翻译数据。机制：每篇文章`</body>`前添加`<script>window._blogArticleI18n={en:{title,content},zh:{title,content}}</script>`，blog-i18n.js读取后按语言替换标题和正文。blog-i18n.js已重写兼容`.blog-article`结构（自动创建`.blog-detail-content`包裹层）
75. **博客翻译工具（Session 21b）** — `tools/translate-blog-articles.js`：`--check`查看翻译状态、`--extract`提取文章到manifest JSON、`--inject`从`tools/blog-translations/`目录注入翻译、`--single <slug>`查看单篇内容。翻译JSON格式：`{slug, en:{title,content}, zh:{title,content}}`
76. **about.html LocalBusiness JSON-LD（Session 21b）** — 添加含奖项（award数组）、动物取扱業认证（hasCredential）、评分（aggregateRating 5.0/113件）、社交媒体（sameAs）的完整LocalBusiness结构化数据。与index.html的LocalBusiness互补
77. **⭐ Session 21b完成** — ✅博客三语化完成（104篇×EN/ZH） ✅about.html LocalBusiness JSON-LD ✅EMPLOYEE-GUIDE.md更新
78. **見学予約フォーム連携（Session 21c）** — Google Form（見学予約フォーム/见学预约表，9项目）创建完成。全站`#booking`占位符替换为Form URL：index.html（3处CTA按钮）、script.js（モーダル内予約按钮）、cta-widget.js + kitten-carousel.js（`BOOKING_URL`常量）、siberian/kittens/parents.html（CTAボタン）、24个kitten详情页、generate-site.js模板。所有按钮添加`target="_blank" rel="noopener"`
79. **親猫モーダル写真カルーセル（Session 21c）** — `openParentModal()`改为async函数，支持Drive照片轮播：读取`data-images`→构建slides/dots/thumbnails→`initCarousel()`绑定控件。无照片时按需从`DriveLoader.loadCardImages()`加载。`parentCardHTML()`添加`data-images`属性（从API数据填充cover photo）。parents.html补充`modal-children`区块（之前缺失）
80. **⭐ Session 21c完成** — ✅見学予約フォーム全站连接 ✅親猫写真カルーセル ✅drive-loader.js全面适配
81. **博客列表页i18n（Session 21c-2）** — blog.html的104张文章卡片（纯静态JA HTML）切换语言后标题和简介不变→ 解决方案：(1)`tools/generate-blog-listing-i18n.js`提取脚本从104篇文章的`window._blogArticleI18n`提取EN/ZH标题+生成摘要 (2)`blog-listing-i18n.js`(58.6KB)数据文件含categories/hero/cta/articles (3)`blog-listing-i18n-apply.js`运行时替换脚本（监听langChanged事件，缓存JA原始内容后替换hero/分类标签/分类标题/文章标题·摘要·分类标签/底部CTA）→ blog.html添加2个script标签（defer加载）
82. **見学予約ページ（Session 21c-2）** — `booking.html`新建：Ice Cream Design System UI（mint渐变hero+白卡表单+sidebar信息卡+LINE替代入口）→ 9字段表单（姓名/邮箱/电话/第一希望日/时间帯/第二希望日/見学方法/気になる子猫/質問）→ `fetch(formResponse, {mode:'no-cors'})`提交到Google Form后端 → 成功/失败UI反馈 + GA4事件跟踪 → placeholder多语言（data-placeholder-ja/en/zh）→ `i18n.js`追加~40个`booking.*`翻译键（JA/EN/ZH）→ 全站32处予約リンク从外部Google Form URL→`/booking.html`内部页面（target="_blank"削除）→ sitemap.xml追加
83. **⭐ Session 21c-2完成 + 下一步** — ✅博客列表页i18n ✅見学予約ページ三語化 ✅全站予約リンク内部化 → 下一步：(1)GSC 1-2周后验证索引恢复 (2)OGP图片仍待制作
84. **ブログ7記事追加（Session 22）** — 7篇新SEO博客（trilingual JA/EN/ZH）：siberian-price-guide / siberian-osaka-guide / siberian-allergy-solution / siberian-owner-stories / kansai-breeder-guide / siberian-cost-breakdown / shop-vs-breeder-siberian → blog.html列表更新（breeder 5→9/allergy 6→7/lifestyle 17→19）→ sitemap.xml 7新URL → blog-listing-i18n.js 7条EN/ZH翻译追加
85. **⚠ 新增博客文章チェックリスト（必ず全項目完了すること）** — 新しいブログ記事を追加する際、以下の**全ステップ**を必ず実行：
    - (1) `blog/xxx.html` 作成（テンプレート: breeder-vs-petshop.html参照、`window._blogArticleI18n`にEN/ZH翻訳を含む）
    - (2) `blog.html` に記事カードを追加（該当カテゴリの`blog-grid`内、カテゴリ数カウント更新）
    - (3) `blog-listing-i18n.js` の `articles` にslug→EN/ZH title+excerpt追加（**これを忘れるとblog.html一覧ページで言語切替時に翻訳されない**）
    - (4) `sitemap.xml` にURL追加（アルファベット順）
    - (5) コミット＆プッシュ
