# MarkPage Sync

一键将 Obsidian 笔记（含图片）同步到 [MarkPage](https://github.com/TimiKays/MarkPage) —— 一个 Markdown 转精美图片的编辑器，让你的笔记变成适合社交媒体（小红书、Instagram、手机壁纸等）的精美视觉图。

## 安装

### 从 Obsidian 社区插件安装（推荐）

在 Obsidian 设置 → 社区插件中搜索 "MarkPage Sync"。

### 手动安装

1. 从 [最新发布](https://github.com/TimiKays/markpage-obsidian-plugin/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`
2. 放到你的仓库的 `.obsidian/plugins/markpage-sync/` 文件夹
3. 重启 Obsidian → 设置 → 社区插件 → 启用 **MarkPage Sync**

## 使用方法

1. 在 Obsidian 中打开一篇笔记
2. 点击左侧边栏的 ✈️ 图标，或按 `Ctrl/Cmd+P` 搜索 "MarkPage"
3. 浏览器自动打开 MarkPage，笔记内容已就绪

### 命令

| 命令 | 说明 |
|------|------|
| 发送当前笔记到 MarkPage | 立即同步当前笔记 |
| 选择主题后发送到 MarkPage | 同步前先选择主题 |

## 功能特性

- 📝 完整 Markdown 内容同步
- 🖼️ 自动处理图片 —— 支持 `![[image.png]]`（维基链接）和 `![](path)` 两种格式
- 🎨 10 款内置主题
- 📄 自动提取 H1 标题作为封面标题
- ☁️ 支持任意 MarkPage 部署（Cloudflare Pages、自建等）
- 🔌 零依赖 —— 插件自带本地 HTTP 服务，无需额外软件

## 工作原理

插件在本地启动轻量级 HTTP 服务（默认端口 3001）。点击"发送"时，将笔记内容推送到该服务。MarkPage 网页端轮询获取内容并自动渲染。无需额外软件或服务器配置。

仓库中的图片直接从插件的 HTTP 服务读取 —— 无需 base64 编码，无需上传。

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| MarkPage 网址 | `https://markpage.timikays.us.kg` | MarkPage 实例地址 |
| 默认主题 | 无 | 同步时自动应用的主题 |
| 自动打开浏览器 | 开启 | 同步后自动在浏览器打开 MarkPage |

## 系统要求

- Obsidian 桌面版 v0.15.0+
- 可访问 MarkPage 实例（在线或自建）

## 开发

```bash
npm install
npm run dev      # 监听模式
npm run build    # 生产构建
```

## 更新日志

### v1.0.2
- 修复：过滤 frontmatter（`---` 包裹的 YAML 元数据），避免被当作正文渲染

### v1.0.1
- 修复：图片路径编码问题（支持中文路径、空格等）
- 修复：重复图片去重

### v1.0.0
- 初始发布
- 支持 Markdown 同步
- 支持图片自动处理
- 10 款内置主题
- 本地 HTTP 服务

## 许可证

MIT
