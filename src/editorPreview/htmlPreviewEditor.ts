/*---------------------------------------------------------------------------------------------
 *  Custom HTML Preview Editor — renders HTML files as preview by default on double-click.
 *  Added by nizarajroud as part of vscode-html-preview-default fork.
 *  Workaround for VS Code bug #192954 (editorAssociations not working in WSL).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SETTINGS_SECTION_ID } from '../utils/settingsUtil';

export class HtmlPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider {
	public static readonly viewType = `${SETTINGS_SECTION_ID}.htmlPreview`;

	constructor(
		private readonly _extensionUri: vscode.Uri
	) {}

	public async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media'),
				vscode.Uri.file('/'),
			],
		};

		// Read the HTML file content
		const fileContent = await vscode.workspace.fs.readFile(document.uri);
		const htmlContent = Buffer.from(fileContent).toString('utf8');

		// Get webview URI for the file's directory (for relative resources)
		const fileDir = vscode.Uri.joinPath(document.uri, '..');
		const basePath = webviewPanel.webview.asWebviewUri(fileDir);

		// Inject a <base> tag so relative links resolve correctly
		const baseTag = `<base href="${basePath}/">`;
		const zoomScript = `<script>
(function() {
	let zoom = 1;
	let findBarVisible = false;
	let currentMatch = -1;
	let matches = [];

	function createFindBar() {
		const bar = document.createElement('div');
		bar.id = 'find-bar';
		bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#252526;padding:6px 12px;display:none;align-items:center;gap:8px;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;';
		bar.innerHTML = '<input id="find-input" type="text" placeholder="Find..." style="background:#3c3c3c;border:1px solid #555;color:#ccc;padding:4px 8px;border-radius:3px;width:250px;outline:none;font-size:13px;"><span id="find-count" style="color:#999;min-width:70px;"></span><button id="find-prev" style="background:#3c3c3c;border:1px solid #555;color:#ccc;padding:3px 8px;border-radius:3px;cursor:pointer;">▲</button><button id="find-next" style="background:#3c3c3c;border:1px solid #555;color:#ccc;padding:3px 8px;border-radius:3px;cursor:pointer;">▼</button><button id="find-close" style="background:none;border:none;color:#ccc;padding:3px 8px;cursor:pointer;font-size:16px;">✕</button>';
		document.body.prepend(bar);
		return bar;
	}

	const findBar = createFindBar();
	const findInput = document.getElementById('find-input');
	const findCount = document.getElementById('find-count');

	function clearHighlights() {
		document.querySelectorAll('mark[data-find]').forEach(m => {
			m.replaceWith(m.textContent);
		});
		matches = [];
		currentMatch = -1;
	}

	function doSearch(query) {
		clearHighlights();
		if (!query) { findCount.textContent = ''; return; }
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		const textNodes = [];
		while (walker.nextNode()) {
			if (walker.currentNode.parentElement.id === 'find-bar') continue;
			textNodes.push(walker.currentNode);
		}
		textNodes.forEach(node => {
			const idx = node.textContent.toLowerCase().indexOf(query.toLowerCase());
			if (idx >= 0) {
				const range = document.createRange();
				range.setStart(node, idx);
				range.setEnd(node, idx + query.length);
				const mark = document.createElement('mark');
				mark.setAttribute('data-find', 'true');
				mark.style.cssText = 'background:#515c6a;color:#fff;padding:1px 2px;border-radius:2px;';
				range.surroundContents(mark);
				matches.push(mark);
			}
		});
		findCount.textContent = matches.length > 0 ? '1 of ' + matches.length : 'No results';
		if (matches.length > 0) { currentMatch = 0; highlightCurrent(); }
	}

	function highlightCurrent() {
		matches.forEach((m, i) => {
			m.style.background = i === currentMatch ? '#f9e64f' : '#515c6a';
			m.style.color = i === currentMatch ? '#000' : '#fff';
		});
		if (matches[currentMatch]) matches[currentMatch].scrollIntoView({ block: 'center' });
		findCount.textContent = (currentMatch + 1) + ' of ' + matches.length;
	}

	document.getElementById('find-next').onclick = () => { if (matches.length) { currentMatch = (currentMatch + 1) % matches.length; highlightCurrent(); } };
	document.getElementById('find-prev').onclick = () => { if (matches.length) { currentMatch = (currentMatch - 1 + matches.length) % matches.length; highlightCurrent(); } };
	document.getElementById('find-close').onclick = () => { findBar.style.display = 'none'; findBarVisible = false; clearHighlights(); };
	findInput.addEventListener('input', (e) => doSearch(e.target.value));
	findInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); document.getElementById(e.shiftKey ? 'find-prev' : 'find-next').click(); }
		if (e.key === 'Escape') { document.getElementById('find-close').click(); }
	});

	document.addEventListener('keydown', function(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
			e.preventDefault();
			findBar.style.display = 'flex';
			findBarVisible = true;
			findInput.focus();
			findInput.select();
		} else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
			e.preventDefault();
			zoom = Math.min(zoom + 0.1, 3);
			document.body.style.zoom = zoom;
		} else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
			e.preventDefault();
			zoom = Math.max(zoom - 0.1, 0.3);
			document.body.style.zoom = zoom;
		} else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
			e.preventDefault();
			zoom = 1;
			document.body.style.zoom = zoom;
		}
	});
	document.addEventListener('wheel', function(e) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			zoom += e.deltaY > 0 ? -0.05 : 0.05;
			zoom = Math.max(0.3, Math.min(3, zoom));
			document.body.style.zoom = zoom;
		}
	}, { passive: false });
})();
</script>`;
		let finalHtml: string;

		if (htmlContent.includes('<head>')) {
			finalHtml = htmlContent.replace('<head>', `<head>${baseTag}${zoomScript}`);
		} else if (htmlContent.includes('<html>')) {
			finalHtml = htmlContent.replace('<html>', `<html><head>${baseTag}${zoomScript}</head>`);
		} else {
			finalHtml = `<head>${baseTag}${zoomScript}</head>${htmlContent}`;
		}

		webviewPanel.webview.html = finalHtml;

		// Watch for file changes and update the preview
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(document.uri, '*')
		);

		// Poll for changes on /mnt/ (inotify doesn't work there)
		let lastMtime = 0;
		const pollInterval = setInterval(async () => {
			try {
				const stat = await vscode.workspace.fs.stat(document.uri);
				if (stat.mtime > lastMtime && lastMtime > 0) {
					const content = await vscode.workspace.fs.readFile(document.uri);
					const html = Buffer.from(content).toString('utf8');
					let updated: string;
					if (html.includes('<head>')) {
						updated = html.replace('<head>', `<head>${baseTag}${zoomScript}`);
					} else if (html.includes('<html>')) {
						updated = html.replace('<html>', `<html><head>${baseTag}${zoomScript}</head>`);
					} else {
						updated = `<head>${baseTag}${zoomScript}</head>${html}`;
					}
					webviewPanel.webview.html = updated;
				}
				lastMtime = stat.mtime;
			} catch {
				// File may have been deleted
			}
		}, 2000);

		// Initial mtime
		try {
			const stat = await vscode.workspace.fs.stat(document.uri);
			lastMtime = stat.mtime;
		} catch {}

		webviewPanel.onDidDispose(() => {
			clearInterval(pollInterval);
			watcher.dispose();
		});
	}
}
