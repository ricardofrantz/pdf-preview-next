import * as assert from 'assert';
import * as vscode from 'vscode';

export function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    ({ packageJSON }) => packageJSON.name === 'pdf-preview-next',
  );
  assert.ok(extension, 'PDF Preview Next extension should be registered.');

  const sidebarDefault = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<boolean>('default.sidebar');
  assert.strictEqual(sidebarDefault, false);

  const closeOnDelete = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<boolean>('reload.closeOnDelete');
  assert.strictEqual(closeOnDelete, false);

  const theme = vscode.workspace
    .getConfiguration('pdf-preview')
    .get<string>('appearance.theme');
  assert.strictEqual(theme, 'auto');

  return Promise.resolve();
}
