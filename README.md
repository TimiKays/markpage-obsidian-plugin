# MarkPage Sync

One-click sync your Obsidian notes (with images) to [MarkPage](https://github.com/TimiKays/MarkPage) — a Markdown-to-beautiful-image editor that turns your notes into stunning visuals for social media (Xiaohongshu, Instagram, phone wallpapers, and more).

## Installation

### From Obsidian Community Plugins (recommended)

Search for "MarkPage Sync" in Obsidian Settings → Community Plugins.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/TimiKays/markpage-obsidian-plugin/releases)
2. Place them in your vault's `.obsidian/plugins/markpage-sync/` folder
3. Restart Obsidian → Settings → Community Plugins → Enable **MarkPage Sync**

## How to Use

1. Open a note in Obsidian
2. Click the ✈️ icon in the left ribbon, or press `Ctrl/Cmd+P` and search "MarkPage"
3. Your browser opens MarkPage with the note content ready to edit

### Commands

| Command | Description |
|---------|-------------|
| Send note to MarkPage | Sync the current note immediately |
| Send to MarkPage with theme | Pick a theme before syncing |

## Features

- 📝 Full Markdown content sync
- 🖼️ Automatic image handling — both `![[image.png]]` (wikilinks) and `![](path)` formats
- 🎨 10 built-in themes
- 📄 Auto-extract H1 heading as cover title
- ☁️ Works with any MarkPage deployment (Cloudflare Pages, self-hosted, etc.)
- 🔌 Zero dependencies — the plugin runs a local HTTP server, no extra software needed

## How It Works

The plugin starts a lightweight HTTP server on your machine (port 3001 by default). When you hit "send", it pushes your note content to this server. The MarkPage web app polls the server and renders your note automatically. No additional software or server setup required.

Images in your vault are served directly from the plugin's HTTP server — no base64 encoding, no uploading.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| MarkPage URL | `https://markpage.timikays.us.kg` | URL of your MarkPage instance |
| Default theme | None | Auto-apply a theme when syncing |
| Auto-open browser | On | Open MarkPage in browser after syncing |

## Requirements

- Obsidian desktop v0.15.0+
- Access to a MarkPage instance (online or self-hosted)

## Development

```bash
npm install
npm run dev      # Watch mode
npm run build    # Production build
```

## License

MIT
