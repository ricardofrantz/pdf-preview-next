import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';
import { printPdf } from './print';
import type { ViewerEvent } from './webviewContract';

export type RecordedViewerEvent = ViewerEvent & { receivedAt: number };

export class PdfCustomProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'pdf-preview-next.preview';

  private activePreview: PdfPreview | undefined;
  private lastViewerEvent: RecordedViewerEvent | undefined;
  private readonly viewerEventEmitter =
    new vscode.EventEmitter<RecordedViewerEvent>();

  constructor(
    private readonly extensionRoot: vscode.Uri,
    private readonly workspaceState: vscode.Memento,
  ) {}

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: (): void => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewEditor: vscode.WebviewPanel,
  ): Promise<void> {
    const preview = new PdfPreview(
      this.extensionRoot,
      document.uri,
      webviewEditor,
      this.workspaceState,
      (event) => {
        this.recordViewerEvent(event);
      },
    );
    const updateActivePreview = (): void => {
      if (webviewEditor.active) {
        this.activePreview = preview;
      }
    };

    updateActivePreview();
    const viewStateSubscription =
      webviewEditor.onDidChangeViewState(updateActivePreview);
    webviewEditor.onDidDispose(() => {
      viewStateSubscription.dispose();
      if (this.activePreview === preview) {
        this.activePreview = undefined;
      }
      preview.dispose();
    });
  }

  public async openSourceForActivePreview(): Promise<void> {
    await this.withActivePreview((preview) => preview.openSource());
  }

  public async refreshActivePreview(): Promise<void> {
    await this.withActivePreview((preview) => preview.refresh());
  }

  public async printActivePreview(): Promise<void> {
    if (!this.activePreview) {
      await vscode.window.showInformationMessage(
        'Open a PDF Preview Next tab first.',
      );
      return;
    }
    await printPdf(this.activePreview.resourceUri);
  }

  public async resetViewStateForActivePreview(): Promise<void> {
    await this.withActivePreview(async (preview) => {
      await preview.resetViewState();
      await vscode.window.showInformationMessage(
        'Reset view state for the current PDF.',
      );
    });
  }

  public waitForViewerEvent(
    resource: string,
    timeoutMs = 15000,
  ): Promise<RecordedViewerEvent> {
    if (this.lastViewerEvent?.resource === resource) {
      return Promise.resolve(this.lastViewerEvent);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.dispose();
        reject(
          new Error(`Timed out waiting for PDF preview event: ${resource}`),
        );
      }, timeoutMs);

      const subscription = this.viewerEventEmitter.event((event) => {
        if (event.resource !== resource) {
          return;
        }

        clearTimeout(timeout);
        subscription.dispose();
        resolve(event);
      });
    });
  }

  private async withActivePreview(
    fn: (preview: PdfPreview) => Promise<void> | void,
  ): Promise<void> {
    if (!this.activePreview) {
      await vscode.window.showInformationMessage(
        'Open a PDF Preview Next tab first.',
      );
      return;
    }

    await fn(this.activePreview);
  }

  private recordViewerEvent(event: ViewerEvent): void {
    const recorded = { ...event, receivedAt: Date.now() };
    this.lastViewerEvent = recorded;
    this.viewerEventEmitter.fire(recorded);
  }
}
