import * as assert from 'assert';
import * as vscode from 'vscode';
import { PDF_WEBVIEW_OPTIONS } from '../../extension';
import {
  parseViewerToHostMessage,
  persistedViewStateOrUndefined,
  viewStateKey,
} from '../../webviewContract';
import {
  assertPolyfillsWork,
  readExtensionFile,
  writePdfFixture,
  type RecordedViewerEvent,
} from './testSupport';

function assertWebviewContract(): void {
  const viewState = {
    pageNumber: 2,
    scaleValue: 'page-width',
    scrollLeft: 10,
    scrollTop: 20,
    outlineVisible: true,
  };

  assert.deepStrictEqual(parseViewerToHostMessage({ type: 'open-source' }), {
    type: 'open-source',
  });
  assert.deepStrictEqual(parseViewerToHostMessage({ type: 'open-external' }), {
    type: 'open-external',
  });
  assert.deepStrictEqual(
    parseViewerToHostMessage({ type: 'view-state', state: viewState }),
    { type: 'view-state', state: viewState },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({
      type: 'viewer-ready',
      pagesCount: 3,
      pageNumber: 2,
    }),
    { type: 'viewer-ready', pagesCount: 3, pageNumber: 2 },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({ type: 'viewer-error', message: 'failed' }),
    { type: 'viewer-error', message: 'failed' },
  );
  assert.strictEqual(
    parseViewerToHostMessage({
      type: 'viewer-ready',
      pagesCount: 0,
      pageNumber: 1,
    }),
    undefined,
  );
  assert.strictEqual(
    parseViewerToHostMessage({
      type: 'viewer-ready',
      pagesCount: 1,
      pageNumber: 1,
      extra: true,
    }),
    undefined,
  );
  assert.strictEqual(
    persistedViewStateOrUndefined({
      ...viewState,
      scrollLeft: Number.NaN,
    }),
    undefined,
  );

  const stateKey = viewStateKey(
    vscode.Uri.parse('file:///workspace/document.pdf#page=2'),
  );
  assert.strictEqual(
    stateKey,
    'pdf-preview-next.view-state:file:///workspace/document.pdf',
  );
}

export async function run(): Promise<void> {
  assertWebviewContract();

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

  const webviewSourceText = await readExtensionFile(
    extension,
    'out',
    'src',
    'pdfPreview.js',
  );
  assert.match(webviewSourceText, /style-src 'unsafe-inline'/);
  assert.match(webviewSourceText, /script-src 'nonce-\$\{nonce\}'/);
  assert.doesNotMatch(webviewSourceText, /script-src[^\n]+unsafe-inline/);
  assert.doesNotMatch(webviewSourceText, /unsafe-eval|wasm-unsafe-eval/);
  assert.match(webviewSourceText, /Could not start PDF viewer:/);
  assert.match(webviewSourceText, /addEventListener\('unhandledrejection'/);
  assert.match(webviewSourceText, /viewer-ready/);
  assert.match(webviewSourceText, /viewer-error/);
  assert.match(
    webviewSourceText,
    /<div class="viewer-region">\s*<div id="viewerContainer" role="main" tabindex="0">/,
    'PDF.js 5 requires the viewer container option to be an absolutely positioned DIV element.',
  );
  assert.doesNotMatch(webviewSourceText, /<main id="viewerContainer"/);

  const viewerStylesText = await readExtensionFile(extension, 'lib', 'pdf.css');
  assert.match(
    viewerStylesText,
    /\.viewer-region\s*{[^}]*position: relative;/s,
  );
  assert.match(
    viewerStylesText,
    /#viewerContainer\s*{[^}]*position: absolute;/s,
  );
  assert.match(viewerStylesText, /#viewerContainer\s*{[^}]*inset: 0;/s);

  const viewerScriptText = await readExtensionFile(
    extension,
    'lib',
    'main.mjs',
  );
  const polyfillsImportIndex = viewerScriptText.indexOf(
    "import './polyfills.mjs';",
  );
  const pdfCoreImportIndex = viewerScriptText.indexOf(
    "import * as pdfjsLib from './pdfjs/build/pdf.min.mjs';",
  );
  const viewerImportIndex = viewerScriptText.indexOf(
    "await import('./pdfjs/web/pdf_viewer.mjs')",
  );
  assert.ok(polyfillsImportIndex >= 0, 'PDF.js polyfills must load first.');
  assert.ok(pdfCoreImportIndex >= 0, 'PDF.js core must load first.');
  assert.ok(
    polyfillsImportIndex < pdfCoreImportIndex,
    'PDF.js polyfills must evaluate before PDF.js core.',
  );
  assert.ok(
    viewerImportIndex > pdfCoreImportIndex,
    'PDF.js viewer must load after PDF.js core.',
  );
  assert.ok(
    polyfillsImportIndex < viewerImportIndex,
    'PDF.js polyfills must evaluate before PDF.js viewer.',
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

  const polyfillsScriptText = await readExtensionFile(
    extension,
    'lib',
    'polyfills.mjs',
  );
  assert.match(polyfillsScriptText, /Map\.prototype\.getOrInsertComputed/);
  assert.match(polyfillsScriptText, /WeakMap\.prototype\.getOrInsertComputed/);
  await assertPolyfillsWork(extension);

  const pdfViewerSourceText = await readExtensionFile(
    extension,
    'lib',
    'pdfjs',
    'web',
    'pdf_viewer.mjs',
  );
  if (pdfViewerSourceText.includes('getOrInsertComputed')) {
    assert.match(
      polyfillsScriptText,
      /getOrInsertComputed/,
      'PDF.js viewer uses getOrInsertComputed, so the extension must ship the polyfill.',
    );
  }

  const fixtureUri = await writePdfFixture(extension);
  await vscode.commands.executeCommand(
    'vscode.openWith',
    fixtureUri,
    'pdf-preview-next.preview',
  );
  const viewerEvent = await vscode.commands.executeCommand<RecordedViewerEvent>(
    'pdf-preview.internal.waitForViewerEvent',
    fixtureUri.toString(),
    20000,
  );
  assert.ok(viewerEvent, 'PDF viewer should report a load result.');
  if (viewerEvent.type === 'viewer-error') {
    assert.fail(`PDF viewer failed to load fixture: ${viewerEvent.message}`);
  }
  assert.strictEqual(viewerEvent.type, 'viewer-ready');
  assert.strictEqual(viewerEvent.pagesCount, 1);
  assert.strictEqual(viewerEvent.pageNumber, 1);

  return Promise.resolve();
}
