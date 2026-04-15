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
  addToHistory,
  clearHistory,
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
import { initSettings } from './ui/settings.js';
import { handleSlopify } from './ai/slopify.js';
import { SourceManager } from './sources/manager.js';

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
  });

  bindToolbar();
  bindFileInput();
  bindDropZone();
  bindKeyboardShortcuts();
  bindScrollProgress();
  bindSearchHub();
  bindIntralinks();
  bindPasteHub();
  bindHistoryHub();

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
});

function bindToolbar() {
  document.getElementById('upload-trigger').addEventListener('click', () => {
    document.getElementById('upload-btn').click();
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

function bindPasteHub() {
  // ... existing code ...
}

function bindHistoryHub() {
  const trigger = document.getElementById('history-trigger');
  const overlay = document.getElementById('history-overlay');
  const closeBtn = document.getElementById('close-history-btn');
  const clearBtn = document.getElementById('clear-history-btn');

  trigger.addEventListener('click', () => {
    renderHistory();
    overlay.classList.add('visible');
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your reading history?')) {
      clearHistory();
      renderHistory();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('visible');
  });
}

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
        <div style="font-size:0.8rem; color:var(--accent);">Resume →</div>
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
    handlePastedText(item.content, item.title, true);
    // Restore progress after loading
    setTimeout(() => {
      AppState.currentChapter = item.chapter || 0;
      renderClassicReader();
    }, 100);
  } else {
    // For files, we notify the user to upload
    setLoadIndicator(`History: Please re-upload "${item.title}" to resume...`, true);
    // Store the desired progress in state so handleFile can pick it up
    AppState.resumeTarget = {
      title: item.title,
      chapter: item.chapter,
      scrollTop: item.scrollTop
    };
  }
}

function bindSearchHub() {
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

async function handlePastedText(text, title, isResume = false) {
  clearResources();
  document.getElementById('drop-zone').classList.add('hidden');
  setLoadIndicator(`Readying your text...`, true);

  AppState.book = { name: title };
  
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
  AppState.currentChapter = 0;
  
  saveReaderState();
  renderClassicReader();
  
  if (AppState.mode === 'rsvp') {
    initRSVPMode(getActiveRSVPText());
  }
  
  if (!isResume) {
    updateHistoryProgress();
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
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight':
        if (AppState.mode === 'rsvp') {
          skipForward(10);
        } else {
          navigateByArrow('right');
        }
        break;
      case 'ArrowLeft':
        if (AppState.mode === 'rsvp') {
          skipBackward(10);
        } else {
          navigateByArrow('left');
        }
        break;
      case 'ArrowUp':
        increaseWPM(25);
        break;
      case 'ArrowDown':
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
        document.getElementById('sidebar').classList.remove('visible');
        break;
      default:
        break;
    }
  });
}

function navigateByArrow(direction) {
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

async function handleFile(file) {
  clearResources();
  document.getElementById('drop-zone').classList.add('hidden');
  setLoadIndicator(`Loading ${file.name}...`, true);
  const arrayBuffer = await file.arrayBuffer();

  AppState.book = { name: file.name };

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

  AppState.chapters = (parsed.chapters || []).map((chapter, idx) => ({
    title: chapter.title || `Chapter ${idx + 1}`,
    content: chapter.content || '<p></p>',
    originalContent: chapter.originalContent || chapter.content || '<p></p>',
    href: chapter.href || '',
  })).filter((chapter) => (chapter.content || '').trim().length > 0);

  if (!AppState.chapters.length) {
    AppState.chapters = [{
      title: 'Chapter 1',
      content: '<p>No readable content found in this file.</p>',
      originalContent: '<p>No readable content found in this file.</p>',
    }];
  }

  AppState.toc = parsed.toc || [];

  const resumed = restoreProgress(file.name);
  if (!resumed) {
    AppState.currentChapter = 0;
    AppState.rsvp.index = 0;
  }

  renderTOC();
  renderClassicReader();
  updateModeUI();

  // Handle Resume from history
  if (AppState.resumeTarget && AppState.resumeTarget.title === file.name) {
    if (Number.isInteger(AppState.resumeTarget.chapter)) {
      AppState.currentChapter = AppState.resumeTarget.chapter;
      renderClassicReader();
      if (AppState.resumeTarget.scrollTop) {
        setTimeout(() => {
           document.getElementById('reader-area').scrollTop = AppState.resumeTarget.scrollTop;
        }, 100);
      }
    }
    AppState.resumeTarget = null;
  }

  updateHistoryProgress();
  setLoadIndicator('', false);
}

function updateHistoryProgress() {
  if (!AppState.book) return;
  
  const readerArea = document.getElementById('reader-area');
  const item = {
    title: AppState.book.name,
    type: (AppState.chapters[0]?.href || '').startsWith('paste://') ? 'paste' : 'file',
    chapter: AppState.currentChapter,
    scrollTop: readerArea.scrollTop,
    // only store content if it's a paste and not too huge
    content: (AppState.chapters[0]?.href || '').startsWith('paste://') ? AppState.chapters[0].originalContent : undefined
  };

  addToHistory(item);
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

  return `<h2>${chapter.title || `Chapter ${index + 1}`}</h2>${source}`;
}

function renderTOC() {
  const container = document.getElementById('toc-list');
  container.innerHTML = '';

  if (!AppState.chapters.length) {
    container.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No chapters loaded.</div>';
    return;
  }

  AppState.chapters.forEach((chapter, idx) => {
    const button = document.createElement('button');
    button.className = 'toc-item';
    button.textContent = chapter.title || `Chapter ${idx + 1}`;
    button.addEventListener('click', () => {
      AppState.currentChapter = idx;
      saveReaderState();
      renderClassicReader();
      if (AppState.mode === 'rsvp') {
        initRSVPMode(getActiveRSVPText());
      }
    });
    container.appendChild(button);
  });
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

  if (traversal === 'scroll') {
    const indices = chapterMode === 'continuous'
      ? AppState.chapters.map((_, idx) => idx)
      : [AppState.currentChapter];

    classic.innerHTML = indices.map((idx) => {
      const body = getChapterHTML(idx, chapterMode === 'continuous');
      return `<section>${body}</section>${chapterMode === 'continuous' ? '<div class="chapter-divider"></div>' : ''}`;
    }).join('');

    if (chapterMode === 'divided') {
      const stored = getChapterScroll(AppState.currentChapter);
      readerArea.scrollTop = stored;
    }
  } else {
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

    if (chapterMode === 'continuous') {
      requestAnimationFrame(() => {
        const panel = document.getElementById(`chapter-panel-${AppState.currentChapter}`);
        panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      });
    }
  }

  updateChapterIndicator();
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
  if (!AppState.chapters.length) {
    label.textContent = 'No chapter';
    return;
  }
  label.textContent = `${AppState.currentChapter + 1} / ${AppState.chapters.length}`;
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
