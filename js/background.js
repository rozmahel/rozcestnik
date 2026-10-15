// Pozadí: fotka, která se mění sama (denně nebo při každém otevření), nebo jednobarevné.
// Fotka: Bing „fotka dne“ přes servisní vrstvu, když je nastavená, jinak Lorem Picsum (bez klíče).
// Když se fotka nenačte (offline), zůstane barva.
import * as store from './store.js';

const CACHE_KEY = 'rozcestnik:bg';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cache = {
  get() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
  },
  set(v) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* nevadí */ }
  },
};

// Velikost podle obrazovky, zaokrouhlená, ať se fotka zbytečně nestahuje znovu.
function size() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.min(2560, Math.ceil((screen.width * dpr) / 320) * 320);
  const h = Math.min(1600, Math.ceil((screen.height * dpr) / 200) * 200);
  return { w, h };
}

async function fetchJson(url, ms = 6000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fromBing(random) {
  const s = store.get();
  if (!s.serviceUrl) throw new Error('bez servisní vrstvy');
  const target = new URL(`/background${random ? `?idx=${Math.floor(Math.random() * 8)}` : ''}`, s.serviceUrl);
  const data = await fetchJson(target);
  if (typeof data?.url !== 'string' || !data.url.startsWith('https://')) throw new Error('neplatná odpověď');
  return { url: data.url, credit: data.credit || 'Bing', link: data.link || null };
}

async function fromPicsum(seed) {
  const { w, h } = size();
  try {
    const info = await fetchJson(`https://picsum.photos/seed/${encodeURIComponent(seed)}/info`);
    if (info?.id !== undefined) {
      return {
        url: `https://picsum.photos/id/${encodeURIComponent(info.id)}/${w}/${h}`,
        credit: info.author || 'Lorem Picsum',
        link: typeof info.url === 'string' && info.url.startsWith('https://') ? info.url : null,
      };
    }
  } catch { /* bez informací o autorovi */ }
  return { url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`, credit: 'Lorem Picsum', link: 'https://picsum.photos' };
}

function preload(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('obrázek se nenačetl'));
    img.src = url;
  });
}

export function initBackground({ layer, credit }) {
  const root = document.documentElement;
  let seq = 0;

  function showColor() {
    root.dataset.bg = 'color';
    layer.style.backgroundImage = '';
    credit.hidden = true;
  }

  function showPhoto(photo) {
    root.dataset.bg = 'photo';
    layer.style.backgroundImage = `url("${photo.url.replace(/"/g, '%22')}")`;
    credit.replaceChildren();
    const label = `Foto: ${photo.credit}`;
    if (photo.link) {
      const a = document.createElement('a');
      a.href = photo.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      credit.append(a);
    } else {
      credit.textContent = label;
    }
    credit.hidden = false;
  }

  function applyColor() {
    const { color } = store.get().background;
    if (color) root.style.setProperty('--bg-color', color);
    else root.style.removeProperty('--bg-color');
  }

  // fresh = vynutit novou fotku (změna nastavení)
  async function apply({ fresh = false } = {}) {
    const my = ++seq;
    const bg = store.get().background;
    applyColor();
    if (bg.mode !== 'photo') return showColor();

    const day = today();
    const c = cache.get();
    const random = bg.every === 'open';
    const hasService = !!store.get().serviceUrl;
    const usable = c && typeof c.url === 'string' && c.every === bg.every && c.service === hasService;

    if (usable && !random && c.day === day && !fresh) return showPhoto(c);
    // během načítání nové fotky zůstane stará (nebo barva)
    if (usable) showPhoto(c);
    else if (root.dataset.bg !== 'photo') showColor();

    const seed = random ? `r-${Math.random().toString(36).slice(2)}` : `rozcestnik-${day}`;
    let photo;
    try {
      photo = await fromBing(random);
    } catch {
      photo = await fromPicsum(seed);
    }
    try {
      await preload(photo.url);
    } catch {
      if (my === seq && !usable) showColor();
      return;
    }
    if (my !== seq || store.get().background.mode !== 'photo') return;
    cache.set({ ...photo, day, every: bg.every, service: hasService });
    showPhoto(photo);
  }

  // o půlnoci (při otevřené záložce) nová fotka dne
  let lastDay = today();
  setInterval(() => {
    if (today() !== lastDay) {
      lastDay = today();
      if (store.get().background.every === 'day') apply();
    }
  }, 60_000);

  apply();
  return { apply };
}
