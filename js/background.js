// Pozadí: fotka z Lorem Picsum (bez klíče), která se mění sama (denně nebo při každém otevření), nebo jednobarevné.
// Zásoba: další 3 fotky jsou stažené dopředu v Cache API. Při změně se vezme první z fronty (ukáže se hned,
// i bez sítě) a na konec fronty se na pozadí stáhne nová. Když žádná fotka není, zůstane barva.
import * as store from './store.js';

const STATE_KEY = 'rozcestnik:bg2'; // { current: fotka | null, queue: [fotka] }
const CACHE = 'rozcestnik-foto'; // soubory fotek (service worker tuhle cache nemaže)
const QUEUE = 3;
// fotka = { url, credit, link, stored (soubor je v cache), day (kdy se začala ukazovat) }

try { localStorage.removeItem('rozcestnik:bg'); } catch { /* starý formát */ }

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Stav se vždy načte, upraví a uloží najednou (bez čekání mezi tím), ať si nepřepisují dvě otevřené karty.
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    const ok = (p) => p && typeof p.url === 'string';
    return { current: ok(s?.current) ? s.current : null, queue: Array.isArray(s?.queue) ? s.queue.filter(ok) : [] };
  } catch {
    return { current: null, queue: [] };
  }
}
function changeState(fn) {
  const s = loadState();
  const result = fn(s);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* bez úložiště se fotky jen nepamatují */ }
  return result;
}

const openCache = () => caches.open(CACHE);

// Velikost podle obrazovky, zaokrouhlená.
function size() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.min(2560, Math.ceil((screen.width * dpr) / 320) * 320);
  const h = Math.min(1600, Math.ceil((screen.height * dpr) / 200) * 200);
  return { w, h };
}

async function fetchJson(url, ms = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Náhodná fotka: adresa a autor.
async function pickPhoto() {
  const { w, h } = size();
  const seed = Math.random().toString(36).slice(2);
  try {
    const info = await fetchJson(`https://picsum.photos/seed/${seed}/info`);
    if (info?.id !== undefined) {
      return {
        url: `https://picsum.photos/id/${encodeURIComponent(info.id)}/${w}/${h}`,
        credit: info.author || 'Lorem Picsum',
        link: typeof info.url === 'string' && info.url.startsWith('https://') ? info.url : null,
      };
    }
  } catch { /* bez informací o autorovi */ }
  return { url: `https://picsum.photos/seed/${seed}/${w}/${h}`, credit: 'Lorem Picsum', link: 'https://picsum.photos' };
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

// Stáhne novou fotku a uloží ji jako soubor. Když web nedovolí čtení odjinud (CORS),
// zůstane aspoň v běžné mezipaměti prohlížeče.
async function download() {
  const photo = await pickPhoto();
  try {
    const res = await fetch(photo.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(String(res.status));
    await (await openCache()).put(photo.url, res);
    photo.stored = true;
  } catch {
    await preload(photo.url);
    photo.stored = false;
  }
  return photo;
}

// Adresa pro zobrazení; null = uložený soubor zmizel.
async function sourceOf(photo) {
  if (!photo.stored) return photo.url;
  try {
    const hit = await (await openCache()).match(photo.url);
    return hit ? URL.createObjectURL(await hit.blob()) : null;
  } catch {
    return null;
  }
}

async function discard(photo) {
  if (!photo?.stored) return;
  try { await (await openCache()).delete(photo.url); } catch { /* nevadí */ }
}

// Smaže soubory, na které už nic neukazuje (např. po zavření karty uprostřed stahování).
async function cleanup() {
  try {
    const s = loadState();
    const keep = new Set([s.current, ...s.queue].filter(Boolean).map((p) => p.url));
    const cache = await openCache();
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
  } catch { /* nevadí */ }
}

export function initBackground({ layer, credit }) {
  const root = document.documentElement;
  let seq = 0;
  let objectUrl = null;
  let filling = null;

  function showColor() {
    root.dataset.bg = 'color';
    layer.style.backgroundImage = '';
    credit.hidden = true;
  }

  function showPhoto(photo, src) {
    root.dataset.bg = 'photo';
    layer.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
    if (objectUrl && objectUrl !== src) URL.revokeObjectURL(objectUrl);
    objectUrl = src.startsWith('blob:') ? src : null;
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

  // Doplní frontu na 3 fotky, po jedné. Bez sítě se zkusí zase při dalším otevření.
  function refill() {
    filling ??= (async () => {
      try {
        while (loadState().queue.length < QUEUE && store.get().background.mode === 'photo') {
          const photo = await download();
          changeState((s) => { s.queue.push(photo); });
        }
      } catch { /* offline */ } finally {
        filling = null;
      }
    })();
    return filling;
  }

  // Další fotka z fronty, která ještě má soubor; stane se aktuální.
  async function next(day) {
    for (;;) {
      const photo = changeState((s) => s.queue.shift());
      if (!photo) return null;
      const src = await sourceOf(photo);
      if (!src) continue; // soubor zmizel (vymazaná data), zkusí další
      const old = changeState((s) => {
        const prev = s.current;
        s.current = { ...photo, day };
        return prev;
      });
      if (old?.url !== photo.url) discard(old);
      return { photo, src };
    }
  }

  // start = otevření stránky (u „při každém otevření“ nová fotka), fresh = změna nastavení
  async function apply({ fresh = false, start = false } = {}) {
    const my = ++seq;
    const bg = store.get().background;
    applyColor();
    if (bg.mode !== 'photo') return showColor();

    const day = today();
    const current = loadState().current;
    const due = fresh || !current || current.day !== day || (start && bg.every === 'open');

    let shown = false;
    if (due) {
      const n = await next(day);
      if (my !== seq) return;
      if (n) { showPhoto(n.photo, n.src); shown = true; }
    }
    if (!shown && current) {
      // fronta je prázdná: zatím zůstane stará fotka
      const src = await sourceOf(current);
      if (my !== seq) return;
      if (src) showPhoto(current, src);
      else if (root.dataset.bg !== 'photo') showColor();
    } else if (!shown && root.dataset.bg !== 'photo') {
      showColor();
    }

    if (due && !shown) {
      // první spuštění nebo došla zásoba: stáhnout jednu hned
      try {
        const photo = await download();
        const old = changeState((s) => {
          const prev = s.current;
          s.current = { ...photo, day };
          return prev;
        });
        if (old?.url !== photo.url) discard(old);
        const src = await sourceOf(photo);
        if (my === seq && src && store.get().background.mode === 'photo') showPhoto(photo, src);
      } catch { /* offline: zůstane, co je */ }
    }
    if (my === seq) refill();
  }

  // o půlnoci (při otevřené záložce) nová fotka dne
  let lastDay = today();
  setInterval(() => {
    if (today() !== lastDay) {
      lastDay = today();
      if (store.get().background.every === 'day') apply();
    }
  }, 60_000);

  cleanup().finally(() => apply({ start: true }));
  return { apply };
}
