import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';
import * as http from 'http';

// ─── Constants ───────────────────────────────────────────────────────────────

const MARKPAGE_URL = 'https://markpage.timikays.us.kg';

// ─── Translations ────────────────────────────────────────────────────────────

const TRANSLATIONS = {
	zh: {
		sendToMarkPage: '发送到 MarkPage',
		sendCurrentNote: '发送当前笔记到 MarkPage',
		sendWithTheme: '选择主题后发送到 MarkPage',
		settingsTitle: 'MarkPage 同步设置',
		defaultTheme: '默认主题',
		defaultThemeDesc: '同步时自动应用的主题（可选）',
		noTheme: '不指定',
		language: '界面语言',
		languageDesc: '插件界面显示语言',
		zh: '中文',
		en: 'English',
		serverPort: '本地服务端口',
		serverPortDesc: '本地 HTTP 服务端口（默认 3001）',
		pickTheme: '选择主题',
		sending: '正在发送到 MarkPage...',
		sentSuccess: '✅ 已发送到 MarkPage！',
		sendFailed: '❌ 发送失败',
		noOpenNote: '没有打开的笔记',
		noCurrentFile: '找不到当前文件',
		imagesProcessed: '📷 已处理 {count} 张图片',
		imagesFailed: '⚠️ {success} 张图片成功，{fail} 张未找到: {names}',
		serverStartFailed: '本地服务启动失败',
	},
	en: {
		sendToMarkPage: 'Send to MarkPage',
		sendCurrentNote: 'Send current note to MarkPage',
		sendWithTheme: 'Send to MarkPage with theme',
		settingsTitle: 'MarkPage Sync Settings',
		defaultTheme: 'Default Theme',
		defaultThemeDesc: 'Auto-apply theme when syncing (optional)',
		noTheme: 'None',
		language: 'Language',
		languageDesc: 'Plugin interface language',
		zh: '中文',
		en: 'English',
		serverPort: 'Local Server Port',
		serverPortDesc: 'Local HTTP server port (default: 3001)',
		pickTheme: 'Pick Theme',
		sending: 'Sending to MarkPage...',
		sentSuccess: '✅ Sent to MarkPage!',
		sendFailed: '❌ Send failed',
		noOpenNote: 'No note is open',
		noCurrentFile: 'Cannot find current file',
		imagesProcessed: '📷 Processed {count} images',
		imagesFailed: '⚠️ {success} images succeeded, {fail} not found: {names}',
		serverStartFailed: 'Local server failed to start',
	},
};

// ─── Settings ────────────────────────────────────────────────────────────────

interface MarkPagePluginSettings {
	defaultTheme: string;
	serverPort: number;
	language: 'zh' | 'en';
}

const DEFAULT_SETTINGS: MarkPagePluginSettings = {
	defaultTheme: '',
	serverPort: 3001,
	language: 'zh',
};

// ─── Pending State ───────────────────────────────────────────────────────────

let pendingConfig: Record<string, unknown> | null = null;
let pendingExport: { scale: number; format: string } | null = null;
let pendingGetState = false;
let currentState: Record<string, unknown> = {};
let lastExportResult: Record<string, unknown> | null = null;

// ─── Main Plugin ─────────────────────────────────────────────────────────────

export default class MarkPagePlugin extends Plugin {
	settings: MarkPagePluginSettings = DEFAULT_SETTINGS;
	private server: http.Server | null = null;

	get t() {
		return TRANSLATIONS[this.settings.language];
	}

	async onload() {
		await this.loadSettings();
		this.startLocalServer();

		this.addRibbonIcon('send', this.t.sendToMarkPage, async () => {
			await this.syncToMarkPage();
		});

		this.addCommand({
			id: 'sync-to-markpage',
			name: this.t.sendCurrentNote,
			checkCallback: (checking: boolean) => {
				const active = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!active) return false;
				if (!checking) this.syncToMarkPage();
				return true;
			},
		});

		this.addCommand({
			id: 'sync-to-markpage-pick-theme',
			name: this.t.sendWithTheme,
			checkCallback: (checking: boolean) => {
				const active = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!active) return false;
				if (!checking) new ThemePickerModal(this.app, this).open();
				return true;
			},
		});

		this.addSettingTab(new MarkPageSettingTab(this.app, this));
		console.log('MarkPage Sync plugin loaded');
	}

	onunload() {
		this.stopLocalServer();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ─── Local HTTP Server ──────────────────────────────────────────────────

	startLocalServer() {
		if (this.server) return;

		const port = this.settings.serverPort;
		const plugin = this;

		this.server = http.createServer((req, res) => {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || '/', `http://localhost:${port}`);

			// ─── Vault Image Endpoint ─────────────────────────────────────
			if (req.method === 'GET' && url.pathname === '/vault-image') {
				const vaultPath = url.searchParams.get('p');
				if (!vaultPath) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing p parameter' }));
					return;
				}
				const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
				if (!file || !(file instanceof TFile)) {
					res.writeHead(404, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'File not found: ' + vaultPath }));
					return;
				}
				const ext = file.extension.toLowerCase();
				const mimeMap: Record<string, string> = {
					png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
					gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
				};
				const mime = mimeMap[ext];
				if (!mime) {
					res.writeHead(415, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Not an image file' }));
					return;
				}
				plugin.app.vault.readBinary(file).then(binary => {
					res.writeHead(200, {
						'Content-Type': mime,
						'Cache-Control': 'public, max-age=3600',
					});
					res.end(Buffer.from(binary));
				}).catch(() => {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to read file' }));
				});
				return;
			}

			if (url.pathname === '/health') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'ok' }));
				return;
			}

			if (req.method === 'GET' && url.pathname === '/api/mcp/poll') {
				const response: Record<string, unknown> = {};
				if (pendingConfig) { response.config = pendingConfig; pendingConfig = null; }
				if (pendingExport) { response.export = pendingExport; pendingExport = null; }
				if (pendingGetState) { response.getState = true; pendingGetState = false; }
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
				return;
			}

			if (req.method === 'POST' && url.pathname === '/api/mcp/config') {
				let body = '';
				req.on('data', chunk => { body += chunk; });
				req.on('end', () => {
					try {
						pendingConfig = JSON.parse(body);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true }));
					} catch (e) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
					}
				});
				return;
			}

			if (req.method === 'POST' && url.pathname === '/api/mcp/export') {
				let body = '';
				req.on('data', chunk => { body += chunk; });
				req.on('end', () => {
					try {
						const data = JSON.parse(body);
						pendingExport = { scale: data.scale || 2, format: data.format || 'png' };
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true }));
					} catch (e) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
					}
				});
				return;
			}

			if (req.method === 'POST' && url.pathname === '/api/mcp/export-result') {
				let body = '';
				req.on('data', chunk => { body += chunk; });
				req.on('end', () => {
					try { lastExportResult = JSON.parse(body); } catch {}
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true }));
				});
				return;
			}

			if (req.method === 'POST' && url.pathname === '/api/mcp/state') {
				let body = '';
				req.on('data', chunk => { body += chunk; });
				req.on('end', () => {
					try { currentState = JSON.parse(body); } catch {}
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true }));
				});
				return;
			}

			if (req.method === 'GET' && url.pathname === '/api/mcp/state') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(currentState));
				return;
			}

			res.writeHead(404);
			res.end('Not found');
		});

		this.server.listen(port, () => {
			console.log(`MarkPage Sync: local server on port ${port}`);
		});

		this.server.on('error', (err: Error) => {
			console.error('MarkPage Sync server error:', err);
			new Notice(`${this.t.serverStartFailed}: ${err.message}`);
		});
	}

	stopLocalServer() {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	restartLocalServer() {
		this.stopLocalServer();
		this.startLocalServer();
	}

	// ─── Core: Sync ──────────────────────────────────────────────────────────

	async syncToMarkPage(overrideTheme?: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice(this.t.noOpenNote);
			return;
		}

		const file = activeView.file;
		if (!file) {
			new Notice(this.t.noCurrentFile);
			return;
		}

		new Notice(this.t.sending);

		try {
			let markdown = await this.app.vault.read(file);

			// 过滤 frontmatter（--- 包裹的 YAML 元数据）
			const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
			markdown = markdown.replace(frontmatterRegex, '').trimStart();

			markdown = await this.processImages(markdown, file);

			// 通过 URL 参数传递内容
			const params = new URLSearchParams();
			params.set('content', markdown);

			if (overrideTheme || this.settings.defaultTheme) {
				params.set('theme', overrideTheme || this.settings.defaultTheme);
			}

			const titleMatch = markdown.match(/^#\s+(.+)$/m);
			if (titleMatch) {
				params.set('cover', 'true');
				params.set('title', titleMatch[1].trim());
			}

			this.openMarkPage(params);

			new Notice(this.t.sentSuccess);
		} catch (error) {
			console.error('MarkPage sync error:', error);
			new Notice(`${this.t.sendFailed}: ${error.message}`);
		}
	}

	// ─── Image Processing ────────────────────────────────────────────────────

	async processImages(markdown: string, sourceFile: TFile): Promise<string> {
		const sourceDir = sourceFile.parent?.path || '';
		const baseUrl = `http://localhost:${this.settings.serverPort}`;
		const processedFiles = new Set<string>();
		let imageCount = 0;
		let failCount = 0;
		const failedNames: string[] = [];

		// ── Pass 1: Wikilink 图片 ![[image.png]] ──────────────────────────────
		const wikiLinkRegex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp))(?:\|([^\]]*))?\]\]/gi;
		const wikiMatches = [...markdown.matchAll(wikiLinkRegex)];
		for (const match of wikiMatches) {
			const fullMatch = match[0];
			const imageName = match[1];
			const sizeHint = match[3] || '';
			try {
				const imageFile = this.findImageFile(imageName);
				if (imageFile) {
					if (processedFiles.has(imageFile.path)) {
						markdown = markdown.replace(fullMatch, '');
						continue;
					}
					processedFiles.add(imageFile.path);
					const imageUrl = `${baseUrl}/vault-image?p=${encodeURIComponent(imageFile.path)}`;
					const altText = sizeHint ? `${imageName}|${sizeHint}` : imageName;
					markdown = markdown.replace(fullMatch, `![${altText}](${imageUrl})`);
					imageCount++;
				} else {
					failCount++;
					failedNames.push(imageName);
				}
			} catch (e) {
				failCount++;
				failedNames.push(imageName);
			}
		}

		// ── Pass 2: 标准 Markdown 图片 ![alt](path) ───────────────────────────
		const mdImageRegex = /!?\[([^\]]*)\]\(([^)]+)\)/gi;
		const mdMatches = [...markdown.matchAll(mdImageRegex)];
		for (const match of mdMatches) {
			const fullMatch = match[0];
			const alt = match[1];
			const imagePath = match[2];
			const isImage = fullMatch.startsWith('!');

			if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('app://') || imagePath === '') continue;

			const decodedPath = decodeURIComponent(imagePath);

			if (!isImage && !/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(decodedPath)) continue;

			try {
				const imageFile = this.resolveLocalImage(decodedPath, sourceDir) || this.findImageFile(decodedPath);
				if (imageFile) {
					if (processedFiles.has(imageFile.path)) {
						markdown = markdown.replace(fullMatch, '');
						continue;
					}
					processedFiles.add(imageFile.path);
					const imageUrl = `${baseUrl}/vault-image?p=${encodeURIComponent(imageFile.path)}`;
					markdown = markdown.replace(fullMatch, `![${alt}](${imageUrl})`);
					imageCount++;
				}
			} catch (e) {
				console.error(`MarkPage Sync: failed to process image ${imagePath}:`, e);
			}
		}

		if (imageCount > 0 && failCount === 0) {
			new Notice(this.t.imagesProcessed.replace('{count}', String(imageCount)));
		} else if (failCount > 0) {
			new Notice(this.t.imagesFailed
				.replace('{success}', String(imageCount))
				.replace('{fail}', String(failCount))
				.replace('{names}', failedNames.join(', ')));
		}

		return markdown;
	}

	findImageFile(imageName: string): TFile | null {
		const files = this.app.vault.getFiles();
		const lowerName = imageName.toLowerCase();

		let found = files.find(f => f.name.toLowerCase() === lowerName);
		if (found) return found;

		found = files.find(f => f.path.toLowerCase().endsWith('/' + lowerName) || f.path.toLowerCase().endsWith('\\' + lowerName));
		if (found) return found;

		found = files.find(f =>
			f.path.toLowerCase().includes(lowerName) &&
			/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(f.path)
		);
		return found || null;
	}

	resolveLocalImage(imagePath: string, sourceDir: string): TFile | null {
		let fullPath = imagePath;
		if (fullPath.startsWith('./')) fullPath = fullPath.substring(2);
		if (!fullPath.startsWith('/')) {
			fullPath = normalizePath(`${sourceDir}/${fullPath}`);
		} else {
			fullPath = normalizePath(fullPath.substring(1));
		}
		const af = this.app.vault.getAbstractFileByPath(fullPath);
		return af instanceof TFile ? af : null;
	}

	openMarkPage(params: URLSearchParams) {
		params.set('mcpUrl', `http://localhost:${this.settings.serverPort}`);
		// 加时间戳强制刷新，避免浏览器缓存
		params.set('_t', Date.now().toString());
		const fullUrl = `${MARKPAGE_URL}?${params.toString()}`;
		(window as any).require('electron').shell.openExternal(fullUrl);
	}
}

// ─── Theme Picker Modal ──────────────────────────────────────────────────────

const AVAILABLE_THEMES = [
	{ id: 'minimal-white', name: '极简白', emoji: '🤍' },
	{ id: 'dark-night', name: '暗夜黑', emoji: '🖤' },
	{ id: 'tech-blue', name: '科技蓝', emoji: '💙' },
	{ id: 'sakura-pink', name: '樱花粉', emoji: '🌸' },
	{ id: 'cosmic-purple', name: '宇宙紫', emoji: '💜' },
	{ id: 'cyberpunk', name: '赛博朋克', emoji: '🦾' },
	{ id: 'forest-green', name: '森林绿', emoji: '💚' },
	{ id: 'sunset-orange', name: '日落橙', emoji: '🧡' },
	{ id: 'ocean-blue', name: '海洋蓝', emoji: '🌊' },
	{ id: 'retro-paper', name: '复古纸张', emoji: '📜' },
];

class ThemePickerModal extends Modal {
	plugin: MarkPagePlugin;

	constructor(app: App, plugin: MarkPagePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		const t = this.plugin.t;
		contentEl.empty();
		contentEl.createEl('h2', { text: t.pickTheme });

		for (const theme of AVAILABLE_THEMES) {
			const btn = contentEl.createEl('button', {
				text: `${theme.emoji} ${theme.name}`,
			});
			btn.style.cssText = `
				display:block;width:100%;margin:8px 0;padding:12px 16px;
				text-align:left;font-size:14px;cursor:pointer;
				border:1px solid var(--background-modifier-border);
				border-radius:6px;background:var(--background-secondary);
				color:var(--text-normal);transition:all .15s ease;
			`;
			btn.addEventListener('click', () => {
				this.close();
				this.plugin.syncToMarkPage(theme.id);
			});
			btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateX(4px)'; });
			btn.addEventListener('mouseleave', () => { btn.style.transform = 'none'; });
		}
	}

	onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class MarkPageSettingTab extends PluginSettingTab {
	plugin: MarkPagePlugin;

	constructor(app: App, plugin: MarkPagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const t = this.plugin.t;
		containerEl.empty();
		containerEl.createEl('h2', { text: t.settingsTitle });

		new Setting(containerEl)
			.setName(t.defaultTheme)
			.setDesc(t.defaultThemeDesc)
			.addDropdown(dropdown => {
				dropdown.addOption('', t.noTheme);
				for (const theme of AVAILABLE_THEMES) {
					dropdown.addOption(theme.id, `${theme.emoji} ${theme.name}`);
				}
				dropdown.setValue(this.plugin.settings.defaultTheme)
					.onChange(async (value) => {
						this.plugin.settings.defaultTheme = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t.language)
			.setDesc(t.languageDesc)
			.addDropdown(dropdown => {
				dropdown.addOption('zh', t.zh);
				dropdown.addOption('en', t.en);
				dropdown.setValue(this.plugin.settings.language)
					.onChange(async (value: 'zh' | 'en') => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
						this.display(); // 刷新界面
					});
			});

		new Setting(containerEl)
			.setName(t.serverPort)
			.setDesc(t.serverPortDesc)
			.addText(text => text
				.setPlaceholder('3001')
				.setValue(String(this.plugin.settings.serverPort))
				.onChange(async (value) => {
					const port = parseInt(value, 10);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.serverPort = port;
						await this.plugin.saveSettings();
						this.plugin.restartLocalServer();
					}
				}));
	}
}
