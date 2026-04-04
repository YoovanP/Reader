import { AppState, saveRsvpState } from '../utils/storage.js';

function stripHTML(text) {
  const div = document.createElement('div');
  div.innerHTML = text;
  return div.textContent || div.innerText || '';
}

function tokenize(text) {
  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

class RSVPEngine {
  constructor(text, wpm = 300, onWord) {
    this.words = tokenize(stripHTML(text));
    this.wpm = wpm;
    this.index = AppState.rsvp.index || 0;
    this.playing = false;
    this.timerId = null;
    this.onWord = onWord;
  }

  get intervalMs() { return 60000 / this.wpm; }

  play() { this.playing = true; this.tick(); }

  tick() {
    if (!this.playing || this.index >= this.words.length) return;
    this.onWord(this.words[this.index], this.index, this.words.length);
    AppState.rsvp.index = this.index;
    saveRsvpState();
    this.index++;
    const delay = /[.!?]$/.test(this.words[this.index - 1]) ? this.intervalMs * 2 : this.intervalMs;
    this.timerId = setTimeout(() => this.tick(), delay);
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timerId);
  }

  skip(n) {
    this.index = Math.max(0, Math.min(this.words.length - 1, this.index + n));
    AppState.rsvp.index = this.index;
    saveRsvpState();
    this.onWord(this.words[this.index], this.index, this.words.length);
  }

  setWPM(wpm) {
    this.wpm = Number(wpm);
    AppState.rsvp.wpm = Number(wpm);
    saveRsvpState();
  }

  setText(text) {
    this.pause();
    this.words = tokenize(stripHTML(text));
    this.index = Math.min(AppState.rsvp.index || 0, Math.max(0, this.words.length - 1));
    if (this.words.length > 0) {
      this.onWord(this.words[this.index], this.index, this.words.length);
    }
  }
}

let engine = null;
let initialized = false;

function renderWord(word, index, total) {
  const wordEl = document.getElementById('rsvp-word');
  const statusEl = document.getElementById('rsvp-status');
  if (!wordEl || !statusEl) {
    return;
  }

  const safeWord = String(word || '');
  const orpIndex = safeWord.length <= 1
    ? 0
    : Math.min(Math.max(1, Math.floor(safeWord.length * 0.3)), safeWord.length - 1);
  const w1 = safeWord.slice(0, orpIndex);
  const orp = safeWord[orpIndex] || '';
  const w2 = safeWord.slice(orpIndex + 1);

  wordEl.innerHTML = `${w1}<span class="orp">${orp}</span>${w2}`;
  wordEl.classList.remove('rsvp-word-pulse');
  void wordEl.offsetWidth;
  wordEl.classList.add('rsvp-word-pulse');

  const wordsLeft = Math.max(0, total - index - 1);
  const minutesLeft = AppState.rsvp.wpm > 0 ? Math.ceil(wordsLeft / AppState.rsvp.wpm) : 0;
  statusEl.innerText = `${index + 1} / ${total} - ${minutesLeft} min left`;
}

function bindControls() {
  if (initialized) {
    return;
  }

  const playButton = document.getElementById('rsvp-play');
  const backButton = document.getElementById('rsvp-skip-back');
  const forwardButton = document.getElementById('rsvp-skip-fwd');
  const wpmSlider = document.getElementById('rsvp-wpm');

  playButton.onclick = () => togglePlayPause();
  backButton.onclick = () => skipBackward(10);
  forwardButton.onclick = () => skipForward(10);

  wpmSlider.value = String(AppState.rsvp.wpm);
  document.getElementById('rsvp-wpm-label').innerText = `${AppState.rsvp.wpm} WPM`;
  wpmSlider.oninput = (e) => {
    if (engine) {
      engine.setWPM(e.target.value);
    } else {
      AppState.rsvp.wpm = Number(e.target.value);
      saveRsvpState();
    }
    document.getElementById('rsvp-wpm-label').innerText = `${e.target.value} WPM`;
  };

  initialized = true;
}

export function initRSVPMode(text) {
  bindControls();

  if (engine) {
    engine.setText(text);
    return;
  }

  engine = new RSVPEngine(text, AppState.rsvp.wpm, renderWord);
  if (engine.words.length > 0) {
    renderWord(engine.words[engine.index] || engine.words[0], engine.index || 0, engine.words.length);
  }
}

export function pauseRSVP() {
  if (!engine) {
    return;
  }
  engine.pause();
  AppState.rsvp.playing = false;
  document.getElementById('rsvp-play').innerText = 'Play';
}

export function togglePlayPause() {
  if (!engine) {
    return;
  }
  if (engine.playing) {
    pauseRSVP();
    return;
  }

  engine.play();
  AppState.rsvp.playing = true;
  document.getElementById('rsvp-play').innerText = 'Pause';
}

export function skipForward(amount = 10) {
  if (!engine) {
    return;
  }
  engine.skip(Math.abs(Number(amount) || 10));
}

export function skipBackward(amount = 10) {
  if (!engine) {
    return;
  }
  engine.skip(-(Math.abs(Number(amount) || 10)));
}

export function increaseWPM(step = 25) {
  const next = Math.min(800, (AppState.rsvp.wpm || 300) + step);
  AppState.rsvp.wpm = next;
  document.getElementById('rsvp-wpm').value = String(next);
  document.getElementById('rsvp-wpm-label').innerText = `${next} WPM`;
  if (engine) {
    engine.setWPM(next);
  } else {
    saveRsvpState();
  }
}

export function decreaseWPM(step = 25) {
  const next = Math.max(100, (AppState.rsvp.wpm || 300) - step);
  AppState.rsvp.wpm = next;
  document.getElementById('rsvp-wpm').value = String(next);
  document.getElementById('rsvp-wpm-label').innerText = `${next} WPM`;
  if (engine) {
    engine.setWPM(next);
  } else {
    saveRsvpState();
  }
}
