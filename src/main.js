import {
  AppState,
  getChapterScroll,
  initStorage,
  restoreProgress,
  saveProgress,
  saveReaderState,
  saveSettings,
  setChapterScroll,
  clearResources,
} from './utils/storage.js';
import { parsePDF } from './parser/pdf.js';
import { parseEPUB } from './parser/epub.js';
import { parseTextFormats } from './parser/text.js';
import {
  decreaseWPM,
  increaseWPM,
  initRSVPMode,
  pauseRSVP,
  skipBackward,
  skipForward,
  togglePlayPause,
} from './modes/rsvp.js';
import { applyROTTransforms, initROTMode } from './modes/rot.js';
import { applyBionicFormatting } from './modes/bionic.js';
import { initSettings } from './ui/settings.js?v=8';
import { handleSlopify } from './ai/slopify.js';
import { SourceManager } from './sources/manager.js';

let wakeLock = null;
let tocCollapsed = true;
let pagedTouchStartX = 0;
let pagedTouchStartY = 0;
let pagedSnapTimer = null;
let libraryProgressTimer = null;
let suppressLibrarySave = false;

// ── File Handle Store (IndexedDB) ────────────────────────────────────────────
const FH_DB_NAME = 'readrot-fh';
const FH_DB_STORE = 'handles';
const LIBRARY_DB_NAME = 'readrot-library';
const LIBRARY_DB_STORE = 'items';

function openFHDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FH_DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(FH_DB_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveFileHandle(fileId, handle) {
  try {
    const db = await openFHDB();
    const tx = db.transaction(FH_DB_STORE, 'readwrite');
    tx.objectStore(FH_DB_STORE).put(handle, fileId);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch (e) {
    console.warn('Could not store file handle:', e);
  }
}

async function getFileHandle(fileId) {
  try {
    const db = await openFHDB();
    const tx = db.transaction(FH_DB_STORE, 'readonly');
    const handle = await new Promise((res, rej) => {
      const req = tx.objectStore(FH_DB_STORE).get(fileId);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return handle || null;
  } catch (e) {
    return null;
  }
}

function openLibraryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LIBRARY_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(LIBRARY_DB_STORE)) {
        db.createObjectStore(LIBRARY_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getLibraryItem(id) {
  if (!id) return null;
  const db = await openLibraryDB();
  try {
    const tx = db.transaction(LIBRARY_DB_STORE, 'readonly');
    return await new Promise((resolve, reject) => {
      const req = tx.objectStore(LIBRARY_DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function getLibraryItems() {
  const db = await openLibraryDB();
  try {
    const tx = db.transaction(LIBRARY_DB_STORE, 'readonly');
    const items = await new Promise((resolve, reject) => {
      const req = tx.objectStore(LIBRARY_DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return items.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
  } finally {
    db.close();
  }
}

async function putLibraryItem(item) {
  const db = await openLibraryDB();
  try {
    const tx = db.transaction(LIBRARY_DB_STORE, 'readwrite');
    tx.objectStore(LIBRARY_DB_STORE).put(item);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function deleteLibraryItem(id) {
  const db = await openLibraryDB();
  try {
    const tx = db.transaction(LIBRARY_DB_STORE, 'readwrite');
    tx.objectStore(LIBRARY_DB_STORE).delete(id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function clearLibraryItems() {
  const db = await openLibraryDB();
  try {
    const tx = db.transaction(LIBRARY_DB_STORE, 'readwrite');
    tx.objectStore(LIBRARY_DB_STORE).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Build a stable ID for a file based on its name + size + lastModified. */
function makeFileId(file) {
  return `file::${file.name}::${file.size}::${file.lastModified}`;
}

function makePasteId() {
  return `paste::${Date.now()}::${Math.random().toString(36).slice(2)}`;
}

function setLoadIndicator(text = '', visible = false) {
  const el = document.getElementById('load-indicator');
  if (!el) {
    return;
  }
  el.textContent = text;
  el.classList.toggle('hidden', !visible);
}

function getFileExtension(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext && ext !== file.name.toLowerCase()) {
    return ext;
  }

  const mime = (file.type || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('epub')) return 'epub';
  if (mime.includes('markdown')) return 'md';
  if (mime.includes('html')) return 'html';
  if (mime.includes('xml')) return 'xml';
  if (mime.includes('json')) return 'json';
  if (mime.startsWith('text/')) return 'txt';
  return '';
}

function isCompactLayout() {
  return window.matchMedia('(max-width: 900px), (orientation: portrait)').matches;
}

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  AppState.ai.provider = localStorage.getItem('readrot-ai-provider') || AppState.ai.provider;

  initSettings({
    onVisualChange: () => {
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
    },
    onTraversalChange: () => {
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
    },
    onFullscreen: () => toggleFullscreen(),
    onKeepAwakeChange: () => syncWakeLock(),
    onHistoryChange: () => syncHistoryAvailability(),
  });

  registerServiceWorker();
  bindToolbar();
  bindFileInput();
  bindDropZone();
  bindKeyboardShortcuts();
  bindScrollProgress();
  bindPagedTraversal();
  bindSearchHub();
  bindIntralinks();
  bindPasteHub();
  bindLibraryHub();
  bindWakeLockLifecycle();
  window.addEventListener('resize', syncTOCVisibility);

  const modeSwitcher = document.getElementById('mode-switcher');
  modeSwitcher.addEventListener('change', (e) => {
    AppState.mode = e.target.value;
    if (AppState.mode === 'rot') {
      AppState.rot.active = true;
    } else {
      AppState.rot.active = false;
    }
    updateModeUI();
  });

  updateModeUI();
  syncWakeLock();
  syncHistoryAvailability();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

async function syncWakeLock() {
  const shouldKeepAwake = !!AppState.settings.keepAwake && document.visibilityState === 'visible';

  if (!shouldKeepAwake || !('wakeLock' in navigator)) {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (_) {
        // The browser may have already released the lock.
      }
      wakeLock = null;
    }
    return;
  }

  if (wakeLock) {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (error) {
    console.warn('Screen Wake Lock unavailable:', error);
  }
}

function bindWakeLockLifecycle() {
  document.addEventListener('visibilitychange', () => {
    syncWakeLock();
  });

  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      syncWakeLock();
    }, { passive: true });
  });
}

function bindToolbar() {
  const uploadTrigger = document.getElementById('upload-trigger');
  const uploadMenu = document.getElementById('upload-menu');
  const closeUploadMenu = () => {
    uploadMenu?.classList.add('hidden');
    uploadTrigger?.setAttribute('aria-expanded', 'false');
  };
  const toggleUploadMenu = () => {
    const isOpen = !uploadMenu?.classList.contains('hidden');
    uploadMenu?.classList.toggle('hidden', isOpen);
    uploadTrigger?.setAttribute('aria-expanded', String(!isOpen));
  };

  uploadTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUploadMenu();
  });

  document.getElementById('upload-file-action')?.addEventListener('click', () => {
    closeUploadMenu();
    document.getElementById('upload-btn').click();
  });

  document.getElementById('upload-paste-action')?.addEventListener('click', () => {
    closeUploadMenu();
    document.getElementById('paste-trigger')?.click();
  });

  document.getElementById('upload-search-action')?.addEventListener('click', () => {
    closeUploadMenu();
    document.getElementById('search-trigger')?.click();
  });

  document.getElementById('drop-upload-trigger')?.addEventListener('click', () => {
    document.getElementById('upload-btn').click();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('.upload-menu')) {
      closeUploadMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUploadMenu();
    }
  });

  document.getElementById('toc-toggle')?.addEventListener('click', () => {
    tocCollapsed = !tocCollapsed;
    syncTOCVisibility();
  });

  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    tocCollapsed = !tocCollapsed;
    syncTOCVisibility();
  });

  document.addEventListener('click', (e) => {
    if (!isCompactLayout() || tocCollapsed) {
      return;
    }
    const target = e.target;
    const clickedTOC = target.closest?.('#toc-sidebar, #toc-toggle, #mobile-menu-btn');
    if (!clickedTOC) {
      tocCollapsed = true;
      syncTOCVisibility();
    }
  });

  document.getElementById('prev-chapter').addEventListener('click', () => {
    navigateChapter(-1);
  });

  document.getElementById('next-chapter').addEventListener('click', () => {
    navigateChapter(1);
  });

  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    toggleFullscreen();
  });

  document.getElementById('hide-toolbar-btn').addEventListener('click', () => {
    AppState.settings.hideToolbar = !AppState.settings.hideToolbar;
    const checkbox = document.getElementById('hide-toolbar-setting');
    if (checkbox) {
      checkbox.checked = AppState.settings.hideToolbar;
    }
    saveSettings();
  });

  document.getElementById('restore-toolbar-btn').addEventListener('click', () => {
    AppState.settings.hideToolbar = false;
    const checkbox = document.getElementById('hide-toolbar-setting');
    if (checkbox) {
      checkbox.checked = false;
    }
    saveSettings();
  });

  document.getElementById('ai-btn').addEventListener('change', async (e) => {
    const mode = e.target.value;
    if (!mode) {
      return;
    }
    await handleSlopify(mode);
    e.target.value = '';
  });

  initROTMode(
    () => {
      if (AppState.mode !== 'rot') {
        AppState.rot.active = false;
        return;
      }
      AppState.rot.active = true;
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
    },
    () => {
      AppState.rot.active = false;
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
    },
  );
}

function syncHistoryAvailability() {
  const enabled = AppState.settings.historyEnabled !== false;
  document.getElementById('library-trigger')?.classList.toggle('hidden', !enabled);
  if (!enabled) {
    document.getElementById('library-overlay')?.classList.remove('visible');
  }
}

function syncTOCVisibility() {
  const hasChapters = AppState.chapters.length > 0;
  const sidebar = document.getElementById('toc-sidebar');
  const desktopToggle = document.getElementById('toc-toggle');
  const mobileToggle = document.getElementById('mobile-menu-btn');
  const mobileArrow = tocCollapsed ? '›' : '‹';

  desktopToggle?.classList.toggle('available', hasChapters);
  desktopToggle?.classList.toggle('active', hasChapters && !tocCollapsed);
  mobileToggle?.classList.toggle('hidden', !hasChapters);
  mobileToggle?.classList.toggle('active', hasChapters && !tocCollapsed);
  if (mobileToggle) {
    mobileToggle.textContent = isCompactLayout() ? mobileArrow : 'Contents';
    mobileToggle.setAttribute('aria-label', tocCollapsed ? 'Open contents' : 'Close contents');
    mobileToggle.title = tocCollapsed ? 'Open contents' : 'Close contents';
  }

  if (!hasChapters || tocCollapsed) {
    sidebar?.classList.add('hidden');
    sidebar?.classList.remove('visible');
    return;
  }

  sidebar?.classList.remove('hidden');
  sidebar?.classList.add('visible');
}

/* Removed history feature.
function renderHistory() {
  const list = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  const items = AppState.history || [];

  count.textContent = `${items.length} items`;

  if (items.length === 0) {
    list.innerHTML = '<div class="empty-history">Your reading history is empty.</div>';
    return;
  }

  list.innerHTML = items.map((item, idx) => {
    const date = new Date(item.lastRead).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const badgeClass = item.type === 'paste' ? 'badge-paste' : 'badge-file';
    const actionLabel = item.type === 'paste' ? 'Resume →' : 'Open file →';

    return `
      <div class="history-item" data-index="${idx}">
        <div class="history-item-info">
          <div class="history-item-title">${item.title}</div>
          <div class="history-item-meta">
            <span class="history-badge ${badgeClass}">${item.type}</span>
            <span>${date}</span>
            <span>Ch. ${item.chapter + 1}</span>
          </div>
        </div>
        <div style="font-size:0.8rem; color:var(--accent);">${actionLabel}</div>
      </div>
    `;
  }).join('');

  // Add click listeners to items
  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      const item = AppState.history[idx];
      resumeFromHistory(item);
      document.getElementById('history-overlay').classList.remove('visible');
    });
  });
}

async function resumeFromHistory(item) {
  if (item.type === 'paste' && item.content) {
    await handlePastedText(item.content, item.title, true);
    AppState.currentChapter = item.chapter || 0;
    renderClassicReader();
    if (item.scrollTop) {
      requestAnimationFrame(() => {
        document.getElementById('reader-area').scrollTop = item.scrollTop;
      });
    }
    return;
  }

  // ── File resume ─────────────────────────────────────────────────────────────
  // Set resume target so handleFile restores chapter + scroll after parsing.
  AppState.resumeTarget = {
    fileId: item.fileId,
    title: item.title,
    chapter: item.chapter,
    scrollTop: item.scrollTop,
  };

  // 1. Try the stored FileSystemFileHandle (Chromium only).
  if (item.fileId) {
    const handle = await getFileHandle(item.fileId);
    if (handle) {
      let perm = 'prompt';
      try {
        perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          perm = await handle.requestPermission({ mode: 'read' });
        }
      } catch (_) {
        perm = 'denied';
      }
      if (perm === 'granted') {
        try {
          const file = await handle.getFile();
          await handleFile(file);
          return;
        } catch (e) {
          console.warn('Stored handle stale, falling back to picker:', e);
        }
      }
    }
  }

  // 2. Fallback: open file picker (File System Access API).
  if (window.showOpenFilePicker) {
    setLoadIndicator(`Locate "${item.title}" to resume…`, true);
    try {
      const [handle] = await window.showOpenFilePicker({
        id: 'readrot-resume',
        startIn: 'documents',
        types: [{
          description: 'Book files',
          accept: {
            'application/epub+zip': ['.epub'],
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt', '.md', '.markdown'],
            'text/html': ['.html', '.htm'],
          },
        }],
      });
      // Persist for future opens.
      if (item.fileId) await saveFileHandle(item.fileId, handle);
      const file = await handle.getFile();
      await handleFile(file);
    } catch (e) {
      // User cancelled or picker unavailable.
      setLoadIndicator('', false);
      AppState.resumeTarget = null;
    }
    return;
  }

  // 3. Last resort: tell user to re-upload.
  setLoadIndicator(`Re-upload "${item.title}" via Upload to resume.`, true);
  setTimeout(() => setLoadIndicator('', false), 5000);
  AppState.resumeTarget = null;
}

*/
function bindPasteHub() {
  const pasteTrigger = document.getElementById('paste-trigger');
  const pasteOverlay = document.getElementById('paste-overlay');
  const closePasteBtn = document.getElementById('close-paste-btn');
  const startPasteReadBtn = document.getElementById('start-paste-read-btn');
  const pasteInput = document.getElementById('paste-input');
  const pasteTitleInput = document.getElementById('paste-title-input');

  pasteTrigger.addEventListener('click', () => {
    pasteOverlay.classList.add('visible');
    pasteInput.focus();
  });

  closePasteBtn.addEventListener('click', () => {
    pasteOverlay.classList.remove('visible');
  });

  pasteOverlay.addEventListener('click', (e) => {
    if (e.target === pasteOverlay) {
      pasteOverlay.classList.remove('visible');
    }
  });

  startPasteReadBtn.addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) return;

    const title = pasteTitleInput.value.trim() || 'Pasted Text';
    handlePastedText(text, title);
    pasteOverlay.classList.remove('visible');
    
    // Clear the inputs for next use
    pasteInput.value = '';
    pasteTitleInput.value = '';
  });
}

async function handlePastedText(text, title, isResume = false, options = {}) {
  clearResources();
  document.getElementById('drop-zone').classList.add('hidden');
  setLoadIndicator(`Readying your text...`, true);

  const libraryId = options.libraryItem?.id || makePasteId();
  AppState.book = { name: title, libraryId, kind: 'paste' };
  
  // Create a virtual chapter
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<p>${line}</p>`)
    .join('');

  const chapter = {
    title: title,
    content: safeText,
    originalContent: text, // Store raw text for re-parsing if needed
    href: 'paste://virtual-chapter-1'
  };

  AppState.chapters = [chapter];
  AppState.currentChapter = Number.isInteger(options.libraryItem?.chapter) ? options.libraryItem.chapter : 0;
  AppState.rsvp.index = Number.isInteger(options.libraryItem?.rsvpIndex) ? options.libraryItem.rsvpIndex : 0;
  tocCollapsed = isCompactLayout();
  
  saveReaderState();
  renderClassicReader();
  
  if (AppState.mode === 'rsvp') {
    initRSVPMode(getActiveRSVPText());
  }
  
  if (!isResume) {
    updateHistoryProgress();
  }

  if (options.libraryItem?.scrollTop) {
    requestAnimationFrame(() => {
      document.getElementById('reader-area').scrollTop = options.libraryItem.scrollTop;
    });
  }

  if (!suppressLibrarySave && AppState.settings.historyEnabled !== false) {
    try {
      await putLibraryItem({
        ...(options.libraryItem || {}),
        id: libraryId,
        kind: 'paste',
        title,
        textContent: text,
        chapter: AppState.currentChapter,
        scrollTop: document.getElementById('reader-area').scrollTop || 0,
        rsvpIndex: AppState.rsvp.index || 0,
        lastReadAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to store pasted text in History.', error);
      alert('This text is readable now, but it could not be saved to History.');
    }
  }
  
  setLoadIndicator('', false);
}

function bindSearchHub() {
  const trigger = document.getElementById('search-trigger');
  const overlay = document.getElementById('search-overlay');
  const closeBtn = document.getElementById('close-search-btn');
  const clearBtn = document.getElementById('clear-search-btn');
  const searchInput = document.getElementById('universal-search-input');
  const grid = document.getElementById('source-grid');
  const directUrlInput = document.getElementById('direct-url-input');
  const directLoadBtn = document.getElementById('direct-load-btn');

  const openHub = () => {
    overlay.classList.add('visible');
    renderSources();
  };

  const closeHub = () => {
    overlay.classList.remove('visible');
  };

  const renderSources = () => {
    const query = searchInput.value.trim();
    grid.innerHTML = '';
    
    SourceManager.Providers.forEach(provider => {
      const card = document.createElement('div');
      card.className = 'source-card';
      card.innerHTML = `
        <h4>${provider.name}</h4>
        <p>${provider.description}</p>
        <div class="source-tags">
          ${provider.categories.map(cat => `<span class="source-tag">${cat}</span>`).join('')}
        </div>
      `;
      
      card.addEventListener('click', () => {
        const url = SourceManager.getSearchUrl(provider.id, query || 'books');
        window.open(url, '_blank');
      });
      
      grid.appendChild(card);
    });
  };

  trigger?.addEventListener('click', openHub);
  closeBtn?.addEventListener('click', closeHub);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeHub();
  });

  searchInput?.addEventListener('input', renderSources);
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    renderSources();
  });

  directLoadBtn?.addEventListener('click', async () => {
    const url = directUrlInput.value.trim();
    if (!url) return;

    setLoadIndicator('Attempting to fetch book...', true);
    try {
      const buffer = await SourceManager.fetchFromUrl(url);
      const fileName = url.split('/').pop() || 'downloaded-book';
      const file = new File([buffer], fileName, { type: 'application/octet-stream' });
      await handleFile(file);
      closeHub();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoadIndicator('', false);
    }
  });
}

function bindFileInput() {
  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.addEventListener('change', async (e) => {
    if (e.target.files.length) {
      await handleFile(e.target.files[0]);
    }
  });
}

function bindDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const uploadInput = document.getElementById('upload-btn');
  let dragDepth = 0;

  const openFilePicker = () => {
    uploadInput?.click();
  };

  dropZone.addEventListener('click', (e) => {
    const interactive = e.target.closest('a, button, input, select, textarea');
    if (interactive) {
      return;
    }
    openFilePicker();
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  });

  const hasFiles = (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  };

  const showDropOverlay = () => {
    dropZone.classList.remove('hidden');
    dropZone.classList.add('dragover');
  };

  const hideDropOverlay = () => {
    dropZone.classList.remove('dragover');
    if (AppState.chapters.length > 0) {
      dropZone.classList.add('hidden');
    }
  };

  const onDragEnter = (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    dragDepth += 1;
    showDropOverlay();
  };

  const onDragOver = (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    showDropOverlay();
  };

  const onDragLeave = (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      hideDropOverlay();
    }
  };

  const onDrop = async (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    dragDepth = 0;
    hideDropOverlay();
    if (e.dataTransfer.files.length) {
      await handleFile(e.dataTransfer.files[0]);
    }
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      if (hasFiles(e)) {
        e.preventDefault();
      }
    });
  });

  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);

  dropZone.addEventListener('dragenter', onDragEnter);
  dropZone.addEventListener('dragover', onDragOver);
  dropZone.addEventListener('dragleave', onDragLeave);
  dropZone.addEventListener('drop', onDrop);
}

function bindIntralinks() {
  const readerArea = document.getElementById('reader-area');
  readerArea.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Handle internal anchors (starts with #)
    if (href.startsWith('#')) {
      e.preventDefault();
      scrollToId(href.substring(1));
      return;
    }

    // Handle cross-chapter or external-to-internal links
    // typical EPUB href="chapter1.xhtml#part2"
    const [path, hash] = href.split('#');
    if (!path.includes('://') && path.trim().length > 0) {
      // Find chapter by href
      const chapterIdx = AppState.chapters.findIndex(c => 
        c.href === path || 
        c.href.endsWith('/' + path) || 
        path.endsWith('/' + c.href)
      );

      if (chapterIdx !== -1) {
        e.preventDefault();
        AppState.currentChapter = chapterIdx;
        saveReaderState();
        renderClassicReader();
        
        if (hash) {
          // Wait for render to complete
          setTimeout(() => scrollToId(hash), 50);
        }
      }
    }
  });
}

function scrollToId(id) {
  const readerArea = document.getElementById('reader-area');
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    // Fallback: search within the chapter panel if multi-panel mode
    const panel = document.querySelector(`.chapter-panel [id="${id}"]`);
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function bindScrollProgress() {
  const readerArea = document.getElementById('reader-area');
  readerArea.addEventListener('scroll', () => {
    if (AppState.mode !== 'classic' && AppState.mode !== 'rot' && AppState.mode !== 'bionic') {
      return;
    }

    const max = Math.max(1, readerArea.scrollHeight - readerArea.clientHeight);
    const pct = Math.max(0, Math.min(100, (readerArea.scrollTop / max) * 100));
    AppState.progress.scrollPercent = pct;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    scheduleLibraryProgressUpdate();

    if (AppState.settings.chapterMode === 'divided' && AppState.settings.traversalMode === 'scroll') {
      setChapterScroll(AppState.currentChapter, readerArea.scrollTop);
      saveReaderState();
      saveProgress(AppState.book?.name, AppState.currentChapter, AppState.rsvp.index, readerArea.scrollTop);
      updateHistoryProgress();
    }
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }
    if (tag === 'SELECT' && !['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (AppState.mode === 'rsvp') {
          skipForward(10);
        } else {
          navigateByArrow('right');
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (AppState.mode === 'rsvp') {
          skipBackward(10);
        } else {
          navigateByArrow('left');
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        increaseWPM(25);
        break;
      case 'ArrowDown':
        e.preventDefault();
        decreaseWPM(25);
        break;
      case 'r': {
        const modeSelect = document.getElementById('mode-switcher');
        if (modeSelect.value === 'rot') {
          modeSelect.value = 'classic';
          AppState.rot.active = false;
        } else {
          modeSelect.value = 'rot';
          AppState.rot.active = true;
        }
        modeSelect.dispatchEvent(new Event('change'));
        break;
      }
      case 'f':
        toggleFullscreen();
        break;
      case 't':
      case 'T': {
        AppState.settings.hideToolbar = !AppState.settings.hideToolbar;
        const checkbox = document.getElementById('hide-toolbar-setting');
        if (checkbox) {
          checkbox.checked = AppState.settings.hideToolbar;
        }
        saveSettings();
        break;
      }
      case 'Escape':
        document.getElementById('toc-sidebar')?.classList.remove('visible');
        document.getElementById('settings-drawer')?.classList.remove('visible');
        break;
      default:
        break;
    }
  });
}

function navigateByArrow(direction) {
  if (AppState.settings.traversalMode !== 'scroll' && pageHorizontal(direction)) {
    return;
  }
  const isRTL = AppState.settings.traversalMode === 'rtl';
  const delta = direction === 'right' ? (isRTL ? -1 : 1) : (isRTL ? 1 : -1);
  navigateChapter(delta);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function navigateChapter(delta) {
  if (!AppState.chapters.length) {
    return;
  }

  const nextIndex = Math.max(0, Math.min(AppState.chapters.length - 1, AppState.currentChapter + delta));
  if (nextIndex === AppState.currentChapter) {
    return;
  }

  AppState.currentChapter = nextIndex;
  saveReaderState();
  renderClassicReader();
  if (AppState.mode === 'rsvp') {
    initRSVPMode(getActiveRSVPText());
  }
  updateHistoryProgress();
}

function getPagedPanel() {
  if (AppState.settings.traversalMode === 'scroll') {
    return null;
  }
  return document.querySelector('#classic-reader.horizontal .chapter-panel');
}

function pageHorizontal(direction) {
  const panel = getPagedPanel();
  if (!panel) {
    return false;
  }

  const isRTL = AppState.settings.traversalMode === 'rtl';
  const pageWidth = Math.max(1, panel.clientWidth);
  const maxScroll = Math.max(0, panel.scrollWidth - panel.clientWidth);
  const visualForward = direction === 'right';
  const sign = visualForward === !isRTL ? 1 : -1;
  const nextLeft = Math.max(0, Math.min(maxScroll, panel.scrollLeft + sign * pageWidth));

  if (Math.abs(nextLeft - panel.scrollLeft) > 2) {
    panel.scrollTo({ left: nextLeft, behavior: 'smooth' });
    schedulePagedSnap(panel, 45);
    updateHistoryProgress();
    return true;
  }

  navigateChapter(sign > 0 ? 1 : -1);
  return true;
}

function snapPagedPanel(panel = getPagedPanel()) {
  if (!panel || AppState.settings.traversalMode === 'scroll') {
    return;
  }
  const pageWidth = Math.max(1, panel.clientWidth);
  const maxScroll = Math.max(0, panel.scrollWidth - panel.clientWidth);
  const snapLeft = Math.max(0, Math.min(maxScroll, Math.round(panel.scrollLeft / pageWidth) * pageWidth));
  if (Math.abs(snapLeft - panel.scrollLeft) > 2) {
    panel.scrollTo({ left: snapLeft, behavior: 'smooth' });
  }
}

function schedulePagedSnap(panel = getPagedPanel(), delay = 45) {
  clearTimeout(pagedSnapTimer);
  pagedSnapTimer = setTimeout(() => snapPagedPanel(panel), delay);
}

function bindPagedTraversal() {
  const readerArea = document.getElementById('reader-area');
  readerArea.addEventListener('scroll', () => {
    schedulePagedSnap();
  }, { passive: true });

  readerArea.addEventListener('touchstart', (event) => {
    if (AppState.settings.traversalMode === 'scroll' || event.touches.length !== 1) {
      return;
    }
    pagedTouchStartX = event.touches[0].clientX;
    pagedTouchStartY = event.touches[0].clientY;
  }, { passive: true });

  readerArea.addEventListener('touchend', (event) => {
    if (AppState.settings.traversalMode === 'scroll' || !event.changedTouches.length) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - pagedTouchStartX;
    const dy = touch.clientY - pagedTouchStartY;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.25) {
      schedulePagedSnap(undefined, 30);
      return;
    }
    pageHorizontal(dx < 0 ? 'right' : 'left');
  }, { passive: true });
}

function cleanDisplayText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripExtension(fileName = '') {
  return cleanDisplayText(fileName).replace(/\.[^.]+$/, '');
}

function titleKey(value) {
  return cleanDisplayText(value).toLocaleLowerCase();
}

function normalizeChapterTitles(chapters, bookName = '') {
  const bookTitle = titleKey(stripExtension(bookName));
  const counts = chapters.reduce((acc, chapter) => {
    const key = titleKey(chapter.title);
    if (key) {
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  return chapters.map((chapter, idx) => {
    const rawTitle = cleanDisplayText(chapter.title);
    const key = titleKey(rawTitle);
    const titleLooksLikeBook = bookTitle && key === bookTitle;
    const titleIsRepeated = key && counts[key] > 1;
    const title = !rawTitle || titleLooksLikeBook || titleIsRepeated
      ? `Chapter ${idx + 1}`
      : rawTitle;

    return {
      ...chapter,
      title,
    };
  });
}

function formatBytes(bytes = 0) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatLibraryDate(value) {
  if (!value) return 'Never opened';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLibraryProgressLabel(item) {
  const chapter = Number.isInteger(item.chapter) ? item.chapter + 1 : 1;
  return `Ch. ${chapter}`;
}

function bindLibraryHub() {
  const trigger = document.getElementById('library-trigger');
  const overlay = document.getElementById('library-overlay');
  const closeBtn = document.getElementById('close-library-btn');
  const clearBtn = document.getElementById('clear-library-btn');

  const close = () => overlay?.classList.remove('visible');
  const open = async () => {
    if (AppState.settings.historyEnabled === false) {
      return;
    }
    await renderLibrary();
    overlay?.classList.add('visible');
  };

  trigger?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  clearBtn?.addEventListener('click', async () => {
    if (!confirm('Clear all locally stored History items?')) return;
    try {
      await clearLibraryItems();
      await renderLibrary();
    } catch (error) {
      console.error('Failed to clear History.', error);
      alert('Could not clear History.');
    }
  });
}

async function renderLibrary() {
  const list = document.getElementById('library-list');
  const count = document.getElementById('library-count');
  if (!list || !count) return;

  let items = [];
  try {
    items = await getLibraryItems();
  } catch (error) {
    console.error('Failed to read History.', error);
    list.innerHTML = '<div class="empty-library">Could not open History.</div>';
    count.textContent = '0 items';
    return;
  }

  count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    list.innerHTML = '<div class="empty-library">Your History is empty.</div>';
    return;
  }

  list.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'library-item';
    row.dataset.id = item.id;

    const badge = item.kind === 'paste' ? 'Pasted Text' : (item.fileName || '').split('.').pop()?.toUpperCase() || 'File';
    const detail = item.kind === 'paste'
      ? `${(item.textContent || '').length.toLocaleString()} chars`
      : formatBytes(item.size);

    row.innerHTML = `
      <div class="library-item-main">
        <div class="library-item-title"></div>
        <div class="library-item-meta">
          <span class="library-badge">${badge}</span>
          <span>${detail}</span>
          <span>${getLibraryProgressLabel(item)}</span>
          <span>${formatLibraryDate(item.lastReadAt)}</span>
        </div>
      </div>
      <div class="library-item-actions">
        <button class="library-open" type="button">Open</button>
        <button class="library-delete" type="button">Delete</button>
      </div>
    `;
    row.querySelector('.library-item-title').textContent = item.title || item.fileName || 'Untitled';
    row.querySelector('.library-open').addEventListener('click', () => openLibraryItem(item.id));
    row.querySelector('.library-delete').addEventListener('click', async () => {
      try {
        await deleteLibraryItem(item.id);
        await renderLibrary();
      } catch (error) {
        console.error('Failed to delete History item.', error);
        alert('Could not delete this History item.');
      }
    });
    row.addEventListener('dblclick', () => openLibraryItem(item.id));
    list.appendChild(row);
  });
}

async function openLibraryItem(id) {
  const overlay = document.getElementById('library-overlay');
  let item = null;
  try {
    item = await getLibraryItem(id);
  } catch (error) {
    console.error('Failed to open History item.', error);
  }

  if (!item) {
    alert('This History item could not be found.');
    await renderLibrary();
    return;
  }

  overlay?.classList.remove('visible');
  suppressLibrarySave = true;
  AppState.resumeTarget = {
    libraryId: item.id,
    fileId: item.fileId || item.id,
    title: item.title || item.fileName,
    chapter: item.chapter || 0,
    scrollTop: item.scrollTop || 0,
    rsvpIndex: item.rsvpIndex || 0,
  };

  try {
    if (item.kind === 'paste') {
      await handlePastedText(item.textContent || '', item.title || 'Pasted Text', true, { libraryItem: item });
    } else {
      const file = new File([item.blob], item.fileName || item.title || 'book', {
        type: item.mimeType || 'application/octet-stream',
        lastModified: item.lastModified || Date.now(),
      });
      await handleFile(file, { libraryItem: item });
    }
  } catch (error) {
    console.error('Failed to open History item.', error);
    alert('Could not open this History item.');
  } finally {
    suppressLibrarySave = false;
    scheduleLibraryProgressUpdate(0);
  }
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleFile(file, options = {}) {
  clearResources();
  document.getElementById('drop-zone').classList.add('hidden');
  setLoadIndicator(`Loading ${file.name}...`, true);
  const arrayBuffer = await file.arrayBuffer();

  const fileId = options.libraryItem?.fileId || makeFileId(file);
  const libraryId = options.libraryItem?.id || fileId;
  AppState.book = { name: file.name, fileId, libraryId, kind: 'file' };

  // Persist the FileSystemFileHandle in IndexedDB when available (drag-and-drop
  // or upload via <input> don't give us a handle, so we skip it here).
  // Uploads and drops do not expose a reusable file handle.

  const ext = getFileExtension(file);
  let parsed = { chapters: [], toc: [] };

  try {
    if (ext === 'pdf') {
      parsed = await parsePDF(arrayBuffer, (page, total) => {
        setLoadIndicator(`Parsing PDF ${page}/${total}`, true);
      });
    } else if (ext === 'epub') {
      parsed = await parseEPUB(arrayBuffer, (idx, total) => {
        setLoadIndicator(`Parsing EPUB ${idx}/${total}`, true);
      }, AppState.resources);
    } else {
      parsed = await parseTextFormats(arrayBuffer, file.name);
    }
  } catch (error) {
    console.error('Failed to parse file.', error);
    const dropZone = document.getElementById('drop-zone');
    dropZone.classList.remove('hidden');
    dropZone.classList.remove('dragover');
    dropZone.innerHTML = `
      <h2 style="font-family:var(--font-main); margin-bottom:0.25rem;">Could not open this file</h2>
      <p style="margin:0.2rem 0; color:var(--text-muted);">Try another EPUB or export to PDF/TXT and re-import.</p>
      <p style="margin:0.4rem 0 0; color:var(--text-muted);">Technical detail: parser failed for ${file.name}</p>
    `;
    setLoadIndicator('', false);
    return;
  }

  const parsedChapters = (parsed.chapters || []).map((chapter, idx) => ({
    title: chapter.title || `Chapter ${idx + 1}`,
    content: chapter.content || '<p></p>',
    originalContent: chapter.originalContent || chapter.content || '<p></p>',
    href: chapter.href || '',
  })).filter((chapter) => (chapter.content || '').trim().length > 0);

  AppState.chapters = normalizeChapterTitles(parsedChapters, file.name);
  tocCollapsed = isCompactLayout();

  if (!AppState.chapters.length) {
    AppState.chapters = [{
      title: 'Chapter 1',
      content: '<p>No readable content found in this file.</p>',
      originalContent: '<p>No readable content found in this file.</p>',
    }];
    tocCollapsed = isCompactLayout();
  }

  AppState.toc = parsed.toc || [];

  const libraryItem = options.libraryItem || (AppState.settings.historyEnabled !== false ? await getLibraryItem(libraryId).catch(() => null) : null);
  const resumed = libraryItem || restoreProgress(file.name);
  if (libraryItem) {
    AppState.currentChapter = Number.isInteger(libraryItem.chapter) ? libraryItem.chapter : 0;
    AppState.rsvp.index = Number.isInteger(libraryItem.rsvpIndex) ? libraryItem.rsvpIndex : 0;
  } else if (!resumed) {
    AppState.currentChapter = 0;
    AppState.rsvp.index = 0;
  }

  renderTOC();
  renderClassicReader();
  updateModeUI();

  if (libraryItem?.scrollTop) {
    requestAnimationFrame(() => {
      document.getElementById('reader-area').scrollTop = libraryItem.scrollTop;
    });
  }

  if (!suppressLibrarySave && AppState.settings.historyEnabled !== false) {
    try {
      await putLibraryItem({
        ...(libraryItem || {}),
        id: libraryId,
        kind: 'file',
        title: file.name,
        fileName: file.name,
        fileId,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        lastModified: file.lastModified,
        blob: file,
        chapter: AppState.currentChapter,
        scrollTop: libraryItem?.scrollTop || document.getElementById('reader-area').scrollTop || 0,
        rsvpIndex: AppState.rsvp.index || 0,
        lastReadAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to store file in History.', error);
      alert('This book is readable now, but it could not be saved to History.');
    }
  }

  // Legacy resume target support for older sessions.
  const rt = AppState.resumeTarget;
  if (rt && (rt.fileId === fileId || (!rt.fileId && rt.title === file.name))) {
    if (Number.isInteger(rt.chapter)) {
      AppState.currentChapter = rt.chapter;
      renderClassicReader();
    }
    if (rt.scrollTop) {
      requestAnimationFrame(() => {
        document.getElementById('reader-area').scrollTop = rt.scrollTop;
      });
    }
    AppState.resumeTarget = null;
  }

  updateHistoryProgress();
  setLoadIndicator('', false);
}

function updateHistoryProgress() {
  scheduleLibraryProgressUpdate();
}

function scheduleLibraryProgressUpdate(delay = 250) {
  if (!AppState.book?.libraryId || suppressLibrarySave || AppState.settings.historyEnabled === false) return;
  clearTimeout(libraryProgressTimer);
  libraryProgressTimer = setTimeout(() => {
    updateLibraryProgress().catch((error) => {
      console.warn('Could not update History progress:', error);
    });
  }, delay);
}

async function updateLibraryProgress() {
  if (!AppState.book?.libraryId || suppressLibrarySave || AppState.settings.historyEnabled === false) return;
  const item = await getLibraryItem(AppState.book.libraryId);
  if (!item) return;

  const readerArea = document.getElementById('reader-area');
  await putLibraryItem({
    ...item,
    chapter: AppState.currentChapter,
    scrollTop: readerArea?.scrollTop || 0,
    rsvpIndex: AppState.rsvp.index || 0,
    lastReadAt: Date.now(),
  });
}

function getChapterHTML(index, includeHeading = true) {
  const chapter = AppState.chapters[index];
  if (!chapter) {
    return '';
  }

  const canonicalSource = chapter.originalContent || chapter.content || '';

  let source = canonicalSource;
  if (AppState.mode === 'rot' && AppState.rot.active) {
    source = applyROTTransforms(canonicalSource, AppState.rot.intensity, AppState.rot.transforms);
  } else if (AppState.mode === 'bionic') {
    source = applyBionicFormatting(canonicalSource);
  }

  if (!includeHeading) {
    return source;
  }

  return `<h2>${escapeHTML(chapter.title || `Chapter ${index + 1}`)}</h2>${source}`;
}

function renderTOC() {
  const container = document.getElementById('toc-list');
  container.innerHTML = '';
  syncTOCVisibility();

  if (!AppState.chapters.length) {
    return;
  }

  AppState.chapters.forEach((chapter, idx) => {
    const button = document.createElement('button');
    button.className = 'toc-item';
    button.classList.toggle('active', idx === AppState.currentChapter);
    button.textContent = chapter.title || `Chapter ${idx + 1}`;
    button.addEventListener('click', () => {
      AppState.currentChapter = idx;
      saveReaderState();
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
      if (isCompactLayout()) {
        document.getElementById('toc-sidebar')?.classList.remove('visible');
      }
    });
    container.appendChild(button);
  });
  syncTOCVisibility();
}

function renderClassicReader() {
  const classic = document.getElementById('classic-reader');
  const readerArea = document.getElementById('reader-area');

  if (!AppState.chapters.length) {
    classic.innerHTML = '';
    updateChapterIndicator();
    return;
  }

  const traversal = AppState.settings.traversalMode;
  const chapterMode = AppState.settings.chapterMode;

  classic.classList.remove('horizontal', 'rtl');
  readerArea.classList.toggle('paged', traversal !== 'scroll');

  if (traversal === 'scroll') {
    readerArea.scrollTop = 0;
    const indices = [AppState.currentChapter];

    classic.innerHTML = indices.map((idx) => {
      const body = getChapterHTML(idx, chapterMode === 'continuous');
      return `<section>${body}</section>${chapterMode === 'continuous' ? '<div class="chapter-divider"></div>' : ''}`;
    }).join('');

    if (chapterMode === 'divided') {
      const stored = getChapterScroll(AppState.currentChapter);
      readerArea.scrollTop = stored;
    }
  } else {
    readerArea.scrollTop = 0;
    classic.classList.add('horizontal');
    if (traversal === 'rtl') {
      classic.classList.add('rtl');
    }

    const indices = chapterMode === 'continuous'
      ? AppState.chapters.map((_, idx) => idx)
      : [AppState.currentChapter];

    classic.innerHTML = indices.map((idx) => {
      const content = getChapterHTML(idx, true);
      return `<section class="chapter-panel" id="chapter-panel-${idx}">${content}</section>`;
    }).join('');

    requestAnimationFrame(() => {
      const panel = getPagedPanel();
      if (panel) {
        panel.scrollLeft = 0;
        panel.onscroll = () => schedulePagedSnap(panel);
      }
    });
  }

  updateChapterIndicator();
  renderTOC();
}

function getActiveRSVPText() {
  if (!AppState.chapters.length) {
    return '';
  }
  if (AppState.settings.chapterMode === 'continuous') {
    return AppState.chapters.map((_, idx) => getChapterHTML(idx, false)).join(' ');
  }
  return getChapterHTML(AppState.currentChapter, false);
}

function updateChapterIndicator() {
  const label = document.getElementById('chapter-indicator');
  const nav = document.getElementById('chapter-nav');
  const prev = document.getElementById('prev-chapter');
  const next = document.getElementById('next-chapter');
  syncTOCVisibility();

  if (!AppState.chapters.length) {
    label.textContent = 'No chapter';
    nav?.classList.add('hidden');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }

  if (AppState.mode === 'rsvp') {
    nav?.classList.add('hidden');
    return;
  }

  label.textContent = `${AppState.currentChapter + 1} / ${AppState.chapters.length}`;
  nav?.classList.remove('hidden');
  if (prev) prev.disabled = AppState.currentChapter <= 0;
  if (next) next.disabled = AppState.currentChapter >= AppState.chapters.length - 1;
}

function updateModeUI() {
  const hasBook = AppState.chapters.length > 0;
  const classicReader = document.getElementById('classic-reader');
  const rsvpReader = document.getElementById('rsvp-reader');
  const rsvpControls = document.getElementById('rsvp-controls');
  const rotControls = document.getElementById('rot-controls');
  const aiBtn = document.getElementById('ai-btn');

  // Hard gate: replacements can never be active outside ROT mode.
  if (AppState.mode !== 'rot') {
    AppState.rot.active = false;
  }

  document.getElementById('drop-zone').classList.toggle('hidden', hasBook);
  document.getElementById('reader-area').classList.toggle('mode-rsvp', AppState.mode === 'rsvp');
  document.getElementById('chapter-nav')?.classList.toggle('hidden', AppState.mode === 'rsvp' || !hasBook);

  const showClassic = AppState.mode === 'classic' || AppState.mode === 'rot' || AppState.mode === 'bionic';
  classicReader.style.display = showClassic ? 'block' : 'none';
  rsvpReader.style.display = AppState.mode === 'rsvp' ? 'flex' : 'none';
  rsvpControls.style.display = AppState.mode === 'rsvp' ? 'flex' : 'none';
  rotControls.style.display = AppState.mode === 'rot' ? 'flex' : 'none';
  aiBtn.classList.toggle('hidden', AppState.mode !== 'rot');
  if (AppState.mode !== 'rot') {
    aiBtn.value = '';
  }

  if (AppState.mode === 'rsvp') {
    initRSVPMode(getActiveRSVPText());
  } else {
    pauseRSVP();
  }

  if (showClassic) {
    renderClassicReader();
  }
}
