import { KeyManager, removeAllKeys } from '../ai/keys.js';
import { AppState, applySettingsToDOM, saveSettings } from '../utils/storage.js';

let settingsDirty = false;

function isCompactLayout() {
  return window.matchMedia('(max-width: 900px), (orientation: portrait)').matches;
}

function setApplyButtonState() {
  const applyBtn = document.getElementById('apply-settings-btn');
  if (!applyBtn) {
    return;
  }
  applyBtn.disabled = !settingsDirty;
  applyBtn.textContent = settingsDirty ? 'Apply Settings *' : 'Apply Settings';
}

function bindSettingInput(id, field, parser = (value) => value, onChange) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }

  if (el.type === 'checkbox') {
    el.checked = !!AppState.settings[field];
  } else {
    el.value = String(AppState.settings[field]);
  }

  const eventName = el.type === 'range' || el.type === 'color' || el.type === 'number' ? 'input' : 'change';
  el.addEventListener(eventName, (e) => {
    const raw = el.type === 'checkbox' ? e.target.checked : e.target.value;
    AppState.settings[field] = parser(raw);
    applySettingsToDOM();
    settingsDirty = true;
    setApplyButtonState();
    if (onChange) {
      onChange();
    }
  });
}

export function initSettings(options = {}) {
  const {
    onVisualChange,
    onTraversalChange,
    onFullscreen,
  } = options;

  settingsDirty = false;
  setApplyButtonState();

  const settingsBtn = document.getElementById('settings-btn');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const tocSidebar = document.getElementById('toc-sidebar');
  const settingsDrawer = document.getElementById('settings-drawer');

  settingsBtn?.addEventListener('click', () => {
    settingsDrawer?.classList.toggle('visible');
    if (isCompactLayout()) {
      tocSidebar?.classList.remove('visible');
    }
  });

  closeSettingsBtn?.addEventListener('click', () => {
    settingsDrawer?.classList.remove('visible');
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    const clickedSettingsButton = target.closest?.('#settings-btn');

    if (settingsDrawer?.classList.contains('visible')) {
      if (!settingsDrawer.contains(target) && !clickedSettingsButton) {
        settingsDrawer.classList.remove('visible');
      }
    }
  });

  bindSettingInput('theme-select', 'theme', (v) => v, onVisualChange);
  bindSettingInput('font-family', 'fontFamily', (v) => v, onVisualChange);
  bindSettingInput('font-size', 'fontSize', (v) => Number(v), onVisualChange);
  bindSettingInput('line-height', 'lineHeight', (v) => Number(v), onVisualChange);
  bindSettingInput('reading-width', 'readingWidth', (v) => Number(v), onVisualChange);
  bindSettingInput('letter-spacing', 'letterSpacing', (v) => Number(v), onVisualChange);
  bindSettingInput('paragraph-spacing', 'paragraphSpacing', (v) => Number(v), onVisualChange);
  bindSettingInput('bold-weight', 'boldWeight', (v) => Number(v), onVisualChange);
  bindSettingInput('bionic-weight', 'bionicWeight', (v) => Number(v), onVisualChange);
  bindSettingInput('font-color', 'fontColor', (v) => v, onVisualChange);
  bindSettingInput('bg-color', 'readerBg', (v) => v, onVisualChange);
  bindSettingInput('accent-color', 'accentColor', (v) => v, onVisualChange);
  bindSettingInput('hide-toolbar-setting', 'hideToolbar', (v) => Boolean(v), onVisualChange);
  bindSettingInput('keep-awake-setting', 'keepAwake', (v) => Boolean(v), options.onKeepAwakeChange);
  bindSettingInput('history-enabled-setting', 'historyEnabled', (v) => Boolean(v), options.onHistoryChange);

  bindSettingInput('traversal-mode', 'traversalMode', (v) => v, onTraversalChange);
  bindSettingInput('chapter-mode', 'chapterMode', (v) => v, onTraversalChange);

  document.getElementById('apply-settings-btn')?.addEventListener('click', () => {
    saveSettings();
    settingsDirty = false;
    setApplyButtonState();
    onVisualChange?.();
    onTraversalChange?.();
  });

  document.getElementById('reset-style-btn')?.addEventListener('click', () => {
    Object.assign(AppState.settings, {
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
      boldWeight: 600,
      bionicWeight: 700,
      hideToolbar: false,
      keepAwake: true,
      historyEnabled: true,
    });

    ['theme-select', 'font-family', 'font-size', 'line-height', 'reading-width', 'letter-spacing', 'paragraph-spacing', 'bold-weight', 'bionic-weight', 'font-color', 'bg-color', 'accent-color', 'hide-toolbar-setting', 'keep-awake-setting', 'history-enabled-setting'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      if (el.type === 'checkbox') {
        const checkboxMap = {
          'hide-toolbar-setting': AppState.settings.hideToolbar,
          'keep-awake-setting': AppState.settings.keepAwake,
          'history-enabled-setting': AppState.settings.historyEnabled,
        };
        el.checked = !!checkboxMap[id];
      } else {
        const map = {
          'theme-select': AppState.settings.theme,
          'font-family': AppState.settings.fontFamily,
          'font-size': AppState.settings.fontSize,
          'line-height': AppState.settings.lineHeight,
          'reading-width': AppState.settings.readingWidth,
          'letter-spacing': AppState.settings.letterSpacing,
          'paragraph-spacing': AppState.settings.paragraphSpacing,
          'bold-weight': AppState.settings.boldWeight,
          'bionic-weight': AppState.settings.bionicWeight,
          'font-color': AppState.settings.fontColor,
          'bg-color': AppState.settings.readerBg,
          'accent-color': AppState.settings.accentColor,
        };
        el.value = String(map[id]);
      }
    });

    document.getElementById('hide-toolbar-setting').checked = false;
    document.getElementById('keep-awake-setting').checked = true;
    document.getElementById('history-enabled-setting').checked = true;
    applySettingsToDOM();
    settingsDirty = true;
    setApplyButtonState();
    onVisualChange?.();
    options.onKeepAwakeChange?.();
    options.onHistoryChange?.();
  });

  document.getElementById('fullscreen-btn-setting')?.addEventListener('click', () => onFullscreen?.());

  const providerSelect = document.getElementById('provider-select');
  const providerKeyLabel = document.getElementById('provider-key-label');
  const providerKeyInput = document.getElementById('provider-key');

  const keyMeta = {
    gemini: { label: 'Gemini Key', placeholder: 'AIza...' },
    openai: { label: 'OpenAI Key', placeholder: 'sk-...' },
    openrouter: { label: 'OpenRouter Key', placeholder: 'sk-or-...' },
  };

  const syncProviderKeyField = () => {
    const provider = providerSelect.value;
    const meta = keyMeta[provider] || keyMeta.gemini;
    providerKeyLabel.textContent = meta.label;
    providerKeyInput.placeholder = meta.placeholder;
    providerKeyInput.value = KeyManager.get(provider) || '';
  };

  providerSelect.value = AppState.ai.provider;
  providerSelect.addEventListener('change', (e) => {
    AppState.ai.provider = e.target.value;
    localStorage.setItem('readrot-ai-provider', AppState.ai.provider);
    syncProviderKeyField();
  });
  syncProviderKeyField();

  document.getElementById('save-keys')?.addEventListener('click', () => {
    const persist = document.getElementById('persist-keys').checked;
    const provider = providerSelect.value;
    const value = providerKeyInput.value.trim();
    if (value) {
      KeyManager.save(provider, value, persist);
    }
  });

  document.getElementById('remove-keys')?.addEventListener('click', () => {
    removeAllKeys();
    providerKeyInput.value = '';
  });
}
