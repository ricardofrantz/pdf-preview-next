import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
} from './pdfjs/build/pdf.min.mjs';
import {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
  SpreadMode,
} from './pdfjs/web/pdf_viewer.mjs';

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
      openText: element('openText'),
      pageNumber: element('pageNumber'),
      passwordCancel: element('passwordCancel'),
      passwordForm: element('passwordForm'),
      passwordInput: element('passwordInput'),
      passwordMessage: element('passwordMessage'),
      passwordOverlay: element('passwordOverlay'),
      previous: element('previous'),
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

    GlobalWorkerOptions.workerSrc = this.config.workerSrc;
    this.setupEvents();
    this.applyCursorDefault();
    this.updateFindButtons();
    this.updatePageControls();
  }

  setupEvents() {
    this.elements.openText.addEventListener('click', () => {
      vscode.postMessage({ type: 'reopen-as-text' });
    });
    this.elements.reload.addEventListener('click', () => {
      this.loadDocument({ restoreView: true });
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
        this.dispatchFind('again', event.shiftKey);
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
    window.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.elements.findInput.focus();
        this.elements.findInput.select();
      }
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'reload') {
        this.loadDocument({ restoreView: true });
      }
    });

    this.eventBus.on('pagechanging', () => this.updatePageControls());
    this.eventBus.on('pagesloaded', ({ pagesCount }) => {
      this.elements.numPages.textContent = `of ${pagesCount}`;
      this.updatePageControls();
      this.setStatus('');
    });
    this.eventBus.on('scalechanging', (event) => {
      this.updateScaleSelect(event.presetValue || String(event.scale));
    });
    this.eventBus.on('updatefindmatchescount', (event) => {
      this.updateFindStatus(event.matchesCount);
    });
    this.eventBus.on('updatefindcontrolstate', (event) => {
      this.updateFindControlState(event);
    });
  }

  loadOptions() {
    return {
      cMapPacked: true,
      cMapUrl: this.config.cMapUrl,
      iccUrl: this.config.iccUrl,
      isEvalSupported: false,
      isImageDecoderSupported: false,
      standardFontDataUrl: this.config.standardFontDataUrl,
      url: this.config.path,
      useWorkerFetch: false,
      wasmUrl: this.config.wasmUrl,
    };
  }

  async loadDocument({ restoreView = false } = {}) {
    const viewState = restoreView ? this.captureViewState() : null;
    const token = ++this.loadToken;

    if (this.loadingTask) {
      this.loadingTask.destroy();
      this.loadingTask = null;
    }
    this.hidePasswordPrompt();
    this.setStatus('Loading');

    const loadingTask = getDocument(this.loadOptions());
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

    try {
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
      this.setStatus(`Could not load PDF: ${messageFromError(error)}`);
      console.error('PDF Preview: failed to load document', error);
    } finally {
      if (token === this.loadToken) {
        this.loadingTask = null;
      }
    }
  }

  waitForEvent(eventName) {
    return new Promise((resolve) => {
      this.eventBus.on(eventName, resolve, { once: true });
    });
  }

  applyDocumentView(viewState) {
    const defaults = this.config.defaults || {};
    this.pdfViewer.scrollMode = scrollMode(defaults.scrollMode);
    this.pdfViewer.spreadMode = spreadMode(defaults.spreadMode);

    if (viewState) {
      this.pdfViewer.currentScaleValue = normalizeScale(viewState.scaleValue);
      this.pdfViewer.currentPageNumber = Math.min(
        Math.max(viewState.pageNumber, 1),
        this.pdfViewer.pagesCount,
      );
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.elements.container.scrollLeft = viewState.scrollLeft;
          this.elements.container.scrollTop = viewState.scrollTop;
        });
      });
      return;
    }

    this.pdfViewer.currentScaleValue = normalizeScale(defaults.scale);
    const documentHash = hashFromUrl(this.config.path);
    if (documentHash) {
      this.setHash(documentHash);
    }
  }

  captureViewState() {
    return {
      pageNumber: this.pdfViewer.currentPageNumber || 1,
      scaleValue: this.pdfViewer.currentScaleValue || 'auto',
      scrollLeft: this.elements.container.scrollLeft,
      scrollTop: this.elements.container.scrollTop,
    };
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
      if (
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest('a, button, input, select, textarea'))
      ) {
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
    container.addEventListener('pointerup', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      drag = null;
      container.classList.remove('dragging');
      container.releasePointerCapture(event.pointerId);
    });
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
  }
}

window.addEventListener(
  'DOMContentLoaded',
  () => {
    const app = new PdfPreviewApp();
    app.loadDocument();
  },
  { once: true },
);

window.addEventListener('error', (event) => {
  console.error('PDF Preview: unhandled error', event.error || event.message);
});
