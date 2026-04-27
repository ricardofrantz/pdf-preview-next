import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './disposable';

function createNonce(): string {
  return crypto.randomBytes(16).toString('base64');
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
        <button id="reload" type="button" title="Reload PDF">Reload</button>
        <button id="openText" type="button" title="Open with VS Code's default text editor">Text</button>
      </div>
      <span id="status" role="status"></span>
    </header>
    <main id="viewerContainer" tabindex="0">
      <div id="viewer" class="pdfViewer"></div>
    </main>
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
  ) {
    super();
    const documentRoot = vscode.Uri.joinPath(resource, '..');

    webviewEditor.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionRoot, documentRoot],
    };

    this._register(
      webviewEditor.webview.onDidReceiveMessage((message: unknown) => {
        if (
          !message ||
          typeof message !== 'object' ||
          (message as { type?: unknown }).type !== 'reopen-as-text'
        ) {
          return;
        }
        vscode.commands.executeCommand(
          'vscode.openWith',
          resource,
          'default',
          webviewEditor.viewColumn,
        );
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
      watcher.onDidDelete(() => {
        this.webviewEditor.dispose();
      }),
    );

    this.webviewEditor.webview.html = this.getWebviewContents();
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
    const resolveAsUri = (...p: string[]): vscode.Uri => {
      return webview.asWebviewUri(
        vscode.Uri.joinPath(this.extensionRoot, ...p),
      );
    };
    const resolveDirectoryAsUri = (...p: string[]): string => {
      return `${resolveAsUri(...p).toString()}/`;
    };

    const config = vscode.workspace.getConfiguration('pdf-preview');
    const settings = {
      cMapUrl: resolveDirectoryAsUri('lib', 'pdfjs', 'cmaps'),
      iccUrl: resolveDirectoryAsUri('lib', 'pdfjs', 'iccs'),
      imageResourcesPath: resolveDirectoryAsUri(
        'lib',
        'pdfjs',
        'web',
        'images',
      ),
      path: docPath.toString(),
      sandboxBundleSrc: resolveAsUri(
        'lib',
        'pdfjs',
        'build',
        'pdf.sandbox.min.mjs',
      ).toString(),
      standardFontDataUrl: resolveDirectoryAsUri(
        'lib',
        'pdfjs',
        'standard_fonts',
      ),
      wasmUrl: resolveDirectoryAsUri('lib', 'pdfjs', 'wasm'),
      workerSrc: resolveAsUri(
        'lib',
        'pdfjs',
        'build',
        'pdf.worker.min.mjs',
      ).toString(),
      defaults: {
        cursor: config.get<string>('default.cursor'),
        scale: config.get<string>('default.scale'),
        sidebar: config.get<boolean>('default.sidebar'),
        scrollMode: config.get<string>('default.scrollMode'),
        spreadMode: config.get<string>('default.spreadMode'),
      },
    };
    const csp = [
      "default-src 'none'",
      `connect-src ${cspSource}`,
      `font-src ${cspSource}`,
      `img-src blob: data: ${cspSource}`,
      `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}`,
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
<link rel="stylesheet" href="${resolveAsUri('lib', 'pdfjs', 'web', 'pdf_viewer.css')}">
<link rel="stylesheet" href="${resolveAsUri('lib', 'pdf.css')}">
<script nonce="${nonce}" type="module" src="${resolveAsUri('lib', 'main.mjs')}"></script>
</head>`;

    return head + PDF_VIEWER_BODY + '</html>';
  }
}
