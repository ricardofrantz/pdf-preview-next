import * as pdfjsLib from './pdfjs/build/pdf.min.mjs';

globalThis.pdfjsLib = pdfjsLib;

const { getDocument, GlobalWorkerOptions, PasswordResponses } = pdfjsLib;
const {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  RenderingStates,
  ScrollMode,
  SpreadMode,
} = await import('./pdfjs/web/pdf_viewer.mjs');

const vscode = acquireVsCodeApi();
const NAMED_SCALE_VALUES = new Set([
  'auto',
  'page-actual',
  'page-fit',
  'page-width',
]);
const SCALE_SELECT_VALUES = new Set([
  ...NAMED_SCALE_VALUES,
  '0.5',
  '0.75',
  '1',
  '1.25',
  '1.5',
  '2',
  '3',
  '4',
]);
const THEME_VALUES = new Set(['auto', 'light', 'dark', 'inverted']);
const PAGE_GAP_VALUES = new Set(['compact', 'normal', 'wide']);
const DEFAULT_RELOAD_DEBOUNCE_MS = 800;

function element(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing viewer element: ${id}`);
  }
  return node;
}

function loadConfig() {
  const elem = element('pdf-preview-config');
  const encoded = elem.getAttribute('data-config');
  if (!encoded) {
    throw new Error('Could not load PDF preview configuration.');
  }
  return JSON.parse(encoded);
}

function hashFromUrl(url) {
  try {
    return new URL(url).hash.replace(/^#/, '');
  } catch {
    const hashIndex = url.indexOf('#');
    return hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  }
}

function normalizeScale(value) {
  if (typeof value !== 'string') {
    return 'auto';
  }
  if (NAMED_SCALE_VALUES.has(value)) {
    return value;
  }
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return value;
  }
  return 'auto';
}

function classValue(value, allowedValues, fallback) {
  return typeof value === 'string' && allowedValues.has(value)
    ? value
    : fallback;
}

function scrollMode(name) {
  switch (name) {
    case 'horizontal':
      return ScrollMode.HORIZONTAL;
    case 'wrapped':
      return ScrollMode.WRAPPED;
    default:
      return ScrollMode.VERTICAL;
  }
}

function spreadMode(name) {
  switch (name) {
    case 'odd':
      return SpreadMode.ODD;
    case 'even':
      return SpreadMode.EVEN;
    default:
      return SpreadMode.NONE;
  }
}

function messageFromError(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    return error.message;
  }
  return String(error);
}

function reloadDebounceMs(config) {
  const value = Number(config.reload?.debounceMs ?? DEFAULT_RELOAD_DEBOUNCE_MS);
  if (!Number.isFinite(value)) {
    return DEFAULT_RELOAD_DEBOUNCE_MS;
  }
  return Math.min(Math.max(Math.trunc(value), 0), 10000);
}

function isInteractiveTarget(target) {
  return (
    target instanceof Element &&
    !!target.closest(
      'a, button, input, select, textarea, [contenteditable], .textLayer',
    )
  );
}

class PdfPreviewApp {
  constructor() {
    this.config = loadConfig();
    this.elements = {
      container: element('viewerContainer'),
      findInput: element('findInput'),
      findNext: element('findNext'),
      findPrevious: element('findPrevious'),
      findStatus: element('findStatus'),
      next: element('next'),
      numPages: element('numPages'),
      openSource: element('openSource'),
      outlineSidebar: element('outlineSidebar'),
      outlineToggle: element('outlineToggle'),
      outlineTree: element('outlineTree'),
      pageNumber: element('pageNumber'),
      passwordCancel: element('passwordCancel'),
      passwordForm: element('passwordForm'),
      passwordInput: element('passwordInput'),
      passwordMessage: element('passwordMessage'),
      passwordOverlay: element('passwordOverlay'),
      previous: element('previous'),
      print: element('print'),
      reload: element('reload'),
      scaleSelect: element('scaleSelect'),
      status: element('status'),
      viewer: element('viewer'),
      zoomIn: element('zoomIn'),
      zoomOut: element('zoomOut'),
    };
    this.eventBus = new EventBus();
    this.linkService = new PDFLinkService({
      eventBus: this.eventBus,
      externalLinkRel: 'noopener noreferrer nofollow',
      externalLinkTarget: LinkTarget.BLANK,
    });
    this.findController = new PDFFindController({
      eventBus: this.eventBus,
      linkService: this.linkService,
    });
    this.pdfViewer = new PDFViewer({
      container: this.elements.container,
      eventBus: this.eventBus,
      findController: this.findController,
      imageResourcesPath: this.config.imageResourcesPath,
      linkService: this.linkService,
      viewer: this.elements.viewer,
    });
    this.linkService.setViewer(this.pdfViewer);

    this.loadingTask = null;
    this.loadToken = 0;
    this.pdfDocument = null;
    this.pendingPasswordUpdate = null;
    this.findInputTimer = null;
    this.persistViewStateTimer = null;
    this.reloadRetryTimer = null;
    this.outlineVisibleOverride = null;
    this.printing = false;

    GlobalWorkerOptions.workerSrc = this.config.workerSrc;
    this.applyAppearance();
    this.setupEvents();
    this.applyCursorDefault();
    this.updateFindButtons();
    this.updatePageControls();
  }

  setupEvents() {
    this.elements.openSource.addEventListener('click', () => {
      vscode.postMessage({ type: 'open-source' });
    });
    this.elements.outlineToggle.addEventListener('click', () => {
      this.setOutlineVisible(
        this.elements.outlineSidebar.classList.contains('hidden'),
        { remember: true },
      );
    });
    this.elements.reload.addEventListener('click', () => {
      this.refreshDocument();
    });
    this.elements.print.addEventListener('click', () => {
      this.printDocument();
    });
    this.elements.previous.addEventListener('click', () => {
      this.pdfViewer.currentPageNumber -= 1;
    });
    this.elements.next.addEventListener('click', () => {
      this.pdfViewer.currentPageNumber += 1;
    });
    this.elements.pageNumber.addEventListener('change', () => {
      this.goToPageFromInput();
    });
    this.elements.pageNumber.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.goToPageFromInput();
      }
    });
    this.elements.scaleSelect.addEventListener('change', () => {
      this.pdfViewer.currentScaleValue = this.elements.scaleSelect.value;
    });
    this.elements.zoomIn.addEventListener('click', () => {
      this.pdfViewer.increaseScale();
    });
    this.elements.zoomOut.addEventListener('click', () => {
      this.pdfViewer.decreaseScale();
    });
    this.elements.findInput.addEventListener('input', () => {
      clearTimeout(this.findInputTimer);
      this.findInputTimer = setTimeout(() => this.dispatchFind(''), 250);
    });
    this.elements.findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(this.findInputTimer);
        const previousQuery = this.findController.state?.query;
        this.dispatchFind(
          this.elements.findInput.value === previousQuery ? 'again' : '',
          event.shiftKey,
        );
      }
    });
    this.elements.findNext.addEventListener('click', () => {
      this.dispatchFind('again', false);
    });
    this.elements.findPrevious.addEventListener('click', () => {
      this.dispatchFind('again', true);
    });
    this.elements.passwordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitPassword();
    });
    this.elements.passwordCancel.addEventListener('click', () => {
      this.cancelPasswordPrompt();
    });
    this.elements.container.addEventListener('dragstart', (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('.textLayer')
      ) {
        event.preventDefault();
      }
    });
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'r') {
        event.preventDefault();
        this.refreshDocument();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault();
        this.elements.findInput.focus();
        this.elements.findInput.select();
      }
    });
    this.elements.container.addEventListener('keydown', (event) => {
      this.handleViewerKeydown(event);
    });
    this.elements.container.addEventListener('scroll', () => {
      this.schedulePersistViewState();
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'reload') {
        this.refreshDocument();
      } else if (event.data?.type === 'print') {
        this.printDocument();
      } else if (event.data?.type === 'file-deleted') {
        this.setStatus('PDF deleted. Waiting for it to be recreated.');
      }
    });

    this.eventBus.on('pagechanging', () => {
      this.updatePageControls();
      this.schedulePersistViewState();
    });
    this.eventBus.on('pagesloaded', ({ pagesCount }) => {
      this.elements.numPages.textContent = `of ${pagesCount}`;
      this.updatePageControls();
      this.setStatus('');
    });
    this.eventBus.on('scalechanging', (event) => {
      this.updateScaleSelect(event.presetValue || String(event.scale));
      this.schedulePersistViewState();
    });
    this.eventBus.on('updatefindmatchescount', (event) => {
      this.updateFindStatus(event.matchesCount);
    });
    this.eventBus.on('updatefindcontrolstate', (event) => {
      this.updateFindControlState(event);
    });
  }

  async readDocumentData() {
    const response = await fetch(this.config.path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `Could not read PDF resource (${response.status} ${response.statusText})`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  loadOptions(data) {
    return {
      cMapPacked: true,
      cMapUrl: this.config.cMapUrl,
      data,
      disableRange: true,
      disableStream: true,
      iccUrl: this.config.iccUrl,
      isEvalSupported: false,
      isImageDecoderSupported: false,
      standardFontDataUrl: this.config.standardFontDataUrl,
      useWasm: false,
      useWorkerFetch: false,
      wasmUrl: this.config.wasmUrl,
    };
  }

  async loadDocument({ restoreView = false, retryOnFailure = false } = {}) {
    this.clearReloadRetry();
    const viewState = restoreView
      ? this.captureViewState()
      : this.initialViewState();
    const token = ++this.loadToken;

    if (this.loadingTask) {
      this.loadingTask.destroy();
      this.loadingTask = null;
    }
    this.hidePasswordPrompt();
    this.setStatus('Reading PDF');

    try {
      const pdfData = await this.readDocumentData();
      if (token !== this.loadToken) {
        return;
      }

      this.setStatus('Loading');
      const loadingTask = getDocument(this.loadOptions(pdfData));
      this.loadingTask = loadingTask;
      loadingTask.onProgress = ({ loaded, total }) => {
        if (token !== this.loadToken || !total) {
          return;
        }
        const percent = Math.round((loaded / total) * 100);
        this.setStatus(`Loading ${percent}%`);
      };
      loadingTask.onPassword = (updatePassword, reason) => {
        if (token === this.loadToken) {
          this.showPasswordPrompt(updatePassword, reason);
        }
      };

      const pdfDocument = await loadingTask.promise;
      if (token !== this.loadToken) {
        await pdfDocument.destroy();
        return;
      }

      const oldDocument = this.pdfDocument;
      const pagesInit = this.waitForEvent('pagesinit');
      this.linkService.setDocument(pdfDocument, this.config.path);
      this.pdfViewer.setDocument(pdfDocument);
      this.pdfDocument = pdfDocument;
      await pagesInit;
      await this.populateOutline(pdfDocument, token, viewState);

      if (oldDocument && oldDocument !== pdfDocument) {
        try {
          await oldDocument.destroy();
        } catch (error) {
          console.warn(
            'PDF Preview: failed to destroy previous document',
            error,
          );
        }
      }
      this.applyDocumentView(viewState);
      this.updatePageControls();
      this.updateFindButtons();
      this.setStatus('');
    } catch (error) {
      if (token !== this.loadToken) {
        return;
      }
      if (!this.pdfDocument) {
        this.pdfViewer.setDocument(null);
        this.linkService.setDocument(null);
      }
      if (retryOnFailure && this.pdfDocument) {
        this.setStatus(
          `Could not refresh PDF: ${messageFromError(error)}. Keeping previous version and retrying once.`,
        );
        this.reloadRetryTimer = setTimeout(() => {
          this.reloadRetryTimer = null;
          this.loadDocument({ restoreView: true });
        }, reloadDebounceMs(this.config));
      } else {
        this.setStatus(`Could not load PDF: ${messageFromError(error)}`);
      }
      console.error('PDF Preview: failed to load document', error);
    } finally {
      if (token === this.loadToken) {
        this.loadingTask = null;
      }
    }
  }

  refreshDocument() {
    this.loadDocument({ restoreView: true, retryOnFailure: true });
  }

  clearReloadRetry() {
    if (this.reloadRetryTimer) {
      clearTimeout(this.reloadRetryTimer);
      this.reloadRetryTimer = null;
    }
  }

  waitForEvent(eventName) {
    return new Promise((resolve) => {
      this.eventBus.on(eventName, resolve, { once: true });
    });
  }

  initialViewState() {
    const documentHash = hashFromUrl(this.config.path) || this.config.hash;
    return documentHash ? null : this.config.initialViewState || null;
  }

  applyDocumentView(viewState) {
    const defaults = this.config.defaults || {};
    this.pdfViewer.scrollMode = scrollMode(defaults.scrollMode);
    this.pdfViewer.spreadMode = spreadMode(defaults.spreadMode);
    const documentHash = hashFromUrl(this.config.path) || this.config.hash;
    const initialViewState = viewState;

    if (initialViewState) {
      this.pdfViewer.currentScaleValue = normalizeScale(
        initialViewState.scaleValue,
      );
      this.pdfViewer.currentPageNumber = Math.min(
        Math.max(initialViewState.pageNumber, 1),
        this.pdfViewer.pagesCount,
      );
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.elements.container.scrollLeft = initialViewState.scrollLeft;
          this.elements.container.scrollTop = initialViewState.scrollTop;
        });
      });
      return;
    }

    this.pdfViewer.currentScaleValue = normalizeScale(defaults.scale);
    if (documentHash) {
      this.setHash(documentHash);
    }
  }

  captureViewState() {
    return {
      pageNumber: this.pdfViewer.currentPageNumber || 1,
      scaleValue: this.pdfViewer.currentScaleValue || 'auto',
      scrollLeft: Math.max(0, this.elements.container.scrollLeft),
      scrollTop: Math.max(0, this.elements.container.scrollTop),
      outlineVisible: !this.elements.outlineSidebar.classList.contains(
        'hidden',
      ),
    };
  }

  schedulePersistViewState() {
    clearTimeout(this.persistViewStateTimer);
    this.persistViewStateTimer = setTimeout(() => {
      if (!this.pdfDocument) {
        return;
      }
      vscode.postMessage({
        type: 'view-state',
        state: this.captureViewState(),
      });
    }, 250);
  }

  setHash(hash) {
    try {
      this.linkService.setHash(decodeURIComponent(hash));
    } catch (error) {
      console.warn('PDF Preview: failed to apply document hash', error);
    }
  }

  goToPageFromInput() {
    const pageNumber = Number(this.elements.pageNumber.value);
    if (!Number.isInteger(pageNumber)) {
      this.updatePageControls();
      return;
    }
    this.pdfViewer.currentPageNumber = Math.min(
      Math.max(pageNumber, 1),
      this.pdfViewer.pagesCount,
    );
  }

  updatePageControls() {
    const pageNumber = this.pdfViewer.currentPageNumber || 1;
    const pagesCount = this.pdfViewer.pagesCount || 0;
    this.elements.pageNumber.value = String(pageNumber);
    this.elements.pageNumber.max = String(Math.max(pagesCount, 1));
    this.elements.numPages.textContent = `of ${pagesCount}`;
    this.elements.previous.disabled = pageNumber <= 1;
    this.elements.next.disabled = pageNumber >= pagesCount;
  }

  updateScaleSelect(scaleValue) {
    const normalizedScale = normalizeScale(scaleValue);
    if (SCALE_SELECT_VALUES.has(normalizedScale)) {
      this.elements.scaleSelect.value = normalizedScale;
      return;
    }
    const numericScale = Number(normalizedScale);
    if (Number.isFinite(numericScale)) {
      const percent = Math.round(numericScale * 100);
      this.setStatus(`${percent}%`);
    }
  }

  dispatchFind(type, findPrevious = false) {
    const query = this.elements.findInput.value;
    this.updateFindButtons();
    this.eventBus.dispatch('find', {
      source: this,
      type,
      query,
      caseSensitive: false,
      entireWord: false,
      findPrevious,
      highlightAll: true,
      matchDiacritics: false,
    });
  }

  updateFindButtons() {
    const hasQuery = this.elements.findInput.value.length > 0;
    this.elements.findNext.disabled = !hasQuery;
    this.elements.findPrevious.disabled = !hasQuery;
    if (!hasQuery) {
      this.elements.findStatus.textContent = '';
    }
  }

  updateFindStatus(matchesCount) {
    if (!this.elements.findInput.value) {
      this.elements.findStatus.textContent = '';
      return;
    }
    if (matchesCount?.total) {
      this.elements.findStatus.textContent = `${matchesCount.current}/${matchesCount.total}`;
    }
  }

  updateFindControlState({ state, matchesCount, rawQuery }) {
    if (!rawQuery) {
      this.elements.findStatus.textContent = '';
      return;
    }
    if (state === FindState.PENDING) {
      this.elements.findStatus.textContent = '...';
      return;
    }
    if (state === FindState.NOT_FOUND) {
      this.elements.findStatus.textContent = 'No match';
      return;
    }
    this.updateFindStatus(matchesCount);
  }

  applyCursorDefault() {
    if (this.config.defaults?.cursor !== 'hand') {
      return;
    }

    const container = this.elements.container;
    container.classList.add('cursor-hand');
    let drag = null;

    container.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || isInteractiveTarget(event.target)) {
        return;
      }
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };
      container.classList.add('dragging');
      container.setPointerCapture(event.pointerId);
    });
    container.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      container.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
      container.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    });
    const endDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      drag = null;
      container.classList.remove('dragging');
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
    };
    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);
  }

  applyAppearance() {
    const appearance = this.config.appearance || {};
    const theme = classValue(appearance.theme, THEME_VALUES, 'auto');
    const pageGap = classValue(appearance.pageGap, PAGE_GAP_VALUES, 'normal');
    document.body.classList.add(`theme-${theme}`, `page-gap-${pageGap}`);
  }

  async populateOutline(pdfDocument, token, viewState) {
    let outline = null;
    try {
      outline = await pdfDocument.getOutline();
    } catch (error) {
      console.warn('PDF Preview: failed to load outline', error);
    }
    if (token !== this.loadToken) {
      return;
    }

    this.elements.outlineTree.replaceChildren();
    const hasOutline = Array.isArray(outline) && outline.length > 0;
    this.elements.outlineToggle.disabled = !hasOutline;
    if (!hasOutline) {
      this.setOutlineVisible(false);
      return;
    }

    this.renderOutlineItems(outline, this.elements.outlineTree, 0);
    const visible =
      viewState?.outlineVisible ??
      this.outlineVisibleOverride ??
      this.config.defaults?.sidebar === true;
    this.setOutlineVisible(visible);
  }

  renderOutlineItems(items, parent, depth) {
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `outline-item outline-depth-${Math.min(depth, 6)}`;
      row.textContent = item.title || 'Untitled';
      row.disabled = !item.dest;
      if (item.dest) {
        row.addEventListener('click', () => {
          void this.linkService.goToDestination(item.dest).catch((error) => {
            console.warn(
              'PDF Preview: failed to open outline destination',
              error,
            );
          });
          this.elements.container.focus();
        });
      }
      parent.append(row);

      if (Array.isArray(item.items) && item.items.length > 0) {
        this.renderOutlineItems(item.items, parent, depth + 1);
      }
    }
  }

  setOutlineVisible(visible, { remember = false } = {}) {
    this.elements.outlineSidebar.classList.toggle('hidden', !visible);
    this.elements.outlineToggle.setAttribute('aria-expanded', String(visible));
    if (remember) {
      this.outlineVisibleOverride = visible;
      this.schedulePersistViewState();
    }
  }

  handleViewerKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest('input, select, textarea, button, [contenteditable]')
    ) {
      return;
    }

    let handled = true;
    switch (event.key) {
      case 'j':
        this.elements.container.scrollBy({ top: 80 });
        break;
      case 'k':
        this.elements.container.scrollBy({ top: -80 });
        break;
      case 'h':
        this.elements.container.scrollBy({ left: -80 });
        break;
      case 'l':
        this.elements.container.scrollBy({ left: 80 });
        break;
      case 'n':
      case '.':
        this.pdfViewer.currentPageNumber += 1;
        break;
      case 'p':
      case ',':
        this.pdfViewer.currentPageNumber -= 1;
        break;
      case 'g':
        this.pdfViewer.currentPageNumber = 1;
        break;
      case 'G':
        this.pdfViewer.currentPageNumber = this.pdfViewer.pagesCount;
        break;
      case '+':
      case '=':
        this.pdfViewer.increaseScale();
        break;
      case '-':
        this.pdfViewer.decreaseScale();
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  }

  showPasswordPrompt(updatePassword, reason) {
    this.pendingPasswordUpdate = updatePassword;
    this.elements.passwordMessage.textContent =
      reason === PasswordResponses.INCORRECT_PASSWORD
        ? 'Incorrect password. Please try again.'
        : 'Enter the password to open this PDF.';
    this.elements.passwordInput.value = '';
    this.elements.passwordOverlay.classList.remove('hidden');
    this.elements.passwordInput.focus();
  }

  submitPassword() {
    if (!this.pendingPasswordUpdate) {
      return;
    }
    const password = this.elements.passwordInput.value;
    if (!password) {
      this.elements.passwordInput.focus();
      return;
    }
    const updatePassword = this.pendingPasswordUpdate;
    this.hidePasswordPrompt();
    updatePassword(password);
  }

  cancelPasswordPrompt() {
    this.hidePasswordPrompt();
    if (this.loadingTask) {
      this.loadingTask.destroy();
    }
    this.setStatus('Password entry cancelled.');
  }

  hidePasswordPrompt() {
    this.pendingPasswordUpdate = null;
    this.elements.passwordOverlay.classList.add('hidden');
  }

  setStatus(message) {
    this.elements.status.textContent = message;
    this.elements.status.title = message;
    this.elements.status.classList.toggle('is-visible', message.length > 0);
  }

  waitForPageRendered(pageNumber) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const finish = () => {
        clearInterval(checkTimer);
        clearTimeout(timeoutTimer);
        controller.abort();
        resolve();
      };
      const checkTimer = setInterval(() => {
        const pageView = this.pdfViewer.getPageView(pageNumber - 1);
        if (pageView?.renderingState === RenderingStates.FINISHED) {
          finish();
        }
      }, 50);
      const timeoutTimer = setTimeout(finish, 30000);
      this.eventBus.on(
        'pagerendered',
        (event) => {
          if (event.pageNumber === pageNumber) {
            finish();
          }
        },
        { signal: controller.signal },
      );
    });
  }

  async renderPagesForPrint() {
    await this.pdfViewer.pagesPromise;
    const renderingQueue = this.pdfViewer.renderingQueue;
    const wasPrinting = renderingQueue.printing;
    renderingQueue.printing = true;
    try {
      for (let index = 0; index < this.pdfViewer.pagesCount; index += 1) {
        const pageView = this.pdfViewer.getPageView(index);
        if (!pageView || pageView.renderingState === RenderingStates.FINISHED) {
          continue;
        }
        this.setStatus(
          `Preparing print ${index + 1}/${this.pdfViewer.pagesCount}`,
        );
        if (pageView.renderingState === RenderingStates.INITIAL) {
          await pageView.draw();
        } else {
          if (
            pageView.renderingState === RenderingStates.PAUSED &&
            typeof pageView.resume === 'function'
          ) {
            pageView.resume();
          }
          await this.waitForPageRendered(pageView.id);
        }
      }
    } finally {
      renderingQueue.printing = wasPrinting;
    }
  }

  async printDocument() {
    if (this.printing) {
      return;
    }
    if (!this.pdfDocument) {
      this.setStatus('Open a PDF before printing.');
      return;
    }
    if (typeof window.print !== 'function') {
      this.setStatus('Print dialog unavailable. Opening PDF externally.');
      vscode.postMessage({ type: 'open-external' });
      return;
    }

    this.printing = true;
    this.elements.print.disabled = true;
    try {
      await this.renderPagesForPrint();
      this.setStatus('Opening print dialog');
      window.print();
      this.setStatus('');
    } catch (error) {
      console.warn('PDF Preview: webview print failed', error);
      this.setStatus('Print dialog unavailable. Opening PDF externally.');
      vscode.postMessage({ type: 'open-external' });
    } finally {
      this.printing = false;
      this.elements.print.disabled = false;
    }
  }
}

const startApp = () => {
  const app = new PdfPreviewApp();
  app.loadDocument();
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
}
