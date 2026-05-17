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
			// 浏览器 <img> 标签直接从这里加载图片
			// 用法: GET /vault-image?p=attachments/image.png
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

			// 过滤 frontmatter（--- 包裹的 YAML 元数据）
			const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
			markdown = markdown.replace(frontmatterRegex, '').trimStart();

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
	//
	// Obsidian 有两种图片格式：
	//   1. Wikilink: ![[image.png]] 或 ![[image.png|300]]
	//   2. 标准 Markdown: ![alt text](path/to/image.png)
	//
	// 核心思路：不塞 base64，而是把 vault 路径编码成短 URL
	// 浏览器 <img> 标签从插件本地 HTTP 服务加载图片
	// 同一张 vault 图片只保留一次，避免重复

	async processImages(markdown: string, sourceFile: TFile): Promise<string> {
		const sourceDir = sourceFile.parent?.path || '';
		const baseUrl = `http://localhost:${this.settings.serverPort}`;
		const processedFiles = new Set<string>(); // 已处理的 vault 文件路径，用于去重
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
						// 同一张图已经处理过了，删除重复引用
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
		//   也覆盖普通链接 [alt](image.jpg) 指向本地图片的情况
		const mdImageRegex = /!?\[([^\]]*)\]\(([^)]+)\)/gi;
		const mdMatches = [...markdown.matchAll(mdImageRegex)];
		for (const match of mdMatches) {
			const fullMatch = match[0];
			const alt = match[1];
			const imagePath = match[2];
			const isImage = fullMatch.startsWith('!');

			// 跳过已处理的 localhost URL / 网络图片 / data URL / 空
			if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('app://') || imagePath === '') continue;

			// 解码 URL 编码的路径（如 %20 → 空格）
			const decodedPath = decodeURIComponent(imagePath);

			// 非图片链接（没有 ! 前缀），只处理指向本地图片文件的
			if (!isImage && !/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(decodedPath)) continue;

			try {
				const imageFile = this.resolveLocalImage(decodedPath, sourceDir) || this.findImageFile(decodedPath);
				if (imageFile) {
					if (processedFiles.has(imageFile.path)) {
						// 同一张图已经处理过了，删除重复引用
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

		// 提示用户图片处理结果
		if (imageCount > 0 && failCount === 0) {
			new Notice(`📷 已处理 ${imageCount} 张图片`);
		} else if (failCount > 0) {
			new Notice(`⚠️ ${imageCount} 张图片成功，${failCount} 张未找到: ${failedNames.join(', ')}`);
		}

		return markdown;
	}

	findImageFile(imageName: string): TFile | null {
		const files = this.app.vault.getFiles();
		const lowerName = imageName.toLowerCase();

		// 1. 精确匹配文件名
		let found = files.find(f => f.name.toLowerCase() === lowerName);
		if (found) return found;

		// 2. 路径以该文件名结尾（可能在子目录下，如 attachments/xxx.png）
		found = files.find(f => f.path.toLowerCase().endsWith('/' + lowerName) || f.path.toLowerCase().endsWith('\\' + lowerName));
		if (found) return found;

		// 3. 路径包含该文件名
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

	openMarkPage() {
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
