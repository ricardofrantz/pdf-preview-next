import * as assert from 'assert';
import { pathToFileURL } from 'url';
import * as vscode from 'vscode';
import { PDF_WEBVIEW_OPTIONS } from '../../extension';

interface ViewerReadyEvent {
  type: 'viewer-ready';
  resource: string;
  pagesCount: number;
  pageNumber: number;
  receivedAt: number;
}

interface ViewerErrorEvent {
  type: 'viewer-error';
  resource: string;
  message: string;
  receivedAt: number;
}

type ViewerEvent = ViewerReadyEvent | ViewerErrorEvent;

type UpsertMap<K, V> = Map<K, V> & {
  getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
};

type UpsertWeakMap<K extends object, V> = WeakMap<K, V> & {
  getOrInsertComputed(key: K, callbackFn: (key: K) => V): V;
};

async function readExtensionFile(
  extension: vscode.Extension<unknown>,
  ...parts: string[]
): Promise<string> {
  const data = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(extension.extensionUri, ...parts),
  );
  return Buffer.from(data).toString('utf8');
}

function minimalPdf(): Uint8Array {
  const stream = 'BT\n/F1 24 Tf\n72 720 Td\n(PDF Preview Next) Tj\nET\n';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    [
      '3 0 obj\n',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ',
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\n',
      'endobj\n',
    ].join(''),
    [
      '4 0 obj\n',
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\n`,
      'stream\n',
      stream,
      'endstream\n',
      'endobj\n',
    ].join(''),
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += [
    'trailer\n',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    'startxref\n',
    `${xrefOffset}\n`,
    '%%EOF\n',
  ].join('');

  return Buffer.from(pdf, 'latin1');
}

async function writePdfFixture(
  extension: vscode.Extension<unknown>,
): Promise<vscode.Uri> {
  const fixtureDir = vscode.Uri.joinPath(
    extension.extensionUri,
    '.work',
    'test-fixtures',
  );
  await vscode.workspace.fs.createDirectory(fixtureDir);
  const fixtureUri = vscode.Uri.joinPath(fixtureDir, 'minimal.pdf');
  await vscode.workspace.fs.writeFile(fixtureUri, minimalPdf());
  return fixtureUri;
}

async function assertPolyfillsWork(
  extension: vscode.Extension<unknown>,
): Promise<void> {
  await import(
    pathToFileURL(
      vscode.Uri.joinPath(extension.extensionUri, 'lib', 'polyfills.mjs')
        .fsPath,
    ).href
  );

  const map = new Map<string, number>() as UpsertMap<string, number>;
  let mapCalls = 0;
  assert.strictEqual(
    map.getOrInsertComputed('page', () => {
      mapCalls += 1;
      return 1;
    }),
    1,
  );
  assert.strictEqual(
    map.getOrInsertComputed('page', () => {
      mapCalls += 1;
      return 2;
    }),
    1,
  );
  assert.strictEqual(mapCalls, 1);
  assert.strictEqual(map.get('page'), 1);

  const weakMap = new WeakMap<object, string>() as UpsertWeakMap<
    object,
    string
  >;
  const key = {};
  let weakMapCalls = 0;
  assert.strictEqual(
    weakMap.getOrInsertComputed(key, () => {
      weakMapCalls += 1;
      return 'ready';
    }),
    'ready',
  );
  assert.strictEqual(
    weakMap.getOrInsertComputed(key, () => {
      weakMapCalls += 1;
      return 'stale';
    }),
    'ready',
  );
  assert.strictEqual(weakMapCalls, 1);
  assert.strictEqual(weakMap.get(key), 'ready');
  assert.strictEqual(
    Object.prototype.propertyIsEnumerable.call(
      Map.prototype,
      'getOrInsertComputed',
    ),
    false,
  );
  assert.strictEqual(
    Object.prototype.propertyIsEnumerable.call(
      WeakMap.prototype,
      'getOrInsertComputed',
    ),
    false,
  );
}

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
  const viewerEvent = await vscode.commands.executeCommand<ViewerEvent>(
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
