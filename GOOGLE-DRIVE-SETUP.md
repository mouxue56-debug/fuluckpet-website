# Google Cloud 配置教程（中文）

> 按照以下步骤配置 Google Cloud Service Account，让网站能自动读取你 Google Drive 中的猫咪图片。
> 整个过程大约需要 **20-30 分钟**，只需要做一次。

---

## 第 1 步：创建 Google Cloud 项目

1. 打开浏览器，访问 https://console.cloud.google.com
2. 用你的 Google 账号登录（建议用管理 Drive 图片的那个账号）
3. 点击页面顶部的项目选择器（写着 "Select a project" 或已有项目名）
4. 点击 **"NEW PROJECT"**（新建项目）
5. 填写：
   - **Project name**: `fuluckpet-drive`
   - **Organization**: 留空即可
6. 点击 **"CREATE"**

等待几秒钟，项目创建完成后确保顶部显示的是 `fuluckpet-drive`。

---

## 第 2 步：启用 Google Drive API

1. 在 Google Cloud Console 中，点击左侧菜单 **"APIs & Services"** → **"Library"**
2. 在搜索框中输入 `Google Drive API`
3. 点击搜索结果中的 **"Google Drive API"**
4. 点击蓝色的 **"ENABLE"** 按钮
5. 等待几秒钟，看到 "API enabled" 即成功

---

## 第 3 步：创建 Service Account（服务账号）

Service Account 是一个"机器人账号"，让 Worker 程序能自动读取你 Drive 中的图片。

1. 点击左侧菜单 **"APIs & Services"** → **"Credentials"**
2. 点击页面顶部的 **"+ CREATE CREDENTIALS"**
3. 选择 **"Service account"**
4. 填写：
   - **Service account name**: `fuluck-drive-reader`
   - **Service account ID**: 会自动生成（如 `fuluck-drive-reader@fuluckpet-drive.iam.gserviceaccount.com`）
   - **Description**: `Read cat photos from Google Drive`
5. 点击 **"CREATE AND CONTINUE"**
6. **Grant this service account access to project** 这一步直接跳过，点 **"CONTINUE"**
7. **Grant users access to this service account** 这一步也跳过，点 **"DONE"**

---

## 第 4 步：下载 JSON 密钥

1. 在 Credentials 页面，找到刚创建的 Service Account，点击它的邮箱地址
2. 点击上方的 **"KEYS"** 标签
3. 点击 **"ADD KEY"** → **"Create new key"**
4. 选择 **JSON** 格式
5. 点击 **"CREATE"**
6. 浏览器会自动下载一个 JSON 文件（文件名类似 `fuluckpet-drive-xxxxxx.json`）

> **重要**：这个文件是密钥，不要上传到 GitHub 或分享给别人！
> 后面我们会把它的内容安全地存到 Cloudflare Workers 的加密变量中。

---

## 第 5 步：设置 Google Drive 文件夹

1. 打开 https://drive.google.com
2. 创建一个新文件夹，命名为 **`fuluckpet-photos`**
3. 打开这个文件夹，从浏览器地址栏复制文件夹 ID：
   ```
   https://drive.google.com/drive/folders/这一串就是文件夹ID
   ```
   例如：`1ABC2DEF3GHI4JKL5MNO6PQR7STU8VWX`

4. **将文件夹共享给 Service Account**：
   - 右键点击 `fuluckpet-photos` 文件夹 → **"Share"**（共享）
   - 在 "Add people" 输入框中粘贴 Service Account 的邮箱：
     ```
     fuluck-drive-reader@fuluckpet-drive.iam.gserviceaccount.com
     ```
   - 权限选择 **"Viewer"**（查看者，只读权限就够了）
   - 点击 **"Send"**

5. 在 `fuluckpet-photos` 文件夹中创建子文件夹结构：
   ```
   fuluckpet-photos/
   ├── kittens/              ← 子猫照片
   │   ├── 2602-00625/       ← 用 breeder ID 命名
   │   ├── 2511-02287/
   │   └── ...（每只子猫一个文件夹）
   ├── parents/              ← 种猫照片
   │   ├── しろくん/          ← 用猫名命名
   │   ├── りんちゃん/
   │   └── ...
   └── gallery/              ← 毕业猫照片
       ├── 01/               ← 编号命名即可
       ├── 02/
       └── ...
   ```

---

## 第 6 步：配置 Cloudflare Worker

在终端中运行以下命令，把密钥安全地存入 Worker：

```bash
cd /Users/willma/fuluckpet-website/api

# 1. 将 JSON 密钥内容设为 Worker Secret（运行后粘贴 JSON 文件的全部内容）
npx wrangler secret put GOOGLE_SA_KEY

# 2. 设置 Drive 根文件夹 ID
npx wrangler secret put GOOGLE_DRIVE_ROOT_FOLDER_ID
# 运行后粘贴第 5 步中获取的文件夹 ID
```

---

## 第 7 步：验证配置

配置完成后，可以在浏览器中访问以下 URL 测试：

```
https://fuluck-api.你的子域名.workers.dev/api/drive/list/kittens
```

如果看到 JSON 格式的文件夹列表，说明配置成功！

---

## 日常使用方式

配置完成后，以后添加新图片只需要：

1. 打开 Google Drive → `fuluckpet-photos` 文件夹
2. 进入对应类别文件夹（如 `kittens/`）
3. 新建文件夹，命名为子猫的 breeder ID（如 `2602-00625`）
4. 将照片拖入该文件夹
5. 完成！网站会自动显示（最多 30 分钟缓存延迟）

如果想立即刷新，可以去 Admin 管理面板点击"缓存刷新"按钮。

---

## 常见问题

### Q: 密钥会过期吗？
A: 不会。Service Account JSON 密钥永久有效，除非你手动删除。

### Q: 图片大小有限制吗？
A: 单张图片最大 10MB。建议压缩到 1-2MB 以加快加载速度。推荐尺寸：
   - 子猫照片：800×600px 或 600×800px
   - 种猫照片：600×800px
   - 毕业猫：400×400px

### Q: 文件命名有要求吗？
A: 文件名不限，但建议用英文或数字（如 `photo1.jpg`）。系统会按文件名字母顺序排列。

### Q: Google Drive 空间够用吗？
A: Google 免费提供 15GB 存储空间。按每张图 1MB 计算，可存约 15000 张照片，完全够用。

### Q: 需要付费吗？
A: 全部免费！Google Cloud（Drive API 免费配额足够）+ Cloudflare Workers（免费额度足够小型网站）。
