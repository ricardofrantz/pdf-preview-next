import * as vscode from 'vscode';

export interface PersistedViewState {
  pageNumber: number;
  scaleValue: string;
  scrollLeft: number;
  scrollTop: number;
  outlineVisible?: boolean;
}

export type ViewerToHostMessage =
  | {
      type: 'appearance-theme';
      theme:
        | 'auto'
        | 'light'
        | 'dark'
        | 'night'
        | 'reader'
        | 'dark-pages'
        | 'inverted';
    }
  | { type: 'open-external' }
  | { type: 'open-source' }
  | { type: 'view-state'; state: PersistedViewState }
  | { type: 'viewer-ready'; pagesCount: number; pageNumber: number }
  | { type: 'viewer-error'; message: string };

export type HostToViewerMessage =
  | { type: 'file-deleted' }
  | { type: 'print' }
  | { type: 'reload' };

export type ViewerEvent =
  | {
      type: 'viewer-ready';
      resource: string;
      pagesCount: number;
      pageNumber: number;
    }
  | { type: 'viewer-error'; resource: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasExpectedKeys(
  value: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowedKeys.has(key))
  );
}

export function isPersistedViewState(
  value: unknown,
): value is PersistedViewState {
  if (
    !isRecord(value) ||
    !hasExpectedKeys(
      value,
      ['pageNumber', 'scaleValue', 'scrollLeft', 'scrollTop'],
      ['outlineVisible'],
    )
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
    Number.isFinite(value.scrollTop) &&
    (value.outlineVisible === undefined ||
      typeof value.outlineVisible === 'boolean')
  );
}

export function parseViewerToHostMessage(
  message: unknown,
): ViewerToHostMessage | undefined {
  if (!isRecord(message)) {
    return undefined;
  }

  if (hasExpectedKeys(message, ['type']) && message.type === 'open-source') {
    return { type: 'open-source' };
  }

  if (hasExpectedKeys(message, ['type']) && message.type === 'open-external') {
    return { type: 'open-external' };
  }

  if (
    hasExpectedKeys(message, ['type', 'theme']) &&
    message.type === 'appearance-theme' &&
    (message.theme === 'auto' ||
      message.theme === 'light' ||
      message.theme === 'dark' ||
      message.theme === 'night' ||
      message.theme === 'reader' ||
      message.theme === 'dark-pages' ||
      message.theme === 'inverted')
  ) {
    return { type: 'appearance-theme', theme: message.theme };
  }

  if (
    hasExpectedKeys(message, ['type', 'state']) &&
    message.type === 'view-state' &&
    isPersistedViewState(message.state)
  ) {
    return { type: 'view-state', state: message.state };
  }

  if (
    hasExpectedKeys(message, ['type', 'pagesCount', 'pageNumber']) &&
    message.type === 'viewer-ready' &&
    typeof message.pagesCount === 'number' &&
    Number.isInteger(message.pagesCount) &&
    message.pagesCount > 0 &&
    typeof message.pageNumber === 'number' &&
    Number.isInteger(message.pageNumber) &&
    message.pageNumber > 0
  ) {
    return {
      type: 'viewer-ready',
      pagesCount: message.pagesCount,
      pageNumber: message.pageNumber,
    };
  }

  if (
    hasExpectedKeys(message, ['type', 'message']) &&
    message.type === 'viewer-error' &&
    typeof message.message === 'string'
  ) {
    return { type: 'viewer-error', message: message.message };
  }

  return undefined;
}

export function viewStateKey(resource: vscode.Uri): string {
  return `pdf-preview-next.view-state:${resource.with({ fragment: '' }).toString()}`;
}

export function persistedViewStateOrUndefined(
  value: unknown,
): PersistedViewState | undefined {
  return isPersistedViewState(value) ? value : undefined;
}
