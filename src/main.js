import {
  AppState,
  getChapterScroll,
  initStorage,
  restoreProgress,
  saveProgress,
  saveReaderState,
  saveSettings,
  setChapterScroll,
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
import { initSettings } from './ui/settings.js';
import { handleSlopify } from './ai/slopify.js';

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

function bindScrollProgress() {
  const readerArea = document.getElementById('reader-area');
  readerArea.addEventListener('scroll', () => {
    if (AppState.mode !== 'classic' && AppState.mode !== 'rot') {
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
}

async function handleFile(file) {
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
      });
    } else {
      parsed = await parseTextFormats(arrayBuffer, file.name);
    }
  } catch (error) {
    console.error('Failed to parse file.', error);
    const dropZone = document.getElementById('drop-zone');
    dropZone.classList.remove('hidden');
    dropZone.classList.remove('dragover');
    dropZone.innerHTML = `
      <h2 style="font-family:var(--font-heading); margin-bottom:0.25rem;">Could not open this file</h2>
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
  setLoadIndicator('', false);
}

function getChapterHTML(index, includeHeading = true) {
  const chapter = AppState.chapters[index];
  if (!chapter) {
    return '';
  }

  const canonicalSource = chapter.originalContent || chapter.content || '';

  const source = (AppState.mode === 'rot' && AppState.rot.active)
    ? applyROTTransforms(canonicalSource, AppState.rot.intensity, AppState.rot.transforms)
    : canonicalSource;

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

  const showClassic = AppState.mode === 'classic' || AppState.mode === 'rot';
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
