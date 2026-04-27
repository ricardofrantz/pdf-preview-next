import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './disposable';

function createNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

interface PersistedViewState {
  pageNumber: number;
  scaleValue: string;
  scrollLeft: number;
  scrollTop: number;
}

type WebviewMessage =
  | { type: 'open-source' }
  | { type: 'view-state'; state: PersistedViewState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key))
  );
}

function isPersistedViewState(value: unknown): value is PersistedViewState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'pageNumber',
      'scaleValue',
      'scrollLeft',
      'scrollTop',
    ])
  ) {
    return false;
  }

  return (
    typeof value.pageNumber === 'number' &&
    Number.isInteger(value.pageNumber) &&
    value.pageNumber > 0 &&
    typeof value.scaleValue === 'string' &&
    typeof value.scrollLeft === 'number' &&
    Number.isFinite(value.scrollLeft) &&
    typeof value.scrollTop === 'number' &&
    Number.isFinite(value.scrollTop)
  );
}

function getWebviewMessage(message: unknown): WebviewMessage | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  if (hasExactKeys(message, ['type']) && message.type === 'open-source') {
    return { type: 'open-source' };
  }

  if (
    hasExactKeys(message, ['type', 'state']) &&
    message.type === 'view-state' &&
    isPersistedViewState(message.state)
  ) {
    return { type: 'view-state', state: message.state };
  }

  return undefined;
}

function viewStateKey(resource: vscode.Uri): string {
  return `pdf-preview-next.view-state:${resource.with({ fragment: '' }).toString()}`;
}

function persistedViewStateOrUndefined(
  value: unknown,
): PersistedViewState | undefined {
  return isPersistedViewState(value) ? value : undefined;
}

const PDF_VIEWER_BODY = `<body>
  <div id="pdf-root">
    <header id="pdf-toolbar" role="toolbar" aria-label="PDF controls">
      <div class="toolbar-group">
        <button id="previous" type="button" title="Previous page">Prev</button>
        <button id="next" type="button" title="Next page">Next</button>
        <input id="pageNumber" type="number" min="1" value="1" title="Page">
        <span id="numPages">of 0</span>
      </div>
      <div class="toolbar-group">
        <button id="zoomOut" type="button" title="Zoom out">-</button>
        <select id="scaleSelect" title="Zoom">
          <option value="auto">Auto</option>
          <option value="page-actual">Actual</option>
          <option value="page-fit">Fit</option>
          <option value="page-width">Width</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
          <option value="3">300%</option>
          <option value="4">400%</option>
        </select>
        <button id="zoomIn" type="button" title="Zoom in">+</button>
      </div>
      <div class="toolbar-group toolbar-find">
        <input id="findInput" type="search" placeholder="Find" title="Find in document">
        <button id="findPrevious" type="button" title="Previous match">Prev</button>
        <button id="findNext" type="button" title="Next match">Next</button>
        <span id="findStatus"></span>
      </div>
      <div class="toolbar-group toolbar-spacer"></div>
      <div class="toolbar-group">
        <button id="outlineToggle" type="button" title="Toggle document outline" disabled>Outline</button>
        <button id="reload" type="button" title="Reload PDF">Reload</button>
        <button id="openSource" type="button" title="Open raw PDF source with VS Code's default editor">Source</button>
      </div>
      <span id="status" role="status"></span>
    </header>
    <div id="pdf-content">
      <aside id="outlineSidebar" class="outline-sidebar hidden" aria-label="Document outline">
        <div class="outline-header">Outline</div>
        <div id="outlineTree" class="outline-tree"></div>
      </aside>
      <main id="viewerContainer" tabindex="0">
        <div id="viewer" class="pdfViewer"></div>
      </main>
    </div>
    <div id="passwordOverlay" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="passwordTitle">
      <form id="passwordForm" class="password-panel">
        <h1 id="passwordTitle">Password required</h1>
        <p id="passwordMessage">Enter the password to open this PDF.</p>
        <input id="passwordInput" type="password" autocomplete="current-password">
        <div class="password-actions">
          <button id="passwordCancel" type="button">Cancel</button>
          <button type="submit">Open</button>
        </div>
      </form>
    </div>
  </div>
</body>`;

export class PdfPreview extends Disposable {
  constructor(
    private readonly extensionRoot: vscode.Uri,
    private readonly resource: vscode.Uri,
    private readonly webviewEditor: vscode.WebviewPanel,
    private readonly workspaceState: vscode.Memento,
  ) {
    super();
    const documentRoot = vscode.Uri.joinPath(resource, '..');
    const config = vscode.workspace.getConfiguration('pdf-preview');
    const closeOnDelete = config.get<boolean>('reload.closeOnDelete', false);

    webviewEditor.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionRoot, documentRoot],
    };

    this._register(
      webviewEditor.webview.onDidReceiveMessage((message: unknown) => {
        const parsedMessage = getWebviewMessage(message);
        if (!parsedMessage) {
          return;
        }

        if (parsedMessage.type === 'open-source') {
          void this.openSource();
        } else {
          void this.workspaceState.update(
            viewStateKey(this.resource),
            parsedMessage.state,
          );
        }
      }),
    );

    const watcher = this._register(
      vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          vscode.Uri.joinPath(resource, '..'),
          path.basename(resource.fsPath),
        ),
      ),
    );
    this._register(
      watcher.onDidChange(() => {
        this.reload();
      }),
    );
    this._register(
      watcher.onDidCreate(() => {
        this.reload();
      }),
    );
    this._register(
      watcher.onDidDelete(() => {
        if (closeOnDelete) {
          this.webviewEditor.dispose();
          return;
        }

        void this.webviewEditor.webview.postMessage({ type: 'file-deleted' });
      }),
    );

    this.webviewEditor.webview.html = this.getWebviewContents();
  }

  public async openSource(
    viewColumn: vscode.ViewColumn | undefined = this.webviewEditor.viewColumn,
  ): Promise<void> {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      this.resource,
      'default',
      viewColumn,
    );
  }

  private reload(): void {
    if (!this.isDisposed) {
      this.webviewEditor.webview.postMessage({ type: 'reload' });
    }
  }

  private getWebviewContents(): string {
    const webview = this.webviewEditor.webview;
    const docPath = webview.asWebviewUri(this.resource);
    const cspSource = webview.cspSource;
    const nonce = createNonce();

    const resolve = (...parts: string[]): string =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts))
        .toString();
    const resolveDir = (...parts: string[]): string => `${resolve(...parts)}/`;

    const pdfjsDir = ['lib', 'pdfjs'];
    const buildDir = [...pdfjsDir, 'build'];

    const config = vscode.workspace.getConfiguration('pdf-preview');
    const settings = {
      cMapUrl: resolveDir(...pdfjsDir, 'cmaps'),
      iccUrl: resolveDir(...pdfjsDir, 'iccs'),
      imageResourcesPath: resolveDir(...pdfjsDir, 'web', 'images'),
      hash: this.resource.fragment,
      path: docPath.toString(),
      standardFontDataUrl: resolveDir(...pdfjsDir, 'standard_fonts'),
      wasmUrl: resolveDir(...pdfjsDir, 'wasm'),
      workerSrc: resolve(...buildDir, 'pdf.worker.min.mjs'),
      defaults: {
        cursor: config.get<string>('default.cursor'),
        scale: config.get<string>('default.scale'),
        sidebar: config.get<boolean>('default.sidebar'),
        scrollMode: config.get<string>('default.scrollMode'),
        spreadMode: config.get<string>('default.spreadMode'),
      },
      appearance: {
        pageGap: config.get<string>('appearance.pageGap'),
        theme: config.get<string>('appearance.theme'),
      },
      initialViewState: persistedViewStateOrUndefined(
        this.workspaceState.get(viewStateKey(this.resource)),
      ),
    };

    const csp = [
      "default-src 'none'",
      `connect-src ${cspSource}`,
      `font-src ${cspSource}`,
      `img-src blob: data: ${cspSource}`,
      `script-src 'nonce-${nonce}' ${cspSource}`,
      `style-src ${cspSource}`,
      `worker-src ${cspSource} blob:`,
    ].join('; ');

    const head = `<!DOCTYPE html>
<html dir="ltr" mozdisallowselectionprint>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="google" content="notranslate">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta id="pdf-preview-config" data-config="${JSON.stringify(settings).replace(/"/g, '&quot;')}">
<title>PDF Preview Next</title>
<link rel="stylesheet" href="${resolve(...pdfjsDir, 'web', 'pdf_viewer.css')}">
<link rel="stylesheet" href="${resolve('lib', 'pdf.css')}">
<script nonce="${nonce}" type="module" src="${resolve('lib', 'main.mjs')}"></script>
</head>`;

    return head + PDF_VIEWER_BODY + '</html>';
  }
}
