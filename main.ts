import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';
import * as http from 'http';

// ─── Settings ────────────────────────────────────────────────────────────────

interface MarkPagePluginSettings {
	markPageUrl: string;
	autoOpenBrowser: boolean;
	defaultTheme: string;
	serverPort: number;
}

const DEFAULT_SETTINGS: MarkPagePluginSettings = {
	markPageUrl: 'https://markpage.timikays.us.kg',
	autoOpenBrowser: true,
	defaultTheme: '',
	serverPort: 3001,
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

	async onload() {
		await this.loadSettings();
		this.startLocalServer();

		this.addRibbonIcon('send', '发送到 MarkPage', async () => {
			await this.syncToMarkPage();
		});

		this.addCommand({
			id: 'sync-to-markpage',
			name: '发送当前笔记到 MarkPage',
			checkCallback: (checking: boolean) => {
				const active = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!active) return false;
				if (!checking) this.syncToMarkPage();
				return true;
			},
		});

		this.addCommand({
			id: 'sync-to-markpage-pick-theme',
			name: '选择主题后发送到 MarkPage',
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
			new Notice(`本地服务启动失败: ${err.message}`);
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
			new Notice('没有打开的笔记');
			return;
		}

		const file = activeView.file;
		if (!file) {
			new Notice('找不到当前文件');
			return;
		}

		new Notice('正在发送到 MarkPage...');

		try {
			let markdown = await this.app.vault.read(file);
			markdown = await this.processImages(markdown, file);

			const config: Record<string, unknown> = { markdown };

			if (overrideTheme || this.settings.defaultTheme) {
				config.themeId = overrideTheme || this.settings.defaultTheme;
			}

			const titleMatch = markdown.match(/^#\s+(.+)$/m);
			if (titleMatch) {
				config.coverConfig = {
					enabled: true,
					title: titleMatch[1].trim(),
				};
			}

			pendingConfig = config;

			if (this.settings.autoOpenBrowser) {
				this.openMarkPage();
			}

			new Notice('✅ 已发送到 MarkPage！');
		} catch (error) {
			console.error('MarkPage sync error:', error);
			new Notice(`❌ 发送失败: ${error.message}`);
		}
	}

	// ─── Image Processing ────────────────────────────────────────────────────

	async processImages(markdown: string, sourceFile: TFile): Promise<string> {
		const sourceDir = sourceFile.parent?.path || '';
		let processed = markdown;

		const wikiLinkRegex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp))(?:\|([^\]]*))?\]\]/gi;
		const wikiMatches = [...markdown.matchAll(wikiLinkRegex)];
		for (const match of wikiMatches) {
			const fullMatch = match[0];
			const imageName = match[1];
			const sizeHint = match[3] || '';
			const imageFile = this.findImageFile(imageName);
			if (imageFile) {
				const url = await this.imageToBase64(imageFile);
				const altText = sizeHint ? `${imageName}|${sizeHint}` : imageName;
				processed = processed.replace(fullMatch, `![${altText}](${url})`);
			}
		}

		const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/gi;
		const mdMatches = [...processed.matchAll(mdImageRegex)];
		for (const match of mdMatches) {
			const fullMatch = match[0];
			const alt = match[1];
			const imagePath = match[2];
			if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('app://')) continue;
			const imageFile = this.resolveLocalImage(imagePath, sourceDir);
			if (imageFile) {
				const url = await this.imageToBase64(imageFile);
				processed = processed.replace(fullMatch, `![${alt}](${url})`);
			}
		}

		return processed;
	}

	findImageFile(imageName: string): TFile | null {
		const files = this.app.vault.getFiles();
		const lowerName = imageName.toLowerCase();
		return files.find(f => f.name.toLowerCase() === lowerName) ||
			files.find(f => f.path.toLowerCase().endsWith(lowerName)) ||
			files.find(f => f.path.toLowerCase().includes(lowerName) && /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(f.path)) ||
			null;
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

	async imageToBase64(imageFile: TFile): Promise<string> {
		const binary = await this.app.vault.readBinary(imageFile);
		const ext = imageFile.extension.toLowerCase();
		const mimeMap: Record<string, string> = {
			png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
			gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
		};
		const mime = mimeMap[ext] || 'image/png';
		const bytes = new Uint8Array(binary);
		let binaryStr = '';
		for (let i = 0; i < bytes.length; i++) {
			binaryStr += String.fromCharCode(bytes[i]);
		}
		return `data:${mime};base64,${btoa(binaryStr)}`;
	}

	openMarkPage() {
		// 带上 mcpUrl 参数，让 MarkPage 前端知道往哪轮询
		const mcpUrl = `http://localhost:${this.settings.serverPort}`;
		const fullUrl = `${this.settings.markPageUrl}?mcpUrl=${encodeURIComponent(mcpUrl)}`;
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
		contentEl.empty();
		contentEl.createEl('h2', { text: '选择主题' });

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
		containerEl.empty();
		containerEl.createEl('h2', { text: 'MarkPage 同步设置' });

		new Setting(containerEl)
			.setName('MarkPage 网址')
			.setDesc('MarkPage 网页地址，别人也能用同一个地址')
			.addText(text => text
				.setPlaceholder('https://markpage.timikays.us.kg')
				.setValue(this.plugin.settings.markPageUrl)
				.onChange(async (value) => {
					this.plugin.settings.markPageUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('默认主题')
			.setDesc('同步时自动应用的主题（可选）')
			.addDropdown(dropdown => {
				dropdown.addOption('', '不指定');
				for (const t of AVAILABLE_THEMES) {
					dropdown.addOption(t.id, `${t.emoji} ${t.name}`);
				}
				dropdown.setValue(this.plugin.settings.defaultTheme)
					.onChange(async (value) => {
						this.plugin.settings.defaultTheme = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('自动打开浏览器')
			.setDesc('同步后自动在浏览器打开 MarkPage')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenBrowser)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenBrowser = value;
					await this.plugin.saveSettings();
				}));
	}
}
