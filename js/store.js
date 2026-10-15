// Ukládání do localStorage: jeden klíč pro plochu, zvláštní klíče pro data widgetů.
const KEY = 'rozcestnik:v1';
const VERSION = 1;

const defaults = () => ({
  version: VERSION,
  layout: null, // null = ještě nic neuloženo, použije se výchozí rozložení
  settings: {},
  theme: 'auto',
  search: { engine: 'g' },
  serviceUrl: null,
  apps: null, // null = výchozí seznam z apps.json
  links: null, // null = výchozí rychlé odkazy z links.json
  linksView: { show: true, rows: 2, perRow: 8, searchTop: false, googleIcons: false },
  background: { mode: 'photo', every: 'day', color: null },
});

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const clampInt = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// Jen http(s) adresa, jinak null.
function cleanUrl(v) {
  try {
    return typeof v === 'string' && ['http:', 'https:'].includes(new URL(v).protocol) ? v : null;
  } catch {
    return null;
  }
}

// Seznam aplikací: jen položky s názvem a http(s) adresou, ostatní pole se ořežou. Jiný tvar -> null.
export function cleanApps(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((a) => isObject(a) && typeof a.name === 'string' && a.name.trim() && typeof a.url === 'string' && cleanUrl(a.url.trim()))
    .map((a) => {
      const app = { name: a.name.trim(), url: a.url.trim() };
      if (typeof a.id === 'string' && a.id) app.id = a.id;
      if (typeof a.icon === 'string' && a.icon.trim()) app.icon = a.icon.trim();
      if (Array.isArray(a.tags)) app.tags = a.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
      return app;
    });
}

// Zahodí položky se špatným tvarem; mins (Map id -> {w, h}) volitelně omezí na známé widgety.
function cleanLayout(layout, mins) {
  if (!Array.isArray(layout)) return null;
  return layout
    .filter((it) => it && typeof it.id === 'string' && (!mins || mins.has(it.id)) && [it.x, it.y, it.w, it.h].every(isCount))
    .map((it) => {
      const min = mins?.get(it.id) ?? { w: 1, h: 1 };
      return { id: it.id, x: Math.min(it.x, 11), y: it.y, w: Math.min(12, Math.max(it.w, min.w)), h: Math.max(it.h, min.h) };
    });
}

// Z libovolných dat složí platný stav, špatné části nahradí výchozími.
function sanitize(data, mins) {
  const d = defaults();
  if (!isObject(data)) return d;
  const settings = {};
  if (isObject(data.settings)) {
    for (const [id, v] of Object.entries(data.settings)) {
      if (isObject(v) && (!mins || mins.has(id))) settings[id] = v;
    }
  }
  return {
    version: VERSION,
    layout: cleanLayout(data.layout, mins),
    settings,
    theme: ['auto', 'light', 'dark'].includes(data.theme) ? data.theme : d.theme,
    search: { engine: typeof data.search?.engine === 'string' ? data.search.engine : d.search.engine },
    serviceUrl: cleanUrl(data.serviceUrl),
    apps: cleanApps(data.apps),
    links: cleanApps(data.links),
    linksView: cleanLinksView(data.linksView),
    background: cleanBackground(data.background),
  };
}

function cleanLinksView(v) {
  const d = defaults().linksView;
  if (!isObject(v)) return d;
  return {
    show: typeof v.show === 'boolean' ? v.show : d.show,
    rows: clampInt(v.rows, 1, 3, d.rows),
    perRow: clampInt(v.perRow, 4, 12, d.perRow),
    searchTop: typeof v.searchTop === 'boolean' ? v.searchTop : d.searchTop,
    googleIcons: typeof v.googleIcons === 'boolean' ? v.googleIcons : d.googleIcons,
  };
}

function cleanBackground(v) {
  const d = defaults().background;
  if (!isObject(v)) return d;
  return {
    mode: ['photo', 'color'].includes(v.mode) ? v.mode : d.mode,
    every: ['day', 'open'].includes(v.every) ? v.every : d.every,
    color: isHex(v.color) ? v.color.toLowerCase() : null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return parsed?.version === VERSION ? sanitize(parsed) : defaults();
  } catch {
    return defaults();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Uložení se nepodařilo', e);
  }
}

// až za pomocnými funkcemi, jinak load() narazí na TDZ a vrátí výchozí stav
let state = load();

export const get = () => state;

export function update(fn) {
  fn(state);
  persist();
}

export function getWidgetSettings(id, defs = []) {
  const values = {};
  for (const d of defs) values[d.key] = d.default;
  return { ...values, ...(state.settings[id] || {}) };
}

export function setWidgetSettings(id, values) {
  update((s) => { s.settings[id] = values; });
}

// Vlastní úložiště widgetu (mimo export).
export function widgetStorage(id) {
  const k = (key) => `rozcestnik:w:${id}:${key}`;
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(k(key));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(k(key), JSON.stringify(value));
      } catch (e) {
        console.error('Uložení dat widgetu selhalo', e);
      }
    },
  };
}

export function exportJson() {
  const { layout, settings, theme, search, serviceUrl, apps, links, linksView, background } = state;
  return JSON.stringify({ version: VERSION, layout, settings, theme, search, serviceUrl, apps, links, linksView, background }, null, 2);
}

export function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Ověří a načte JSON. knownMins: Map id -> {w, h}; neznámé widgety se zahodí.
// Vrací { ok: true } nebo { ok: false, error }.
export function importJson(text, knownMins) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Soubor není platný JSON.' };
  }
  if (!data || typeof data !== 'object' || data.version !== VERSION) {
    return { ok: false, error: 'Nepodporovaná verze nebo tvar souboru.' };
  }
  if (data.layout !== null && !Array.isArray(data.layout)) {
    return { ok: false, error: 'Rozložení má špatný tvar.' };
  }
  const clean = sanitize(data, knownMins);
  // starší export bez těchto částí je nesmaže
  for (const key of ['apps', 'links', 'linksView', 'background']) {
    if (!(key in data)) clean[key] = state[key];
  }
  update((s) => { Object.assign(s, clean); });
  return { ok: true };
}

// Prázdný text = bez servisní vrstvy. Vrací false, když adresa není http(s).
export function setServiceUrl(value) {
  const text = String(value ?? '').trim();
  const url = text ? cleanUrl(text) : null;
  if (text && !url) return false;
  update((s) => { s.serviceUrl = url; });
  return true;
}

// Obnoví výchozí rozložení, nastavení widgetů zůstanou.
export function resetLayout() {
  update((s) => { s.layout = null; });
}
