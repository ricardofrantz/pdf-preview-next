import { spawn } from 'child_process';
import * as vscode from 'vscode';

export interface ParsedPrintCommand {
  command: string;
  args: string[];
}

interface CommandOutput {
  stdout: string;
  stderr: string;
}

const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_OUTPUT_LIMIT_BYTES = 64 * 1024;

function commandLineForDisplay(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(' ');
}

function usefulCommandOutput(output: CommandOutput): string {
  return (output.stderr || output.stdout).trim();
}

function appendCapped(
  existing: Buffer<ArrayBufferLike>,
  chunk: Buffer,
  limitBytes = COMMAND_OUTPUT_LIMIT_BYTES,
): Buffer<ArrayBufferLike> {
  if (existing.length === 0) {
    return chunk.length <= limitBytes
      ? chunk
      : chunk.subarray(chunk.length - limitBytes);
  }
  const combined = Buffer.concat(
    [existing, chunk],
    existing.length + chunk.length,
  );
  return combined.length <= limitBytes
    ? combined
    : combined.subarray(combined.length - limitBytes);
}

function commandError(
  command: string,
  args: string[],
  message: string,
  output: CommandOutput,
): Error {
  const details = usefulCommandOutput(output);
  const commandLine = commandLineForDisplay(command, args);
  return new Error(
    details ? `${commandLine}: ${details}` : `${commandLine}: ${message}`,
  );
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let settled = false;
    const timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            child.kill('SIGKILL');
            reject(
              commandError(
                command,
                args,
                `Command timed out after ${timeoutMs}ms`,
                {
                  stdout: stdout.toString('utf8'),
                  stderr: stderr.toString('utf8'),
                },
              ),
            );
          }, timeoutMs)
        : undefined;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk);
    });
    child.on('error', (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      settled = true;
      reject(
        commandError(command, args, error.message, {
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
        }),
      );
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        resolve({
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
        });
        return;
      }
      reject(
        commandError(command, args, `Command exited with code ${code}`, {
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
        }),
      );
    });
  });
}

function tokenizeCommandLine(commandLine: string): string[] | undefined {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let tokenStarted = false;

  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index]!;

    if (quote) {
      if (char === quote) {
        quote = undefined;
        tokenStarted = true;
        continue;
      }

      if (quote === '"' && char === '\\' && index + 1 < commandLine.length) {
        index += 1;
        current += commandLine[index]!;
        tokenStarted = true;
        continue;
      }

      current += char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (char === '\\' && index + 1 < commandLine.length) {
      index += 1;
      current += commandLine[index]!;
      tokenStarted = true;
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (quote) {
    return undefined;
  }
  if (tokenStarted) {
    tokens.push(current);
  }

  return tokens;
}

export function parsePrintCommand(
  commandLine: string,
  filePath: string,
): ParsedPrintCommand | undefined {
  const tokens = tokenizeCommandLine(commandLine);
  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  let sawFilePlaceholder = false;
  const expanded = tokens.map((token) => {
    if (!token.includes('{{file}}')) {
      return token;
    }
    sawFilePlaceholder = true;
    return token.replace(/\{\{file\}\}/g, filePath);
  });

  if (!sawFilePlaceholder) {
    expanded.push(filePath);
  }

  const command = expanded[0];
  if (!command) {
    return undefined;
  }

  return { command, args: expanded.slice(1) };
}

export function printCommandForResource(resource: vscode.Uri): string {
  const config = vscode.workspace.getConfiguration('pdf-preview', resource);
  if (vscode.workspace.isTrusted) {
    return (config.get<string>('printCommand') ?? '').trim();
  }

  const inspected = config.inspect<string>('printCommand');
  return (inspected?.globalValue ?? inspected?.defaultValue ?? '').trim();
}

async function openWithPreview(resource: vscode.Uri): Promise<boolean> {
  if (resource.scheme !== 'file' || process.platform !== 'darwin') {
    return false;
  }

  await runCommand('open', ['-a', 'Preview', resource.fsPath]);
  return true;
}

async function openInSystemViewer(resource: vscode.Uri): Promise<boolean> {
  const openTarget =
    resource.scheme === 'file'
      ? vscode.Uri.file(resource.fsPath)
      : resource.with({ fragment: '', query: '' });
  try {
    if (await openWithPreview(openTarget)) {
      await vscode.window.showInformationMessage(
        "Opened PDF in Preview. Use Preview's Print command to choose printer options.",
      );
      return true;
    }
  } catch (error) {
    await vscode.window.showWarningMessage(
      `Could not open PDF in Preview: ${error instanceof Error ? error.message : String(error)}. Trying the default system viewer.`,
    );
  }

  try {
    const opened = await vscode.env.openExternal(openTarget);
    if (opened) {
      await vscode.window.showInformationMessage(
        "Opened PDF in the system viewer. Use that app's Print command to choose printer options.",
      );
    }
    return opened;
  } catch (error) {
    await vscode.window.showWarningMessage(
      `Could not open the PDF in the system viewer: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  return false;
}

async function defaultCupsPrinter(): Promise<string | undefined> {
  try {
    const output = await runCommand('lpstat', ['-d']);
    const text = (output.stdout.trim() || output.stderr.trim()).trim();
    const match = text.match(/system default destination:\s*(.+)$/i);
    const value = match?.[1]?.trim();
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function printPdf(resource: vscode.Uri): Promise<void> {
  const opened = await openInSystemViewer(resource);
  if (!opened) {
    await vscode.window.showWarningMessage(
      'Could not open the PDF in a system viewer. Configure pdf-preview.printCommand and run Print Directly if you need a custom print path.',
    );
  }
}

export async function printPdfDirect(resource: vscode.Uri): Promise<void> {
  if (resource.scheme !== 'file') {
    await vscode.window.showWarningMessage(
      'Direct printing only supports local file PDFs. Opening the PDF in a system viewer instead.',
    );
    await printPdf(resource);
    return;
  }

  const filePath = resource.fsPath;
  const customCommand = printCommandForResource(resource);

  if (customCommand) {
    const parsed = parsePrintCommand(customCommand, filePath);
    if (!parsed) {
      await vscode.window.showWarningMessage(
        'Custom print command is invalid. Opening the PDF in a system viewer instead.',
      );
      await printPdf(resource);
      return;
    }

    try {
      const output = await runCommand(parsed.command, parsed.args);
      const details = usefulCommandOutput(output);
      await vscode.window.showInformationMessage(
        details
          ? `Print command completed: ${details}`
          : 'Print command completed.',
      );
      return;
    } catch (error) {
      await vscode.window.showWarningMessage(
        `Custom print command failed: ${error instanceof Error ? error.message : String(error)}. Opening the PDF in a system viewer instead.`,
      );
      await printPdf(resource);
      return;
    }
  }

  if (process.platform === 'win32') {
    await vscode.window.showWarningMessage(
      'Direct printing without pdf-preview.printCommand is not supported on Windows. Opening the PDF in a system viewer instead.',
    );
    await printPdf(resource);
    return;
  }

  const defaultPrinter = await defaultCupsPrinter();
  if (!defaultPrinter) {
    await vscode.window.showWarningMessage(
      'No default CUPS printer was reported by lpstat -d. Opening the PDF in a system viewer instead.',
    );
    await printPdf(resource);
    return;
  }

  try {
    const output = await runCommand('lp', [filePath]);
    const details = usefulCommandOutput(output);
    await vscode.window.showInformationMessage(
      details
        ? `Submitted PDF to printer: ${details}`
        : `Submitted PDF to printer (${defaultPrinter}).`,
    );
  } catch (error) {
    await vscode.window.showWarningMessage(
      `Direct print failed: ${error instanceof Error ? error.message : String(error)}. Opening the PDF in a system viewer instead.`,
    );
    await printPdf(resource);
  }
}
