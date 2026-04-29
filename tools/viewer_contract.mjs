import assert from 'node:assert/strict';

const toolbarButtonIds = [
  'previous',
  'next',
  'zoomOut',
  'zoomIn',
  'findPrevious',
  'findNext',
  'themeToggle',
  'outlineToggle',
  'print',
  'reload',
  'openSource',
];

const iconOnlyButtonIds = new Set(['zoomOut', 'zoomIn']);

export function assertViewerContract({
  webviewSource,
  stylesSource,
  viewerScriptSource,
  context = 'viewer',
}) {
  assert.doesNotMatch(
    webviewSource,
    /executeCommand\(['"]vscode\.openWith['"],\s*this\.resource,\s*['"]default['"]/,
    `${context}: external-open action must not use VS Code's binary/text fallback editor.`,
  );
  assert.match(
    webviewSource,
    /async openSource\([^)]*\)\s*{[\s\S]*?await this\.openExternal\(\);[\s\S]*?}/,
    `${context}: external-open action must open PDFs externally.`,
  );
  assert.match(
    webviewSource,
    /<button id="openSource"[^>]*title="Open PDF with system viewer"[^>]*aria-label="Open PDF with system viewer"/,
    `${context}: external-open toolbar button must describe the system viewer behavior.`,
  );
  assert.match(
    webviewSource,
    /<button id="openSource"[^>]*>[\s\S]*?<use href="#icon-external-link"\/>[\s\S]*?<span class="label">External<\/span>/,
    `${context}: external-open toolbar button must use the external-link icon and label.`,
  );
  assert.doesNotMatch(
    webviewSource,
    /<button id="openSource"[^>]*>[\s\S]*?<span class="label">Source<\/span>/,
    `${context}: external-open toolbar button should not be labeled Source.`,
  );
  assert.match(
    webviewSource,
    /<button id="themeToggle"[^>]*title="Switch PDF page mode to Night"[^>]*aria-label="Switch PDF page mode to Night"[^>]*aria-pressed="false"[^>]*>[\s\S]*?<use href="#icon-theme"\/>[\s\S]*?<span class="label">Clear<\/span>/,
    `${context}: theme cycle button must expose a pressed state, next-mode label, and icon.`,
  );
  assert.match(
    webviewSource,
    /<div class="sidebar-tabs" role="tablist" aria-label="Sidebar panels">[\s\S]*?<button id="outlinePanelTab"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="outlinePanel">Outline<\/button>[\s\S]*?<button id="thumbnailPanelTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="thumbnailPanel">Thumbnails<\/button>/,
    `${context}: viewer must include accessible sidebar panel tabs.`,
  );
  assert.match(
    webviewSource,
    /<section id="thumbnailPanel"[^>]*class="sidebar-panel thumbnail-panel hidden"[^>]*aria-label="Page thumbnails"[^>]*hidden>[\s\S]*?<div id="thumbnailList" class="thumbnail-list" role="list" aria-label="Page thumbnails"><\/div>/,
    `${context}: viewer must include the thumbnail sidebar panel shell.`,
  );

  for (const buttonId of toolbarButtonIds) {
    assert.match(
      webviewSource,
      new RegExp(`<button id="${buttonId}"`),
      `${context}: toolbar button ${buttonId} must exist.`,
    );
    assert.match(
      webviewSource,
      new RegExp(`<button id="${buttonId}"[^>]*aria-label="[^"]+"`),
      `${context}: toolbar button ${buttonId} must have aria-label.`,
    );

    const buttonPattern = iconOnlyButtonIds.has(buttonId)
      ? `<button id="${buttonId}"[^>]*>[\\s\\S]*?<svg class="icon"[\\s\\S]*?</svg>[\\s\\S]*?</button>`
      : `<button id="${buttonId}"[^>]*>[\\s\\S]*?<svg class="icon"[\\s\\S]*?</svg>[\\s\\S]*?<span class="label">`;
    assert.match(
      webviewSource,
      new RegExp(buttonPattern),
      iconOnlyButtonIds.has(buttonId)
        ? `${context}: toolbar button ${buttonId} must contain svg.icon.`
        : `${context}: toolbar button ${buttonId} must contain svg.icon and span.label.`,
    );
  }

  assert.doesNotMatch(
    stylesSource,
    /#pdf-toolbar[^}]*overflow-x:\s*auto/,
    `${context}: #pdf-toolbar should not use overflow-x: auto.`,
  );
  assert.match(
    stylesSource,
    /#pdf-toolbar[^}]*container-type:\s*inline-size/,
    `${context}: #pdf-toolbar must use container-type: inline-size.`,
  );
  assert.match(
    stylesSource,
    /button\.is-active\s*{[^}]*background:\s*var\(--vscode-button-secondaryBackground\)/s,
    `${context}: active toolbar buttons must have a visible active state.`,
  );
  assert.match(
    stylesSource,
    /\.pdfViewer\s*{[^}]*--page-bg-color:\s*#fff/s,
    `${context}: default PDF page background must be defined at viewer level.`,
  );
  assert.doesNotMatch(
    stylesSource,
    /\.pdfViewer\s+\.page\s*{[^}]*--page-bg-color:\s*#fff/s,
    `${context}: page-level white background must not override night mode during reload.`,
  );
  assert.match(
    stylesSource,
    /body\.theme-night\s+\.pdfViewer,\s*body\.theme-reader\s+\.pdfViewer,\s*body\.theme-dark-pages\s+\.pdfViewer\s*{[^}]*--page-bg-color:\s*#1b1b1b/s,
    `${context}: night mode must set page background before PDF.js page shells render.`,
  );
  assert.match(
    stylesSource,
    /@container\s*\(max-width:\s*720px\)[^{]*{[^}]*\.label[^}]*display:\s*none/,
    `${context}: @container query must hide .label at 720px.`,
  );
  assert.match(
    stylesSource,
    /\.sidebar-tab\.is-active\s*{[^}]*background:\s*var\(--vscode-list-activeSelectionBackground\)/s,
    `${context}: sidebar panel tabs must expose active selection state.`,
  );
  assert.match(
    stylesSource,
    /\.thumbnail-list\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/s,
    `${context}: thumbnail panel must stack page thumbnails vertically.`,
  );
  assert.match(
    stylesSource,
    /\.thumbnail-canvas-shell\s*{[^}]*min-height:\s*150px;[^}]*border:\s*1px solid var\(--vscode-panel-border\)/s,
    `${context}: thumbnail canvas shell must reserve stable space without decorative cards.`,
  );
  assert.match(
    stylesSource,
    /\.textLayer\s+\.highlight\s*{[^}]*--highlight-bg-color:\s*rgb\(255 213 74 \/ 0\.95\)/s,
    `${context}: find matches must have a visible highlight color.`,
  );
  assert.match(
    stylesSource,
    /\.textLayer\s+\.highlight\s*{[^}]*--highlight-selected-bg-color:\s*rgb\(255 128 42 \/ 0\.98\)/s,
    `${context}: selected find match must have a stronger highlight color.`,
  );
  assert.doesNotMatch(
    stylesSource,
    /\.textLayer\s*{[^}]*opacity:\s*0\.[0-9]+/s,
    `${context}: text layer opacity must not dim find highlights.`,
  );
  assert.match(
    stylesSource,
    /body\.theme-dark\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-night\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-reader\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-dark-pages\s+\.textLayer\s+\.highlight\.selected,\s*body\.theme-inverted\s+\.textLayer\s+\.highlight\.selected\s*{/,
    `${context}: dark, night, reader, dark-pages, and inverted themes must override selected find highlight.`,
  );

  if (viewerScriptSource) {
    assert.match(
      viewerScriptSource,
      /function applyPageColorVariables\(viewer, theme\)\s*{[\s\S]*?viewer\.style\.setProperty\(['"]--page-bg-color['"], pageColors\.background\);[\s\S]*?viewer\.style\.removeProperty\(['"]--page-bg-color['"]\);[\s\S]*?}/,
      `${context}: viewer must apply page background variables before PDF.js finishes loading.`,
    );
  }
}
