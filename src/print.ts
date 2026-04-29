import { spawn } from 'child_process';
import * as vscode from 'vscode';

export interface ParsedPrintCommand {
  command: string;
  args: string[];
}

function spawnAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
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

export async function printPdf(resource: vscode.Uri): Promise<void> {
  const filePath = resource.fsPath;
  const config = vscode.workspace.getConfiguration('pdf-preview');
  const customCommand = (config.get<string>('printCommand') ?? '').trim();

  if (customCommand) {
    const parsed = parsePrintCommand(customCommand, filePath);
    if (!parsed) {
      await vscode.window.showWarningMessage(
        'Custom print command is invalid. Opening in system viewer.',
      );
      await vscode.env.openExternal(resource);
      return;
    }

    try {
      await spawnAsync(parsed.command, parsed.args);
      await vscode.window.showInformationMessage('Sent to printer.');
      return;
    } catch {
      await vscode.window.showWarningMessage(
        'Custom print command failed. Opening in system viewer.',
      );
      await vscode.env.openExternal(resource);
      return;
    }
  }

  try {
    await spawnAsync('lp', [filePath]);
    await vscode.window.showInformationMessage('Sent to default printer.');
  } catch {
    await vscode.window.showInformationMessage(
      'Opening PDF in system viewer for printing.',
    );
    await vscode.env.openExternal(resource);
  }
}
