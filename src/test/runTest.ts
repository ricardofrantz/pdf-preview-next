import * as path from 'path';

import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const vscodeVersion = process.env.VSCODE_TEST_VERSION ?? '1.95.0';
    const vscodeExecutablePath = resolveCliPathFromVSCodeExecutablePath(
      await downloadAndUnzipVSCode(vscodeVersion),
    );

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
