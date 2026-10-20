// Vlastní ikony odkazů: obrázek nahraný z počítače, zmenšený na PNG a uložený v prohlížeči (Cache API).
// V datech i v exportu je jen cesta „vlastni-ikony/<název>.png“. Když soubor chybí, ukáže se výchozí ikona.
const CACHE = 'rozcestnik-ikony'; // service worker tuhle cache nemaže
const PREFIX = 'vlastni-ikony/';
const MAX = 128; // px, delší strana

export const isUserIcon = (v) => typeof v === 'string' && v.startsWith(PREFIX) && v.endsWith('.png');

const keyOf = (path) => new URL(path, location.href).href;
const urls = new Map(); // cesta -> blob: adresa načteného souboru
const openCache = () => caches.open(CACHE);

// Načte soubory ikon do paměti (před vykreslením, ať ikony neproblikávají).
export async function preloadIcons(paths) {
  const todo = [...new Set(paths)].filter((p) => isUserIcon(p) && !urls.has(p));
  if (!todo.length) return;
  try {
    const cache = await openCache();
    await Promise.all(todo.map(async (p) => {
      const hit = await cache.match(keyOf(p));
      if (hit) urls.set(p, URL.createObjectURL(await hit.blob()));
    }));
  } catch { /* bez Cache API se ukážou výchozí ikony */ }
}

// blob: adresa, nebo null (soubor chybí)
export const iconUrl = (path) => urls.get(path) ?? null;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(src); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Soubor se nepodařilo načíst jako obrázek.')); };
    img.src = src;
  });
}

// Libovolný obrázek -> PNG, delší strana nejvýš 128 px (menší se nezvětšuje), průhlednost zůstane.
export async function toPng(file) {
  const img = await loadImage(file);
  const w0 = img.naturalWidth || MAX;
  const h0 = img.naturalHeight || MAX;
  const scale = Math.min(1, MAX / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Převod na PNG se nepodařil.'))), 'image/png');
  });
}

// Nová cesta podle názvu odkazu, např. „vlastni-ikony/moodle-k3f9q2.png“.
export function newIconPath(name) {
  const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'ikona';
  return `${PREFIX}${slug}-${Math.random().toString(36).slice(2, 8)}.png`;
}

export async function saveIcon(path, blob) {
  await (await openCache()).put(keyOf(path), new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.set(path, URL.createObjectURL(blob));
}

// Smaže soubory, na které už žádný odkaz neukazuje (výměna ikony, odebraný odkaz).
export async function cleanupIcons(usedPaths) {
  try {
    const keep = new Set([...usedPaths].filter(isUserIcon).map(keyOf));
    const cache = await openCache();
    for (const req of await cache.keys()) {
      if (keep.has(req.url)) continue;
      await cache.delete(req);
      const path = PREFIX + req.url.split(`/${PREFIX}`).pop();
      const u = urls.get(path);
      if (u) { URL.revokeObjectURL(u); urls.delete(path); }
    }
  } catch { /* nevadí */ }
}
