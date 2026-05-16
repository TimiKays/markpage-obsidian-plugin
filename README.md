# MarkPage Sync — Obsidian Plugin

一键将 Obsidian 笔记（含图片）发送到 [MarkPage](https://markpage.timikays.us.kg/) 编辑器，生成精美排版图片。

## 安装

### 方式一：手动安装（现在就能用）

1. 下载 `main.js`、`manifest.json`、`styles.css` 三个文件
2. 放到你的 Obsidian 仓库的 `.obsidian/plugins/markpage-sync/` 文件夹里
3. 重启 Obsidian → 设置 → 社区插件 → 启用 **MarkPage Sync**

### 方式二：插件市场（上架后可用）

在 Obsidian 社区插件中搜索 "MarkPage Sync" 直接安装。

## 使用方法

1. 打开一篇笔记
2. 点击左侧工具栏的 ✈️ 发送按钮，或按 `Ctrl+P` 输入 "MarkPage"
3. 浏览器自动打开 MarkPage，内容自动出现

### 命令

| 命令 | 说明 |
|------|------|
| 发送当前笔记到 MarkPage | 一键同步 |
| 选择主题后发送到 MarkPage | 先选主题再同步 |

## 功能

- ✅ Markdown 正文同步
- ✅ 图片自动处理（Obsidian `![[image.png]]` 和标准 `![](path)` 两种格式都支持）
- ✅ 自动提取标题做封面
- ✅ 10 种主题可选
- ✅ 支持 Cloudflare Pages 部署的 MarkPage
- ✅ 插件自带本地服务，无需额外启动任何东西

## 工作原理

插件在你电脑上开了一个本地服务（端口 3001），MarkPage 网页在浏览器里每 0.5 秒问一次"有新内容吗？"——有的话就显示出来。整个过程不需要安装任何额外软件。

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| MarkPage 网址 | https://markpage.timikays.us.kg | 可换成你自己的部署地址 |
| 默认主题 | 不指定 | 同步时自动应用的主题 |
| 自动打开浏览器 | 开启 | 同步后是否自动打开浏览器 |

## 要求

- Obsidian 桌面版 v0.15.0+
- 需要能访问 MarkPage 网页（在线或本地部署均可）

## 开发

```bash
npm install
npm run dev      # 开发模式（热更新）
npm run build    # 生产构建
```
