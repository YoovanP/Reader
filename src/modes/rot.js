import { AppState } from '../utils/storage.js';

const ROT_TRANSFORMS = {
  skibidi: {
    fn: (text) => text
      .replace(/\bgood\b/gi, "sigma")
      .replace(/\bbad\b/gi, "beta")
      .replace(/\bman\b/gi, "sigma")
      .replace(/\bperson\b/gi, "NPC")
      .replace(/\bpeople\b/gi, "NPCs")
      .replace(/\bthought\b/gi, "brainrot")
      .replace(/\bsaid\b/gi, "yapped")
      .replace(/\bwalked\b/gi, "did the griddy to")
      .replace(/\bran\b/gi, "speed-ran")
      .replace(/\bfear\b/gi, "no cap anxiety")
      .replace(/\blove\b/gi, "W rizz energy")
      .replace(/\btruth\b/gi, "real talk fr fr")
      .replace(/\bdeath\b/gi, "getting ratio'd permanently")
      .replace(/\blife\b/gi, "this era")
      .replace(/\bworld\b/gi, "the lore")
      .replace(/\bking\b/gi, "gigachad")
      .replace(/\bgreat\b/gi, "bussin no cap")
      .replace(/\bterrible\b/gi, "L + ratio")
  },
  emoji: {
    fn: (text, intensity) => {
      const pool = ["💀", "😭", "🙏", "🔥", "❗", "✨", "🗿", "😤", "🫡", "🤡", "💅"];
      return text.replace(/([.!?,;])/g, (match) => {
        return Math.random() < 0.3 * (intensity / 100) ? `${match} ${pool[Math.floor(Math.random() * pool.length)]}` : match;
      });
    }
  },
  caps: {
    fn: (text, intensity) => text.replace(/\b\w+\b/g, (word) =>
      (Math.random() < 0.15 * (intensity / 100) && word.length > 4) ? word.toUpperCase() : word
    )
  },
  abbrev: {
    fn: (text) => text
      .replace(/\bto be honest\b/gi, "ngl")
      .replace(/\bhonestly\b/gi, "lowkey")
      .replace(/\bvery\b/gi, "so fr")
      .replace(/\bI think\b/gi, "imo")
      .replace(/\bbecause\b/gi, "bc")
      .replace(/\bsomething\b/gi, "smth")
      .replace(/\beveryone\b/gi, "everyone fr fr")
      .replace(/\blaughed\b/gi, "was dead")
      .replace(/\bshocked\b/gi, "ate no crumbs")
      .replace(/\bunderstood\b/gi, "understood the assignment")
  },
  enders: {
    fn: (text, intensity) => {
      const pool = [
        " no cap.", " fr fr.", " (this is real).", " ratio.", " W behavior.",
        " based.", " slay.", " main character behavior.", " on god.", " NOT THE DRAMA.",
      ];
      return text.replace(/\. /g, (match) => Math.random() < 0.4 * (intensity / 100) ? pool[Math.floor(Math.random() * pool.length)] + " " : match);
    }
  },
  glitch: {
    fn: (text, intensity) => {
      const map = { 'e':'ẽ','a':'ä','o':'ö' };
      return text.replace(/[eao]/g, (c) => (Math.random() < 0.05 * (intensity / 100) && map[c]) ? map[c] : c);
    }
  }
};

let controlsBound = false;

function intensityLabel(value) {
  if (value <= 20) return 'Chronically Online';
  if (value <= 50) return 'Deep in the Lore';
  if (value <= 80) return 'Terminal Brainrot';
  return 'ACTUALLY COOKED';
}

export function initROTMode(onApply, onRestore) {
  const intensitySlider = document.getElementById('rot-intensity');
  intensitySlider.value = String(AppState.rot.intensity);
  document.getElementById('rot-label').innerText = intensityLabel(Number(AppState.rot.intensity));

  const pills = document.querySelectorAll('.rot-pill');
  pills.forEach((btn) => {
    const key = btn.dataset.transform;
    btn.classList.toggle('active', !!AppState.rot.transforms[key]);
  });

  if (controlsBound) {
    return;
  }

  pills.forEach((btn) => {
    const key = btn.dataset.transform;
    btn.addEventListener('click', () => {
      AppState.rot.transforms[key] = !AppState.rot.transforms[key];
      btn.classList.toggle('active', !!AppState.rot.transforms[key]);
    });
  });

  intensitySlider.addEventListener('input', (e) => {
    AppState.rot.intensity = Number(e.target.value);
    document.getElementById('rot-label').innerText = intensityLabel(Number(e.target.value));
  });

  document.getElementById('rot-apply').addEventListener('click', () => onApply?.());
  document.getElementById('rot-restore').addEventListener('click', () => {
    AppState.rot.active = false;
    onRestore?.();
  });

  controlsBound = true;
}

export function applyROTTransforms(text, intensity, transforms) {
  let result = text;
  for (const [key, t] of Object.entries(ROT_TRANSFORMS)) {
    if (transforms[key]) {
      result = t.fn(result, intensity);
    }
  }
  return result;
}
