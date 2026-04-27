import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';

export class PdfCustomProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'pdf-preview-next.preview';

  private activePreview: PdfPreview | undefined;

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
    if (!this.activePreview) {
      await vscode.window.showInformationMessage(
        'Open a PDF Preview Next tab first.',
      );
      return;
    }

    await this.activePreview.openSource();
  }

  public async refreshActivePreview(): Promise<void> {
    if (!this.activePreview) {
      await vscode.window.showInformationMessage(
        'Open a PDF Preview Next tab first.',
      );
      return;
    }

    this.activePreview.refresh();
  }

  public async printActivePreview(): Promise<void> {
    if (!this.activePreview) {
      await vscode.window.showInformationMessage(
        'Open a PDF Preview Next tab first.',
      );
      return;
    }

    this.activePreview.print();
  }
}
