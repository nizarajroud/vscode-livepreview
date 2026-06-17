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
		let finalHtml: string;

		if (htmlContent.includes('<head>')) {
			finalHtml = htmlContent.replace('<head>', `<head>${baseTag}`);
		} else if (htmlContent.includes('<html>')) {
			finalHtml = htmlContent.replace('<html>', `<html><head>${baseTag}</head>`);
		} else {
			finalHtml = `<head>${baseTag}</head>${htmlContent}`;
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
						updated = html.replace('<head>', `<head>${baseTag}`);
					} else if (html.includes('<html>')) {
						updated = html.replace('<html>', `<html><head>${baseTag}</head>`);
					} else {
						updated = `<head>${baseTag}</head>${html}`;
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
