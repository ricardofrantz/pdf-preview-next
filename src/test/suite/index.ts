import * as assert from 'assert';
import * as vscode from 'vscode';
import { PDF_WEBVIEW_OPTIONS } from '../../extension';

export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    ({ packageJSON }) => packageJSON.name === 'pdf-preview-next',
  );
  assert.ok(extension, 'PDF Preview Next extension should be registered.');
  assert.strictEqual(extension.packageJSON.displayName, 'vscode-pdf Next');

  const sidebarDefault = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<boolean>('default.sidebar');
  assert.strictEqual(sidebarDefault, false);

  const closeOnDelete = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<boolean>('reload.closeOnDelete');
  assert.strictEqual(closeOnDelete, false);

  const debounceMs = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<number>('reload.debounceMs');
  assert.strictEqual(debounceMs, 800);

  const theme = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<string>('appearance.theme');
  assert.strictEqual(theme, 'auto');

  const commandIds = new Set(
    extension.packageJSON.contributes.commands.map(
      ({ command }: { command: string }) => command,
    ),
  );
  assert.ok(commandIds.has('pdf-preview.refreshPreview'));
  assert.ok(commandIds.has('pdf-preview.print'));
  assert.strictEqual(PDF_WEBVIEW_OPTIONS.retainContextWhenHidden, false);

  const webviewSource = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(extension.extensionUri, 'out', 'src', 'pdfPreview.js'),
  );
  const webviewSourceText = Buffer.from(webviewSource).toString('utf8');
  assert.match(webviewSourceText, /style-src 'unsafe-inline'/);
  assert.match(webviewSourceText, /script-src 'nonce-\$\{nonce\}'/);
  assert.doesNotMatch(webviewSourceText, /script-src[^\n]+unsafe-inline/);
  assert.doesNotMatch(webviewSourceText, /unsafe-eval|wasm-unsafe-eval/);
  assert.match(webviewSourceText, /Could not start PDF viewer:/);
  assert.match(webviewSourceText, /addEventListener\('unhandledrejection'/);
  assert.match(
    webviewSourceText,
    /<div id="viewerContainer" role="main" tabindex="0">/,
    'PDF.js 5 requires the viewer container option to be a DIV element.',
  );
  assert.doesNotMatch(webviewSourceText, /<main id="viewerContainer"/);

  const viewerScript = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(extension.extensionUri, 'lib', 'main.mjs'),
  );
  const viewerScriptText = Buffer.from(viewerScript).toString('utf8');
  const pdfCoreImportIndex = viewerScriptText.indexOf(
    "import * as pdfjsLib from './pdfjs/build/pdf.min.mjs';",
  );
  const viewerImportIndex = viewerScriptText.indexOf(
    "await import('./pdfjs/web/pdf_viewer.mjs')",
  );
  assert.ok(pdfCoreImportIndex >= 0, 'PDF.js core must load first.');
  assert.ok(
    viewerImportIndex > pdfCoreImportIndex,
    'PDF.js viewer must load after PDF.js core.',
  );
  assert.match(viewerScriptText, /globalThis\.pdfjsLib = pdfjsLib/);
  assert.doesNotMatch(
    viewerScriptText,
    /from '.\/pdfjs\/web\/pdf_viewer\.mjs'/,
  );
  assert.match(viewerScriptText, /fetch\(this\.config\.path/);
  assert.match(viewerScriptText, /data,\n\s+disableRange: true/);
  assert.match(viewerScriptText, /disableStream: true/);
  assert.doesNotMatch(viewerScriptText, /url: this\.config\.path/);
  assert.match(
    viewerScriptText,
    /document\.readyState === 'loading'/,
    'viewer should start immediately if DOMContentLoaded already fired',
  );
  assert.match(
    viewerScriptText,
    /addEventListener\('DOMContentLoaded', startApp/,
  );

  return Promise.resolve();
}
