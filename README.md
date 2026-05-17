# MarkPage Sync

一键将 Obsidian 笔记（含图片）同步到 [MarkPage](https://github.com/TimiKays/MarkPage) —— 一个 Markdown 转精美图片的编辑器，让你的笔记变成适合社交媒体（小红书、Instagram、手机壁纸等）的精美视觉图。

One-click sync your Obsidian notes (with images) to [MarkPage](https://github.com/TimiKays/MarkPage) — a Markdown-to-beautiful-image editor for social media (Xiaohongshu, Instagram, phone wallpapers, and more).

---

## 安装 / Installation

### 从 Obsidian 社区插件安装（推荐）/ From Obsidian Community Plugins (recommended)

在 Obsidian 设置 → 社区插件中搜索 "MarkPage Sync"。

Search for "MarkPage Sync" in Obsidian Settings → Community Plugins.

### 手动安装 / Manual Installation

1. 从 [最新发布](https://github.com/TimiKays/markpage-obsidian-plugin/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`
   Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/TimiKays/markpage-obsidian-plugin/releases)
2. 放到你的仓库的 `.obsidian/plugins/markpage-sync/` 文件夹
   Place them in your vault's `.obsidian/plugins/markpage-sync/` folder
3. 重启 Obsidian → 设置 → 社区插件 → 启用 **MarkPage Sync**
   Restart Obsidian → Settings → Community Plugins → Enable **MarkPage Sync**

---

## 使用方法 / How to Use

1. 在 Obsidian 中打开一篇笔记 / Open a note in Obsidian
2. 点击左侧边栏的 ✈️ 图标，或按 `Ctrl/Cmd+P` 搜索 "MarkPage"
   Click the ✈️ icon in the left ribbon, or press `Ctrl/Cmd+P` and search "MarkPage"
3. 浏览器自动打开 MarkPage，笔记内容已就绪
   Your browser opens MarkPage with the note content ready to edit

### 命令 / Commands

| 命令 / Command | 说明 / Description |
|----------------|-------------------|
| 发送当前笔记到 MarkPage / Send note to MarkPage | 立即同步当前笔记 / Sync the current note immediately |
| 选择主题后发送到 MarkPage / Send to MarkPage with theme | 同步前先选择主题 / Pick a theme before syncing |

---

## 功能特性 / Features

- 📝 完整 Markdown 内容同步 / Full Markdown content sync
- 🖼️ 自动处理图片 —— 支持 `![[image.png]]`（维基链接）和 `![](path)` 两种格式 / Automatic image handling —— both wikilinks and standard Markdown formats
- 🎨 10 款内置主题 / 10 built-in themes
- 📄 自动提取 H1 标题作为封面标题 / Auto-extract H1 heading as cover title
- ☁️ 支持任意 MarkPage 部署（Cloudflare Pages、自建等）/ Works with any MarkPage deployment
- 🔌 零依赖 —— 插件自带本地 HTTP 服务，无需额外软件 / Zero dependencies —— runs a local HTTP server

---

## 工作原理 / How It Works

插件在本地启动轻量级 HTTP 服务（默认端口 3001）。点击"发送"时，将笔记内容推送到该服务。MarkPage 网页端轮询获取内容并自动渲染。无需额外软件或服务器配置。

The plugin starts a lightweight HTTP server on your machine (port 3001 by default). When you hit "send", it pushes your note content to this server. The MarkPage web app polls the server and renders your note automatically. No additional software or server setup required.

仓库中的图片直接从插件的 HTTP 服务读取 —— 无需 base64 编码，无需上传。

Images in your vault are served directly from the plugin's HTTP server —— no base64 encoding, no uploading.

---

## 设置 / Settings

| 设置项 / Setting | 默认值 / Default | 说明 / Description |
|-------------------|-----------------|-------------------|
| MarkPage 网址 / MarkPage URL | `https://markpage.timikays.us.kg` | MarkPage 实例地址 / URL of your MarkPage instance |
| 默认主题 / Default theme | 无 / None | 同步时自动应用的主题 / Auto-apply a theme when syncing |
| 自动打开浏览器 / Auto-open browser | 开启 / On | 同步后自动在浏览器打开 MarkPage / Open MarkPage in browser after syncing |

---

## 系统要求 / Requirements

- Obsidian 桌面版 v0.15.0+ / Obsidian desktop v0.15.0+
- 可访问 MarkPage 实例（在线或自建）/ Access to a MarkPage instance (online or self-hosted)

---

## 开发 / Development

```bash
npm install
npm run dev      # 监听模式 / Watch mode
npm run build    # 生产构建 / Production build
```

---

## 更新日志 / Changelog

### v1.0.2
- 修复：过滤 frontmatter（`---` 包裹的 YAML 元数据），避免被当作正文渲染
- Fix: Filter frontmatter to prevent YAML metadata from being rendered as content

### v1.0.1
- 修复：图片路径编码问题（支持中文路径、空格等）
- Fix: Image path encoding (supports Chinese characters, spaces, etc.)
- 修复：重复图片去重
- Fix: Deduplicate repeated image references

### v1.0.0
- 初始发布 / Initial release
- 支持 Markdown 同步 / Markdown sync support
- 支持图片自动处理 / Automatic image handling
- 10 款内置主题 / 10 built-in themes
- 本地 HTTP 服务 / Local HTTP server

---

## 许可证 / License

MIT
