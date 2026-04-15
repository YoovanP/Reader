export const AppState = {
  book: null,
  chapters: [],
  toc: [],
  currentChapter: 0,
  totalWords: 0,
  mode: 'classic',

  rsvp: {
    wpm: 300,
    playing: false,
    chunkSize: 1,
    words: [],
    index: 0,
    timerId: null,
  },

  rot: {
    active: false,
    intensity: 50,
    transforms: {
      skibidi: true,
      emoji: true,
      caps: false,
      abbrev: true,
      enders: true,
      glitch: false,
    },
    originalContent: null,
  },

  settings: {
    fontSize: 18,
    lineHeight: 1.8,
    theme: 'dark',
    fontFamily: 'Lora',
    fontColor: '#e8e2d9',
    readerBg: '#101010',
    accentColor: '#c8a96e',
    readingWidth: 680,
    letterSpacing: 0,
    paragraphSpacing: 1,
    traversalMode: 'scroll',
    chapterMode: 'divided',
    hideToolbar: false,
  },

  ai: {
    provider: 'gemini',
    geminiKey: null,
    openaiKey: null,
    loading: false,
    activeFeature: null,
  },

  progress: {
    scrollPercent: 0,
    wordPercent: 0,
    scrollTopByChapter: {},
  },
  resources: [], // Active Blob URLs for media
  history: [],   // Recent reading items
};

export function initStorage() {
  const savedSettings = JSON.parse(localStorage.getItem('readrot-settings') || '{}');
  const savedReader = JSON.parse(localStorage.getItem('readrot-reader-state') || '{}');
  const savedRsvp = JSON.parse(localStorage.getItem('readrot-rsvp') || '{}');
  const savedHistory = JSON.parse(localStorage.getItem('readrot-history') || '[]');

  Object.assign(AppState.settings, savedSettings);
  if (!/^#[0-9a-fA-F]{6}$/.test(String(AppState.settings.readerBg || ''))) {
    AppState.settings.readerBg = AppState.settings.theme === 'light' ? '#fffdf8' : '#101010';
  }
  Object.assign(AppState.rsvp, {
    wpm: savedRsvp.wpm || AppState.rsvp.wpm,
    index: savedRsvp.index || 0,
  });

  if (Array.isArray(savedHistory)) {
    AppState.history = savedHistory;
  }

  if (Number.isInteger(savedReader.currentChapter)) {
    AppState.currentChapter = savedReader.currentChapter;
  }

  if (savedReader.scrollTopByChapter && typeof savedReader.scrollTopByChapter === 'object') {
    AppState.progress.scrollTopByChapter = savedReader.scrollTopByChapter;
  }

  applySettingsToDOM();
}

export function saveSettings() {
  localStorage.setItem('readrot-settings', JSON.stringify(AppState.settings));
  applySettingsToDOM();
}

export function saveReaderState() {
  localStorage.setItem('readrot-reader-state', JSON.stringify({
    currentChapter: AppState.currentChapter,
    scrollTopByChapter: AppState.progress.scrollTopByChapter,
  }));
}

export function saveRsvpState() {
  localStorage.setItem('readrot-rsvp', JSON.stringify({
    wpm: AppState.rsvp.wpm,
    index: AppState.rsvp.index,
  }));
}

export function saveProgress(fileName, chapter, wordIndex, scrollTop) {
  localStorage.setItem('readrot-progress', JSON.stringify({
    fileName,
    chapter,
    wordIndex,
    scrollTop,
    savedAt: Date.now(),
  }));
}

export function restoreProgress(fileName) {
  const saved = JSON.parse(localStorage.getItem('readrot-progress') || '{}');
  if (saved.fileName && saved.fileName === fileName) {
    if (Number.isInteger(saved.chapter)) {
      AppState.currentChapter = saved.chapter;
    }
    if (Number.isInteger(saved.wordIndex)) {
      AppState.rsvp.index = saved.wordIndex;
    }
    return saved;
  }
  return null;
}

export function setChapterScroll(chapterIndex, scrollTop) {
  AppState.progress.scrollTopByChapter[String(chapterIndex)] = scrollTop;
}

export function getChapterScroll(chapterIndex) {
  return AppState.progress.scrollTopByChapter[String(chapterIndex)] || 0;
}

export function addToHistory(item) {
  const maxHistory = 30;
  
  // Remove existing entry for same book/paste if it exists
  const existingIndex = AppState.history.findIndex(h => 
    (h.id && h.id === item.id) || (h.title === item.title && h.type === item.type)
  );
  
  if (existingIndex !== -1) {
    AppState.history.splice(existingIndex, 1);
  }
  
  // Add new entry to top
  AppState.history.unshift({
    ...item,
    lastRead: Date.now()
  });
  
  // Trim to max
  if (AppState.history.length > maxHistory) {
    AppState.history = AppState.history.slice(0, maxHistory);
  }
  
  localStorage.setItem('readrot-history', JSON.stringify(AppState.history));
}

export function clearHistory() {
  AppState.history = [];
  localStorage.removeItem('readrot-history');
}

export function clearResources() {
  if (AppState.resources && AppState.resources.length) {
    AppState.resources.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Failed to revoke URL', url, e);
      }
    });
    AppState.resources = [];
  }
}

export function applySettingsToDOM() {
  document.body.classList.toggle('light', AppState.settings.theme === 'light');
  document.body.classList.toggle('hide-toolbar', !!AppState.settings.hideToolbar);

  const root = document.documentElement;
  root.style.setProperty('--font-size', AppState.settings.fontSize + 'px');
  root.style.setProperty('--line-height', AppState.settings.lineHeight);
  root.style.setProperty('--font-main', `'${AppState.settings.fontFamily}', Georgia, serif`);
  // Compatibility aliases for older style hooks.
  root.style.setProperty('--font-body', `'${AppState.settings.fontFamily}', Georgia, serif`);
  root.style.setProperty('--font-heading', `'${AppState.settings.fontFamily}', Georgia, serif`);
  root.style.setProperty('--font-ui', `'${AppState.settings.fontFamily}', Georgia, serif`);
  root.style.setProperty('--font-color', AppState.settings.fontColor);
  root.style.setProperty('--reader-bg', AppState.settings.readerBg);
  root.style.setProperty('--accent', AppState.settings.accentColor);
  root.style.setProperty('--reading-width', AppState.settings.readingWidth + 'px');
  root.style.setProperty('--letter-spacing', AppState.settings.letterSpacing + 'px');
  root.style.setProperty('--paragraph-spacing', AppState.settings.paragraphSpacing + 'rem');
}
