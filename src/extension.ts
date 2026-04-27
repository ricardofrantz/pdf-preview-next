import * as vscode from 'vscode';
import { PdfCustomProvider } from './pdfProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PdfCustomProvider(
    context.extensionUri,
    context.workspaceState,
  );
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PdfCustomProvider.viewType,
      provider,
      {
        webviewOptions: {
          enableFindWidget: false, // default
          retainContextWhenHidden: true,
        },
      },
    ),
    vscode.commands.registerCommand(
      'pdf-preview.openPreview',
      async (uri?: vscode.Uri) => {
        let target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { PDF: ['pdf'] },
          });
          target = picked?.[0];
        }
        if (!target) {
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          PdfCustomProvider.viewType,
        );
      },
    ),
    vscode.commands.registerCommand('pdf-preview.openSource', async () => {
      await provider.openSourceForActivePreview();
    }),
  );
}

export function deactivate(): void {}
