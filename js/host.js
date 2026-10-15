// Připojení widgetu: načtení modulu, kontext, izolace chyb, úklid.
import * as store from './store.js';
import { getApps, saveApps, resetApps } from './apps.js';

const modules = new Map();

export function loadModule(entry) {
  if (!modules.has(entry.id)) modules.set(entry.id, entry.load());
  return modules.get(entry.id);
}

// Načte manifesty všech widgetů; kdo se nenačte, má error.
export async function loadAll(entries) {
  const results = await Promise.allSettled(entries.map(loadModule));
  return entries.map((entry, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && validModule(r.value, entry.id)) {
      return { entry, mod: r.value, manifest: r.value.manifest };
    }
    const error = r.status === 'rejected' ? r.reason : new Error('neplatný manifest nebo chybí init');
    console.error(`Widget „${entry.id}“ nelze načíst`, error);
    return { entry, mod: null, manifest: null, error };
  });
}

const validSize = (z) => z && Number.isInteger(z.w) && Number.isInteger(z.h) && z.w > 0 && z.h > 0;

function validModule(mod, id) {
  const m = mod?.manifest;
  return !!m && m.id === id && typeof m.name === 'string' && validSize(m.defaultSize) && validSize(m.minSize)
    && typeof mod.init === 'function' && (mod.settings === undefined || Array.isArray(mod.settings));
}

function showError(body, text) {
  const p = document.createElement('p');
  p.className = 'widget-error';
  p.textContent = text;
  body.replaceChildren(p);
}

function makeService() {
  const url = () => store.get().serviceUrl;
  return {
    get url() { return url(); },
    async fetch(path, options) {
      if (!url()) throw new Error('Servisní vrstva není nastavená.');
      const base = new URL(url());
      const target = new URL(path, base);
      if (target.origin !== base.origin) throw new Error('Servisní vrstva smí volat jen vlastní adresu.');
      const res = await fetch(target, options);
      if (!res.ok) throw new Error(`Servisní vrstva vrátila ${res.status}.`);
      return res;
    },
  };
}

// Připojí widget do těla `body`. Nikdy nevyhodí, chyba se zobrazí jen v tomto widgetu.
export async function mount({ entry, mod }, body) {
  const settingsListeners = new Set();
  const resizeListeners = new Set();
  const defs = mod.settings || [];
  const safe = (fn, arg) => {
    try { fn(arg); } catch (e) { console.error(`Widget „${entry.id}“: chyba v posluchači`, e); }
  };

  const ctx = {
    settings: store.getWidgetSettings(entry.id, defs),
    onSettings: (cb) => settingsListeners.add(cb),
    onResize: (cb) => resizeListeners.add(cb),
    storage: store.widgetStorage(entry.id),
    getApps,
    saveApps,
    resetApps,
    service: makeService(),
  };

  let destroyed = false;
  const ro = new ResizeObserver(([e]) => {
    const size = { width: e.contentRect.width, height: e.contentRect.height };
    resizeListeners.forEach((cb) => safe(cb, size));
  });
  ro.observe(body);

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    ro.disconnect();
    settingsListeners.clear();
    resizeListeners.clear();
    try { mod.destroy?.(); } catch (e) { console.error(`Widget „${entry.id}“: destroy selhal`, e); }
    body.replaceChildren();
  }

  try {
    await mod.init(body, ctx);
  } catch (e) {
    console.error(`Widget „${entry.id}“: init selhal`, e);
    cleanup();
    showError(body, 'Widget se nepodařilo spustit.');
  }

  return {
    id: entry.id,
    defs,
    values: () => store.getWidgetSettings(entry.id, defs),
    applySettings(values) {
      store.setWidgetSettings(entry.id, values);
      ctx.settings = store.getWidgetSettings(entry.id, defs);
      settingsListeners.forEach((cb) => safe(cb, ctx.settings));
    },
    destroy: cleanup,
  };
}

export { showError };
