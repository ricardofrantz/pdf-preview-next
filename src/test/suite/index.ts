import * as assert from 'assert';
import * as vscode from 'vscode';
import { disposeAll } from '../../disposable';
import { PDF_WEBVIEW_OPTIONS } from '../../extension';
import {
  PDF_VIEWER_BODY,
  clearPdfPreviewViewState,
  renderPdfPreviewHtml,
  resolvePdfLinkTarget,
  webviewLocalResourceRoots,
} from '../../pdfPreview';
import { parsePrintCommand } from '../../print';
import {
  parseViewerToHostMessage,
  persistedViewStateOrUndefined,
  viewStateKey,
} from '../../webviewContract';
import {
  assertPolyfillsWork,
  minimalPdf,
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
    sidebarPanel: 'thumbnails' as const,
  };

  assert.deepStrictEqual(parseViewerToHostMessage({ type: 'open-source' }), {
    type: 'open-source',
  });
  assert.strictEqual(
    parseViewerToHostMessage({ type: 'open-source', extra: true }),
    undefined,
  );
  assert.deepStrictEqual(parseViewerToHostMessage({ type: 'open-external' }), {
    type: 'open-external',
  });
  assert.strictEqual(
    parseViewerToHostMessage({ type: 'open-external', extra: true }),
    undefined,
  );
  assert.deepStrictEqual(parseViewerToHostMessage({ type: 'print-request' }), {
    type: 'print-request',
  });
  assert.strictEqual(
    parseViewerToHostMessage({ type: 'print-request', extra: true }),
    undefined,
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({
      type: 'open-pdf-link',
      href: 'link-target.pdf#page=2',
    }),
    { type: 'open-pdf-link', href: 'link-target.pdf#page=2' },
  );
  assert.strictEqual(
    parseViewerToHostMessage({ type: 'open-pdf-link', href: '' }),
    undefined,
  );
  assert.strictEqual(
    parseViewerToHostMessage({
      type: 'open-pdf-link',
      href: 'link-target.pdf',
      extra: true,
    }),
    undefined,
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({
      type: 'appearance-theme',
      theme: 'night',
    }),
    { type: 'appearance-theme', theme: 'night' },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({
      type: 'appearance-theme',
      theme: 'reader',
    }),
    { type: 'appearance-theme', theme: 'reader' },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({
      type: 'appearance-theme',
      theme: 'dark-pages',
    }),
    { type: 'appearance-theme', theme: 'dark-pages' },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({ type: 'appearance-theme', theme: 'auto' }),
    { type: 'appearance-theme', theme: 'auto' },
  );
  assert.deepStrictEqual(
    parseViewerToHostMessage({ type: 'appearance-theme', theme: 'light' }),
    { type: 'appearance-theme', theme: 'light' },
  );
  assert.strictEqual(
    parseViewerToHostMessage({ type: 'appearance-theme', theme: 'sepia' }),
    undefined,
  );
  assert.strictEqual(
    parseViewerToHostMessage(
      Object.assign(new Date(), { type: 'open-source' }),
    ),
    undefined,
  );
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
  assert.strictEqual(
    persistedViewStateOrUndefined({
      ...viewState,
      sidebarPanel: 'attachments',
    }),
    undefined,
  );
  assert.ok(
    persistedViewStateOrUndefined({
      pageNumber: 1,
      scaleValue: 'auto',
      scrollLeft: 0,
      scrollTop: 0,
      outlineVisible: false,
    }),
    'Stored view states without sidebarPanel should remain valid.',
  );

  const stateKey = viewStateKey(
    vscode.Uri.parse('file:///workspace/document.pdf#page=2'),
  );
  assert.strictEqual(
    stateKey,
    'pdf-preview-next.view-state:file:///workspace/document.pdf',
  );
}

function assertLinkAndPrintHelpers(): void {
  const source = vscode.Uri.file('/workspace/docs/source.pdf');
  const target = resolvePdfLinkTarget(source, 'link-target.pdf#page=2');
  assert.ok(target, 'Relative PDF target should resolve.');
  assert.strictEqual(target.fsPath, '/workspace/docs/link-target.pdf');
  assert.strictEqual(target.fragment, 'page=2');

  const spacedTarget = resolvePdfLinkTarget(
    source,
    'nested/linked%20target.PDF#nameddest=Figure1',
  );
  assert.ok(spacedTarget, 'Encoded PDF target should resolve.');
  assert.strictEqual(
    spacedTarget.fsPath,
    '/workspace/docs/nested/linked target.PDF',
  );
  assert.strictEqual(spacedTarget.fragment, 'nameddest=Figure1');

  assert.strictEqual(resolvePdfLinkTarget(source, '../outside.pdf'), undefined);
  assert.strictEqual(
    resolvePdfLinkTarget(source, '/tmp/outside.pdf'),
    undefined,
  );
  assert.strictEqual(
    resolvePdfLinkTarget(source, 'https://example.com/file.pdf'),
    undefined,
  );
  assert.strictEqual(resolvePdfLinkTarget(source, 'notes.txt'), undefined);

  assert.deepStrictEqual(
    parsePrintCommand('lp -d "Office Printer" {{file}}', '/tmp/a b.pdf'),
    {
      command: 'lp',
      args: ['-d', 'Office Printer', '/tmp/a b.pdf'],
    },
  );
  assert.deepStrictEqual(parsePrintCommand('open -a Preview', '/tmp/a b.pdf'), {
    command: 'open',
    args: ['-a', 'Preview', '/tmp/a b.pdf'],
  });
  assert.strictEqual(
    parsePrintCommand('lp -d "unfinished', '/tmp/a b.pdf'),
    undefined,
  );
}

function assertWebviewHtmlHooks(): void {
  const extensionRoot = vscode.Uri.parse('file:///extension');
  const resource = vscode.Uri.parse('file:///workspace/docs/paper.pdf');
  assert.deepStrictEqual(
    webviewLocalResourceRoots(extensionRoot, resource).map((uri) =>
      uri.toString(),
    ),
    ['file:///extension', 'file:///workspace/docs'],
  );

  assert.match(
    PDF_VIEWER_BODY,
    /<button id="themeToggle"[^>]*>[\s\S]*?<span class="label">Clear<\/span>/,
    'Viewer body hook should expose the page-mode button markup.',
  );
  assert.match(
    PDF_VIEWER_BODY,
    /<button id="thumbnailPanelTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="thumbnailPanel">Thumbnails<\/button>/,
    'Viewer body hook should expose the thumbnail sidebar tab.',
  );
  assert.match(
    PDF_VIEWER_BODY,
    /<section id="thumbnailPanel"[^>]*class="sidebar-panel thumbnail-panel hidden"[^>]*aria-label="Page thumbnails"[^>]*hidden>[\s\S]*?<div id="thumbnailList" class="thumbnail-list" aria-label="Page thumbnails"><\/div>/,
    'Viewer body hook should expose the thumbnail sidebar shell.',
  );

  const html = renderPdfPreviewHtml({
    csp: "default-src 'none'; script-src 'nonce-fixed' vscode-resource:; style-src 'unsafe-inline' vscode-resource:",
    nonce: 'fixed',
    config: {
      path: 'vscode-resource://document.pdf',
      appearance: { theme: 'reader' },
    },
    pdfViewerStylesUri: 'vscode-resource://pdf_viewer.css',
    viewerStylesUri: 'vscode-resource://pdf.css',
    mainScriptUri: 'vscode-resource://main.mjs',
  });

  assert.match(
    html,
    /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fixed' vscode-resource:; style-src 'unsafe-inline' vscode-resource:">/,
  );
  assert.doesNotMatch(html, /script-src[^;"]*unsafe-inline/);
  assert.match(html, /style-src 'unsafe-inline'/);
  assert.match(html, /<script nonce="fixed">/);
  assert.match(
    html,
    /<script nonce="fixed" type="module" src="vscode-resource:\/\/main\.mjs"><\/script>/,
  );
  assert.match(
    html,
    /data-config="\{&quot;path&quot;:&quot;vscode-resource:\/\/document\.pdf&quot;,&quot;appearance&quot;:\{&quot;theme&quot;:&quot;reader&quot;\}\}"/,
    'Viewer config should be embedded as escaped JSON in an HTML attribute.',
  );
  assert.match(
    html,
    /<link rel="stylesheet" href="vscode-resource:\/\/pdf_viewer\.css">/,
  );
  assert.match(
    html,
    /<link rel="stylesheet" href="vscode-resource:\/\/pdf\.css">/,
  );
}

function assertDisposeAllKeepsDraining(): void {
  const disposed: string[] = [];
  const errors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]): void => {
    errors.push(args);
  };

  try {
    const disposables: vscode.Disposable[] = [
      { dispose: () => disposed.push('first') },
      {
        dispose: () => {
          throw new Error('dispose failed');
        },
      },
      { dispose: () => disposed.push('third') },
    ];

    disposeAll(disposables);

    assert.deepStrictEqual(disposed, ['third', 'first']);
    assert.deepStrictEqual(disposables, []);
    assert.strictEqual(errors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
}

async function assertViewStateResetHelper(): Promise<void> {
  const resource = vscode.Uri.parse('file:///workspace/docs/paper.pdf#page=2');
  const updates: Array<[string, unknown]> = [];
  const workspaceState = {
    keys: () => [],
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    update: async (key: string, value: unknown): Promise<void> => {
      updates.push([key, value]);
    },
  } as vscode.Memento;

  await clearPdfPreviewViewState(workspaceState, resource);

  assert.deepStrictEqual(updates, [
    ['pdf-preview-next.view-state:file:///workspace/docs/paper.pdf', undefined],
  ]);
}

async function assertCheckedInFixtures(
  extension: vscode.Extension<unknown>,
): Promise<void> {
  const fixtureDir = vscode.Uri.joinPath(
    extension.extensionUri,
    'src',
    'test',
    'fixtures',
  );
  const outlineBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(fixtureDir, 'outline.pdf'),
  );
  const passwordBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(fixtureDir, 'password.pdf'),
  );
  const brokenBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(fixtureDir, 'broken.pdf'),
  );
  const linkSourceBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(fixtureDir, 'link-source.pdf'),
  );
  const linkTargetBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(fixtureDir, 'link-target.pdf'),
  );

  const outlineText = Buffer.from(outlineBytes).toString('latin1');
  const passwordText = Buffer.from(passwordBytes).toString('latin1');
  const brokenText = Buffer.from(brokenBytes).toString('latin1');
  const linkSourceText = Buffer.from(linkSourceBytes).toString('latin1');
  const linkTargetText = Buffer.from(linkTargetBytes).toString('latin1');

  assert.match(outlineText, /^%PDF-1\.4/);
  assert.match(outlineText, /\/Outlines 8 0 R/);
  assert.match(outlineText, /\/Count 2/);
  assert.match(outlineText, /%%EOF\s*$/);

  assert.match(passwordText, /^%PDF-/);
  assert.match(passwordText, /\/Encrypt\b/);
  assert.match(passwordText, /%%EOF\s*$/);

  assert.match(brokenText, /^%PDF-1\.4/);
  assert.doesNotMatch(brokenText, /%%EOF\s*$/);
  assert.ok(
    brokenBytes.byteLength < outlineBytes.byteLength,
    'Broken fixture should be a truncated variant of the outline fixture.',
  );

  assert.match(linkSourceText, /^%PDF-1\.4/);
  assert.match(linkSourceText, /link-target\.pdf#page=2/);
  assert.match(linkSourceText, /https:\/\/example\.com\//);
  assert.match(linkSourceText, /%%EOF\s*$/);

  assert.match(linkTargetText, /^%PDF-1\.4/);
  assert.match(linkTargetText, /\/Count 2/);
  assert.match(linkTargetText, /Link target page 2/);
  assert.match(linkTargetText, /%%EOF\s*$/);
}

async function assertRuntimeConfigurationScope(
  extension: vscode.Extension<unknown>,
): Promise<void> {
  const compiledPreview = await readExtensionFile(
    extension,
    'out',
    'src',
    'pdfPreview.js',
  );

  assert.match(
    compiledPreview,
    /const pdfConfig = vscode\.workspace\.getConfiguration\(\s*'pdf-preview',\s*this\.resource,?\s*\);/,
    'PDF-specific settings should be read with the opened PDF as the configuration scope.',
  );

  for (const setting of [
    'default.cursor',
    'default.scale',
    'default.sidebar',
    'default.sidebarPanel',
    'default.scrollMode',
    'default.spreadMode',
    'appearance.pageGap',
    'appearance.theme',
  ]) {
    assert.match(
      compiledPreview,
      new RegExp(`pdfConfig\\.get(?:<[^>]+>)?\\('${setting}'\\)`),
      `${setting} should be read from the resource-scoped configuration.`,
    );
  }
}

async function waitForViewerEvent(
  fixtureUri: vscode.Uri,
  timeoutMs: number,
  afterReceivedAt = 0,
): Promise<RecordedViewerEvent> {
  const event = await vscode.commands.executeCommand<RecordedViewerEvent>(
    'pdf-preview.internal.waitForViewerEvent',
    fixtureUri.toString(),
    timeoutMs,
    afterReceivedAt,
  );
  assert.ok(event, 'PDF viewer should report a load result.');
  if (event.type === 'viewer-error') {
    assert.fail(`PDF viewer failed to load fixture: ${event.message}`);
  }
  return event;
}

async function assertFileWatcherReloadDoesNotStealFocus(
  fixtureUri: vscode.Uri,
  initialViewerEvent: RecordedViewerEvent,
): Promise<RecordedViewerEvent> {
  const sourceDocument = await vscode.workspace.openTextDocument({
    content: 'PDF Preview focus sentinel\n',
    language: 'plaintext',
  });
  await vscode.window.showTextDocument(sourceDocument, {
    preserveFocus: false,
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  });
  assert.strictEqual(
    vscode.window.activeTextEditor?.document.uri.toString(),
    sourceDocument.uri.toString(),
    'Text document should be active before the PDF reload is triggered.',
  );

  await vscode.workspace.fs.writeFile(
    fixtureUri,
    minimalPdf('PDF Preview Next Reloaded'),
  );
  const reloadEvent = await waitForViewerEvent(
    fixtureUri,
    20000,
    initialViewerEvent.receivedAt,
  );
  assert.strictEqual(
    vscode.window.activeTextEditor?.document.uri.toString(),
    sourceDocument.uri.toString(),
    'File-watcher reload must not steal focus from the active text editor.',
  );

  return reloadEvent;
}

export async function run(): Promise<void> {
  assertWebviewContract();
  assertLinkAndPrintHelpers();
  assertWebviewHtmlHooks();
  assertDisposeAllKeepsDraining();
  await assertViewStateResetHelper();

  const extension = vscode.extensions.all.find(
    ({ packageJSON }) => packageJSON.name === 'pdf-preview-next',
  );
  assert.ok(extension, 'PDF Preview Next extension should be registered.');
  assert.strictEqual(extension.packageJSON.displayName, 'vscode-pdf Next');
  await assertCheckedInFixtures(extension);
  await assertRuntimeConfigurationScope(extension);

  const sidebarDefault = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<boolean>('default.sidebar');
  assert.strictEqual(sidebarDefault, false);
  const sidebarPanelDefault = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<string>('default.sidebarPanel');
  assert.strictEqual(sidebarPanelDefault, 'outline');
  assert.deepStrictEqual(
    extension.packageJSON.contributes.configuration.properties[
      'pdf-preview.default.sidebarPanel'
    ].enum,
    ['outline', 'thumbnails'],
  );

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
  const appearanceThemeConfig =
    extension.packageJSON.contributes.configuration.properties[
      'pdf-preview.appearance.theme'
    ];
  assert.deepStrictEqual(appearanceThemeConfig.enum, [
    'auto',
    'light',
    'dark',
    'night',
    'reader',
    'dark-pages',
    'inverted',
  ]);
  const configurationProperties =
    extension.packageJSON.contributes.configuration.properties;
  const resourceScopedSettings = [
    'pdf-preview.default.cursor',
    'pdf-preview.default.scale',
    'pdf-preview.default.sidebar',
    'pdf-preview.default.sidebarPanel',
    'pdf-preview.default.scrollMode',
    'pdf-preview.default.spreadMode',
    'pdf-preview.appearance.theme',
    'pdf-preview.appearance.pageGap',
    'pdf-preview.printCommand',
  ];
  for (const setting of resourceScopedSettings) {
    assert.strictEqual(
      configurationProperties[setting].scope,
      'resource',
      `${setting} should support resource-scoped overrides.`,
    );
  }
  assert.deepStrictEqual(
    Object.fromEntries(
      Object.entries(configurationProperties).map(([key, value]) => [
        key,
        (value as { default: unknown }).default,
      ]),
    ),
    {
      'pdf-preview.default.cursor': 'select',
      'pdf-preview.default.scale': 'auto',
      'pdf-preview.default.sidebar': false,
      'pdf-preview.default.sidebarPanel': 'outline',
      'pdf-preview.default.scrollMode': 'vertical',
      'pdf-preview.default.spreadMode': 'none',
      'pdf-preview.reload.closeOnDelete': false,
      'pdf-preview.reload.debounceMs': 800,
      'pdf-preview.appearance.theme': 'auto',
      'pdf-preview.appearance.pageGap': 'normal',
      'pdf-preview.printCommand': '',
    },
  );

  const commandIds = new Set(
    extension.packageJSON.contributes.commands.map(
      ({ command }: { command: string }) => command,
    ),
  );
  assert.deepStrictEqual([...commandIds].sort(), [
    'pdf-preview.openPreview',
    'pdf-preview.openSource',
    'pdf-preview.print',
    'pdf-preview.refreshPreview',
    'pdf-preview.resetViewState',
  ]);
  assert.deepStrictEqual([...extension.packageJSON.activationEvents].sort(), [
    'onCommand:pdf-preview.openPreview',
    'onCommand:pdf-preview.openSource',
    'onCommand:pdf-preview.print',
    'onCommand:pdf-preview.refreshPreview',
    'onCommand:pdf-preview.resetViewState',
    'onCustomEditor:pdf-preview-next.preview',
  ]);
  const commandTitles = new Map(
    extension.packageJSON.contributes.commands.map(
      ({ command, title }: { command: string; title: string }) => [
        command,
        title,
      ],
    ),
  );
  assert.strictEqual(
    commandTitles.get('pdf-preview.openSource'),
    'vscode-pdf Next: Open Externally',
  );
  assert.strictEqual(
    commandTitles.get('pdf-preview.resetViewState'),
    'PDF Preview Next: Reset View State',
  );
  assert.strictEqual(
    commandTitles.get('pdf-preview.print'),
    'vscode-pdf Next: Print to System',
  );
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
  assert.doesNotMatch(
    webviewSourceText,
    /executeCommand\(['"]vscode\.openWith['"],\s*this\.resource,\s*['"]default['"]/,
    'External-open action must not use VS Code binary/text fallback editor.',
  );
  assert.match(
    webviewSourceText,
    /async openSource\([^)]*\)\s*{[\s\S]*?await this\.openExternal\(\);[\s\S]*?}/,
    'External-open action must open PDFs externally.',
  );
  assert.match(
    webviewSourceText,
    /case ['"]open-source['"]:[\s\S]*?void this\.openSource\(\);[\s\S]*?break;[\s\S]*?case ['"]open-external['"]:[\s\S]*?void this\.openExternal\(\);[\s\S]*?break;/,
    'Webview open-source and open-external messages must dispatch through separate host methods.',
  );
  assert.match(
    webviewSourceText,
    /function resolvePdfLinkTarget\([\s\S]*?fragment[\s\S]*?vscode\.Uri\.file\(targetPath\)\.with\(\{ fragment, query \}\)/,
    'Inter-PDF links must resolve relative file targets while preserving fragments.',
  );
  assert.match(
    webviewSourceText,
    /<button id="openSource"[^>]*title="Open PDF with system viewer"[^>]*aria-label="Open PDF with system viewer"/,
    'External-open toolbar button must describe the system viewer behavior.',
  );
  assert.match(
    webviewSourceText,
    /<button id="openSource"[^>]*>[\s\S]*?<use href="#icon-external-link"\/>[\s\S]*?<span class="label">External<\/span>/,
    'External-open toolbar button must use the external-link icon and label.',
  );
  assert.doesNotMatch(
    webviewSourceText,
    /<button id="openSource"[^>]*>[\s\S]*?<span class="label">Source<\/span>/,
    'External-open toolbar button should not be labeled Source.',
  );
  assert.match(
    webviewSourceText,
    /<button id="themeToggle"[^>]*title="Switch PDF page mode to Night"[^>]*aria-label="Switch PDF page mode to Night"[^>]*aria-pressed="false"[^>]*>[\s\S]*?<use href="#icon-theme"\/>[\s\S]*?<span class="label">Clear<\/span>/,
    'Theme cycle button must expose a pressed state, next-mode label, and icon.',
  );
  assert.match(
    webviewSourceText,
    /<div class="viewer-region">\s*<div id="viewerContainer" role="main" tabindex="0">/,
    'PDF.js 5 requires the viewer container option to be an absolutely positioned DIV element.',
  );
  assert.doesNotMatch(webviewSourceText, /<main id="viewerContainer"/);

  // Toolbar button contract assertions
  const toolbarButtonIds = [
    'previous',
    'next',
    'zoomOut',
    'zoomIn',
    'findPrevious',
    'findNext',
    'themeToggle',
    'outlineToggle',
    'print',
    'reload',
    'openSource',
  ];
  const iconOnlyButtons = ['zoomOut', 'zoomIn'];
  for (const buttonId of toolbarButtonIds) {
    assert.match(
      webviewSourceText,
      new RegExp(`<button id="${buttonId}"`),
      `Toolbar button ${buttonId} must exist`,
    );
    assert.match(
      webviewSourceText,
      new RegExp(`<button id="${buttonId}"[^>]*aria-label="[^"]+"`),
      `Toolbar button ${buttonId} must have aria-label for accessibility`,
    );
    if (iconOnlyButtons.includes(buttonId)) {
      assert.match(
        webviewSourceText,
        new RegExp(
          `<button id="${buttonId}"[^>]*>[\\s\\S]*?<svg class="icon"[\\s\\S]*?</svg>`,
        ),
        `Toolbar button ${buttonId} must contain svg.icon only`,
      );
    } else {
      assert.match(
        webviewSourceText,
        new RegExp(
          `<button id="${buttonId}"[^>]*>[\\s\\S]*?<svg class="icon"[\\s\\S]*?</svg>[\\s\\S]*?<span class="label">`,
        ),
        `Toolbar button ${buttonId} must contain svg.icon and span.label`,
      );
    }
  }

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

  // Toolbar CSS contract assertions
  assert.doesNotMatch(
    viewerStylesText,
    /#pdf-toolbar[^}]*overflow-x:\s*auto/,
    '#pdf-toolbar should not use overflow-x: auto',
  );
  assert.match(
    viewerStylesText,
    /#pdf-toolbar[^}]*container-type:\s*inline-size/,
    '#pdf-toolbar must use container-type: inline-size for responsive queries',
  );
  assert.match(
    viewerStylesText,
    /button\.is-active\s*{[^}]*background:\s*var\(--vscode-button-secondaryBackground\)/s,
    'Active toolbar buttons must have a visible active state.',
  );
  assert.match(
    viewerStylesText,
    /\.pdfViewer\s*{[^}]*--page-bg-color:\s*#fff/s,
    'Default PDF page background must be defined at viewer level.',
  );
  assert.doesNotMatch(
    viewerStylesText,
    /\.pdfViewer\s+\.page\s*{[^}]*--page-bg-color:\s*#fff/s,
    'Page-level white background must not override night mode during reload.',
  );
  assert.match(
    viewerStylesText,
    /body\.theme-night\s+\.pdfViewer,\s*body\.theme-reader\s+\.pdfViewer,\s*body\.theme-dark-pages\s+\.pdfViewer\s*{[^}]*--page-bg-color:\s*#1b1b1b/s,
    'Night mode must set the PDF page background before PDF.js page shells render.',
  );
  assert.match(
    viewerStylesText,
    /@container\s*\(max-width:\s*720px\)[^{]*{[^}]*\.label[^}]*display:\s*none/,
    '@container query must hide .label at 720px breakpoint',
  );
  assert.match(
    viewerStylesText,
    /\.sidebar-tab\.is-active\s*{[^}]*background:\s*var\(--vscode-list-activeSelectionBackground\)/s,
    'Sidebar panel tabs must expose active selection state.',
  );
  assert.match(
    viewerStylesText,
    /\.thumbnail-list\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/s,
    'Thumbnail panel should stack page thumbnails vertically.',
  );
  assert.match(
    viewerStylesText,
    /\.textLayer\s+\.highlight\s*{[^}]*--highlight-bg-color:\s*rgb\(255 213 74 \/ 0\.95\)/s,
    'Find matches must have a visible highlight color.',
  );
  assert.match(
    viewerStylesText,
    /\.textLayer\s+\.highlight\s*{[^}]*--highlight-selected-bg-color:\s*rgb\(255 128 42 \/ 0\.98\)/s,
    'Selected find match must have a stronger highlight color.',
  );
  assert.doesNotMatch(
    viewerStylesText,
    /\.textLayer\s*{[^}]*opacity:\s*0\.[0-9]+/s,
    'Text layer opacity must not dim find highlights.',
  );
  assert.match(
    viewerStylesText,
    /body\.theme-dark\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-night\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-reader\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-dark-pages\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-inverted\s+\.textLayer\s+\.highlight\.selected\s*{/,
    'Dark, night, reader, dark-pages, and inverted themes must override selected find highlight.',
  );

  const viewerScriptText = await readExtensionFile(
    extension,
    'lib',
    'main.mjs',
  );
  assert.doesNotMatch(
    viewerScriptText,
    /setInterval\(/,
    'Print/page-render waiting should not allocate polling intervals.',
  );
  assert.match(
    viewerScriptText,
    /const VIEW_STATE_PERSIST_DEBOUNCE_MS = 1000;/,
    'View-state persistence should avoid high-frequency storage writes.',
  );
  assert.match(
    viewerScriptText,
    /const FIND_HIGHLIGHT_ALL_MIN_QUERY_LENGTH = 3;/,
    'Find should not highlight every match for very short queries.',
  );
  const zeroPageGuardIndex = viewerScriptText.indexOf(
    'if (pdfDocument.numPages < 1)',
  );
  const setDocumentIndex = viewerScriptText.indexOf(
    'this.linkService.setDocument(pdfDocument',
  );
  assert.ok(
    zeroPageGuardIndex > 0 && zeroPageGuardIndex < setDocumentIndex,
    'Zero-page corrupted PDFs must error before being handed to the viewer.',
  );
  assert.match(
    viewerScriptText,
    /if \(pdfDocument\.numPages < 1\) {\s*await pdfDocument\.destroy\(\);\s*throw new Error\('PDF has no pages\.'\);/s,
    'Broken fixtures should surface a load error without waiting for page render timeout.',
  );
  assert.match(
    viewerScriptText,
    /const FIND_HIGHLIGHT_ALL_MAX_PAGES = 50;/,
    'Find should not highlight all matches across large documents.',
  );
  assert.match(
    viewerScriptText,
    /captureViewState\(\)\s*{[\s\S]*?sidebarPanel: this\.activeSidebarPanel/,
    'View-state persistence must include the active sidebar panel.',
  );
  assert.match(
    viewerScriptText,
    /const THUMBNAIL_MAX_CANVASES = 8;/,
    'Thumbnail rendering must keep a bounded live canvas pool.',
  );
  assert.match(
    viewerScriptText,
    /new IntersectionObserver\([\s\S]*?root: this\.elements\.thumbnailPanel/,
    'Thumbnail rendering should be IntersectionObserver-driven.',
  );
  assert.match(
    viewerScriptText,
    /handleThumbnailKeydown\(event\)\s*{[\s\S]*?event\.key === 'ArrowUp'[\s\S]*?event\.key === 'ArrowDown'[\s\S]*?event\.key === 'Enter'/,
    'Thumbnail keyboard navigation must support up/down and Enter.',
  );
  assert.doesNotMatch(
    viewerScriptText,
    /window\.print\s*\(/,
    'Viewer must not rely on browser print dialog.',
  );
  assert.doesNotMatch(
    viewerScriptText,
    /printDocument\s*\(/,
    'Viewer must not contain legacy printDocument method.',
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
    /const THEME_VALUES = new Set\(\[\s*['"]auto['"],\s*['"]light['"],\s*['"]dark['"],\s*['"]night['"],\s*['"]reader['"],\s*['"]dark-pages['"],\s*['"]inverted['"],\s*\]\)/,
    'Viewer theme contract must recognize night, reader, and dark-pages.',
  );
  assert.match(
    viewerScriptText,
    /function pageColorsForTheme\(theme\)\s*{[\s\S]*?theme !== ['"]night['"] &&\s*theme !== ['"]reader['"] &&\s*theme !== ['"]dark-pages['"][\s\S]*?background: ['"]#1b1b1b['"], foreground: ['"]#d6d1c4['"]/,
    'Night and reader modes must map to concrete PDF.js pageColors.',
  );
  assert.match(
    viewerScriptText,
    /const CYCLE_THEME_VALUES = \[['"]auto['"], ['"]night['"], ['"]reader['"], ['"]inverted['"]\]/,
    'Theme cycle must expose Clear, Night, Reader, and Invert modes.',
  );
  assert.match(
    viewerScriptText,
    /function applyPageColorVariables\(viewer, theme\)\s*{[\s\S]*?viewer\.style\.setProperty\(['"]--page-bg-color['"], pageColors\.background\);[\s\S]*?viewer\.style\.removeProperty\(['"]--page-bg-color['"]\);[\s\S]*?}/,
    'Viewer must apply page background variables before PDF.js finishes loading.',
  );
  assert.match(
    viewerScriptText,
    /pageColors: pageColorsForTheme\(this\.appearance\.theme\)/,
    'PDFViewer must receive pageColors for night mode.',
  );
  assert.match(
    viewerScriptText,
    /cyclePageTheme\(\)\s*{[\s\S]*?this\.pdfViewer\.pageColors = pageColorsForTheme\(this\.appearance\.theme\);[\s\S]*?this\.loadDocument\(\{ restoreView: true, retryOnFailure: true \}\);[\s\S]*?}/,
    'Theme cycle must preserve view state by reloading through the refresh path.',
  );
  assert.match(
    viewerScriptText,
    /vscode\.postMessage\(\{\s*type: ['"]appearance-theme['"],\s*theme: this\.appearance\.theme,\s*}\)/,
    'Theme toggle must persist the night-mode choice for future PDFs.',
  );
  assert.match(
    viewerScriptText,
    /event\.data\?\.type === ['"]reset-view-state['"][\s\S]*?this\.resetViewState\(\)/,
    'Reset view state command must notify the active viewer.',
  );
  assert.match(
    viewerScriptText,
    /resetViewState\(\)\s*{[\s\S]*?clearTimeout\(this\.persistViewStateTimer\);[\s\S]*?this\.config\.initialViewState = null;[\s\S]*?restoreView: false,[\s\S]*?userInitiated: true,/,
    'Active viewer reset must ignore saved startup state and reload from defaults.',
  );
  assert.match(
    viewerScriptText,
    /addEventListener\('DOMContentLoaded', startApp/,
  );

  const providerSourceText = await readExtensionFile(
    extension,
    'out',
    'src',
    'pdfProvider.js',
  );
  assert.match(
    providerSourceText,
    /openSourceForActivePreview\(\)[\s\S]*?preview\.openSource\(\)/,
    'Open Source command should dispatch through PdfPreview.openSource.',
  );
  assert.doesNotMatch(
    providerSourceText,
    /openSourceForActivePreview\(\)[\s\S]*?preview\.openExternal\(\)/,
    'Open Source command should not bypass PdfPreview.openSource.',
  );
  assert.match(
    providerSourceText,
    /printPdf\(/,
    'Print command must dispatch through the host-side print utility.',
  );

  const printSourceText = await readExtensionFile(
    extension,
    'out',
    'src',
    'print.js',
  );
  assert.match(
    printSourceText,
    /spawnAsync\('lp',/,
    'Print utility must try lp first.',
  );
  assert.match(
    printSourceText,
    /openExternal\(resource\)/,
    'Print utility must fall back to system viewer.',
  );
  assert.match(
    printSourceText,
    /\{\{file\}\}/,
    'Print utility must support custom command placeholder substitution.',
  );
  assert.match(
    printSourceText,
    /spawn\(command, args, \{ stdio: ['"]ignore['"] \}\)/,
    'Print utility must execute custom commands without a shell.',
  );

  const webviewContractSourceText = await readExtensionFile(
    extension,
    'out',
    'src',
    'webviewContract.js',
  );
  assert.match(
    webviewContractSourceText,
    /open-pdf-link/,
    'Webview contract must include open-pdf-link message type.',
  );

  const previewSourceText = await readExtensionFile(
    extension,
    'out',
    'src',
    'pdfPreview.js',
  );
  assert.match(
    previewSourceText,
    /openPdfLink\(/,
    'PdfPreview must implement openPdfLink handler.',
  );
  assert.match(
    previewSourceText,
    /case ['"]open-pdf-link['"]:[\s\S]*?void this\.openPdfLink\(/,
    'Webview open-pdf-link message must dispatch through PdfPreview.openPdfLink.',
  );
  assert.match(
    previewSourceText,
    /resetViewState\(\)[\s\S]*?clearPdfPreviewViewState\([\s\S]*?type: ['"]reset-view-state['"][\s\S]*?postMessage\(message\)/,
    'Reset view state must clear storage and tell the active webview to reset immediately.',
  );

  assert.match(
    viewerScriptText,
    /open-pdf-link/,
    'Viewer script must handle open-pdf-link messages.',
  );
  assert.match(
    viewerScriptText,
    /function isRelativePdfHref\(href\)[\s\S]*?split\(['"]#['"], 1\)[\s\S]*?endsWith\(['"]\.pdf['"]\)/,
    'Viewer link interception must preserve PDF fragments before posting open-pdf-link.',
  );
  assert.doesNotMatch(
    viewerScriptText,
    /mozdisallowselectionprint/,
    'Viewer HTML must not contain legacy mozdisallowselectionprint attribute.',
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
    {
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Two,
    },
  );
  const viewerEvent = await waitForViewerEvent(fixtureUri, 20000);
  assert.strictEqual(viewerEvent.type, 'viewer-ready');
  assert.strictEqual(viewerEvent.pagesCount, 1);
  assert.strictEqual(viewerEvent.pageNumber, 1);

  const reloadEvent = await assertFileWatcherReloadDoesNotStealFocus(
    fixtureUri,
    viewerEvent,
  );
  assert.strictEqual(reloadEvent.type, 'viewer-ready');
  assert.strictEqual(reloadEvent.pagesCount, 1);
  assert.strictEqual(reloadEvent.pageNumber, 1);

  return Promise.resolve();
}
