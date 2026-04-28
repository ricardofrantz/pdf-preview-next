import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './disposable';
import {
  parseViewerToHostMessage,
  persistedViewStateOrUndefined,
  viewStateKey,
  type HostToViewerMessage,
  type ViewerEvent,
} from './webviewContract';

function createNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

const DEFAULT_RELOAD_DEBOUNCE_MS = 800;

function getReloadDebounceMs(): number {
  const value = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<number>('reload.debounceMs', DEFAULT_RELOAD_DEBOUNCE_MS);
  if (!Number.isFinite(value)) {
    return DEFAULT_RELOAD_DEBOUNCE_MS;
  }
  return Math.min(Math.max(Math.trunc(value), 0), 10_000);
}

const PDF_VIEWER_BODY = `<body>
  <svg style="display: none;">
    <symbol id="icon-chevron-left" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-chevron-right" viewBox="0 0 16 16" fill="none">
      <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-zoom-out" viewBox="0 0 16 16" fill="none">
      <path d="M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </symbol>
    <symbol id="icon-zoom-in" viewBox="0 0 16 16" fill="none">
      <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </symbol>
    <symbol id="icon-search" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.33"/>
      <path d="M10 10L13 13" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/>
    </symbol>
    <symbol id="icon-chevron-up" viewBox="0 0 16 16" fill="none">
      <path d="M4 10L8 6L12 10" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-chevron-down" viewBox="0 0 16 16" fill="none">
      <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-list-tree" viewBox="0 0 16 16" fill="none">
      <path d="M3 3H13M3 8H13M3 13H13" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/>
      <circle cx="1" cy="3" r="1" fill="currentColor"/>
      <circle cx="1" cy="8" r="1" fill="currentColor"/>
      <circle cx="1" cy="13" r="1" fill="currentColor"/>
    </symbol>
    <symbol id="icon-printer" viewBox="0 0 16 16" fill="none">
      <path d="M3 6H13C13.55 6 14 6.45 14 7V11C14 11.55 13.55 12 13 12H3C2.45 12 2 11.55 2 11V7C2 6.45 2.45 6 3 6Z" stroke="currentColor" stroke-width="1.33"/>
      <path d="M4 6V4C4 3.45 4.45 3 5 3H11C11.55 3 12 3.45 12 4V6" stroke="currentColor" stroke-width="1.33"/>
      <path d="M4 12V14C4 14.55 4.45 15 5 15H11C11.55 15 12 14.55 12 14V12" stroke="currentColor" stroke-width="1.33"/>
    </symbol>
    <symbol id="icon-refresh" viewBox="0 0 16 16" fill="none">
      <path d="M13 8A5 5 0 1 0 8 13" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/>
      <path d="M13 8V5M13 8H10" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-external-link" viewBox="0 0 16 16" fill="none">
      <path d="M6 4H4C3.45 4 3 4.45 3 5V12C3 12.55 3.45 13 4 13H11C11.55 13 12 12.55 12 12V10" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/>
      <path d="M9 3H13V7" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 8L13 3" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/>
    </symbol>
    <symbol id="icon-theme" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" stroke-width="1.33"/>
      <path d="M8 3.5A4.5 4.5 0 0 0 8 12.5V3.5Z" fill="currentColor"/>
    </symbol>
  </svg>
  <div id="pdf-root">
    <header id="pdf-toolbar" role="toolbar" aria-label="PDF controls">
      <div class="toolbar-group">
        <button id="previous" class="icon-button" type="button" title="Previous page" aria-label="Previous page">
          <svg class="icon" width="16" height="16"><use href="#icon-chevron-left"/></svg>
          <span class="label">Prev</span>
        </button>
        <button id="next" class="icon-button" type="button" title="Next page" aria-label="Next page">
          <svg class="icon" width="16" height="16"><use href="#icon-chevron-right"/></svg>
          <span class="label">Next</span>
        </button>
        <input id="pageNumber" type="number" min="1" value="1" title="Page" aria-label="Page number">
        <span id="numPages">of 0</span>
      </div>
      <div class="toolbar-group">
        <button id="zoomOut" class="icon-button" type="button" title="Zoom out" aria-label="Zoom out">
          <svg class="icon" width="16" height="16"><use href="#icon-zoom-out"/></svg>
        </button>
        <select id="scaleSelect" title="Zoom" aria-label="Zoom">
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
        <button id="zoomIn" class="icon-button" type="button" title="Zoom in" aria-label="Zoom in">
          <svg class="icon" width="16" height="16"><use href="#icon-zoom-in"/></svg>
        </button>
      </div>
      <div class="toolbar-group toolbar-find">
        <input id="findInput" type="search" placeholder="Find" title="Find in document" aria-label="Find in document">
        <button id="findPrevious" class="icon-button" type="button" title="Previous match" aria-label="Previous match">
          <svg class="icon" width="16" height="16"><use href="#icon-chevron-up"/></svg>
          <span class="label">Prev</span>
        </button>
        <button id="findNext" class="icon-button" type="button" title="Next match" aria-label="Next match">
          <svg class="icon" width="16" height="16"><use href="#icon-chevron-down"/></svg>
          <span class="label">Next</span>
        </button>
        <span id="findStatus" aria-live="polite"></span>
      </div>
      <div class="toolbar-group toolbar-spacer"></div>
      <div class="toolbar-group">
        <button id="themeToggle" class="icon-button" type="button" title="Switch PDF page mode to Night" aria-label="Switch PDF page mode to Night" aria-pressed="false">
          <svg class="icon" width="16" height="16"><use href="#icon-theme"/></svg>
          <span class="label">Clear</span>
        </button>
        <button id="outlineToggle" class="icon-button" type="button" title="Toggle document outline" aria-label="Toggle document outline" disabled>
          <svg class="icon" width="16" height="16"><use href="#icon-list-tree"/></svg>
          <span class="label">Outline</span>
        </button>
        <button id="print" class="icon-button" type="button" title="Print PDF" aria-label="Print PDF">
          <svg class="icon" width="16" height="16"><use href="#icon-printer"/></svg>
          <span class="label">Print</span>
        </button>
        <button id="reload" class="icon-button" type="button" title="Refresh PDF" aria-label="Refresh PDF">
          <svg class="icon" width="16" height="16"><use href="#icon-refresh"/></svg>
          <span class="label">Refresh</span>
        </button>
        <button id="openSource" class="icon-button" type="button" title="Open PDF with system viewer" aria-label="Open PDF with system viewer">
          <svg class="icon" width="16" height="16"><use href="#icon-external-link"/></svg>
          <span class="label">External</span>
        </button>
      </div>
      <span id="status" role="status" aria-live="polite"></span>
    </header>
    <div id="pdf-content">
      <aside id="outlineSidebar" class="outline-sidebar hidden" aria-label="Document outline">
        <div class="outline-header">Outline</div>
        <div id="outlineTree" class="outline-tree"></div>
      </aside>
      <div class="viewer-region">
        <div id="viewerContainer" role="main" tabindex="0">
          <div id="viewer" class="pdfViewer"></div>
        </div>
      </div>
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
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly extensionRoot: vscode.Uri,
    private readonly resource: vscode.Uri,
    private readonly webviewEditor: vscode.WebviewPanel,
    private readonly workspaceState: vscode.Memento,
    private readonly onViewerEvent: (event: ViewerEvent) => void = () => {},
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
        const parsedMessage = parseViewerToHostMessage(message);
        if (!parsedMessage) {
          return;
        }

        if (parsedMessage.type === 'open-source') {
          void this.openSource();
        } else if (parsedMessage.type === 'open-external') {
          void this.openExternal();
        } else if (parsedMessage.type === 'appearance-theme') {
          void vscode.workspace
            .getConfiguration('pdf-preview')
            .update(
              'appearance.theme',
              parsedMessage.theme,
              vscode.ConfigurationTarget.Global,
            );
        } else if (parsedMessage.type === 'viewer-ready') {
          this.onViewerEvent({
            ...parsedMessage,
            resource: this.resource.toString(),
          });
        } else if (parsedMessage.type === 'viewer-error') {
          this.onViewerEvent({
            ...parsedMessage,
            resource: this.resource.toString(),
          });
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
        this.scheduleReload();
      }),
    );
    this._register(
      watcher.onDidCreate(() => {
        this.scheduleReload();
      }),
    );
    this._register(
      watcher.onDidDelete(() => {
        this.clearReloadTimer();
        if (closeOnDelete) {
          this.webviewEditor.dispose();
          return;
        }

        const webviewMessage: HostToViewerMessage = { type: 'file-deleted' };
        void this.webviewEditor.webview.postMessage(webviewMessage);
      }),
    );
    this._register({ dispose: () => this.clearReloadTimer() });

    this.webviewEditor.webview.html = this.getWebviewContents();
  }

  public async openSource(): Promise<void> {
    await this.openExternal();
  }

  public async openExternal(): Promise<void> {
    await vscode.env.openExternal(this.resource);
  }

  public refresh(): void {
    if (!this.isDisposed) {
      const message: HostToViewerMessage = { type: 'reload' };
      this.webviewEditor.webview.postMessage(message);
    }
  }

  public print(): void {
    if (!this.isDisposed) {
      const message: HostToViewerMessage = { type: 'print' };
      this.webviewEditor.webview.postMessage(message);
    }
  }

  private scheduleReload(): void {
    this.clearReloadTimer();
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      this.refresh();
    }, getReloadDebounceMs());
  }

  private clearReloadTimer(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
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
      reload: {
        debounceMs: getReloadDebounceMs(),
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
      `style-src 'unsafe-inline' ${cspSource}`,
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
<script nonce="${nonce}">
(() => {
  let startupError = '';
  const applyStartupError = () => {
    if (!startupError) {
      return;
    }
    const status = document.getElementById('status');
    if (!status) {
      return;
    }
    status.textContent = startupError;
    status.title = startupError;
    status.classList.add('is-visible');
  };
  const messageFromReason = (reason) =>
    reason && typeof reason === 'object' && 'message' in reason
      ? reason.message
      : String(reason);
  const showStartupError = (reason) => {
    startupError = 'Could not start PDF viewer: ' + messageFromReason(reason);
    applyStartupError();
    console.error('PDF Preview: startup error', reason);
  };
  window.addEventListener('error', (event) => {
    showStartupError(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    showStartupError(event.reason);
  });
  window.addEventListener('DOMContentLoaded', applyStartupError, { once: true });
})();
</script>
<script nonce="${nonce}" type="module" src="${resolve('lib', 'main.mjs')}"></script>
</head>`;

    return head + PDF_VIEWER_BODY + '</html>';
  }
}
