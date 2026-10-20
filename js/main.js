// Start aplikace: spojuje úložiště, registr, mřížku, katalog a vyhledávač.
import * as store from './store.js';
import { applyTheme } from './theme.js';
import { getApps } from './apps.js';
import { getLinks, saveLinks, resetLinks } from './links.js';
import { createQuickLinks } from './quicklinks.js';
import { initBackground } from './background.js';
import { createGrid } from './grid.js';
import { loadAll, mount, showError } from './host.js';
import { createCatalog } from './catalog.js';
import { openSettings } from './settings-dialog.js';
import { initSearch } from './search/search.js';
import { widgets, defaultLayout } from '../widgets/registry.js';

const $ = (id) => document.getElementById(id);
const narrow = () => window.matchMedia('(max-width: 640px)').matches;

applyTheme();
const background = initBackground({ layer: $('bg'), credit: $('bg-credit') });
const quick = createQuickLinks($('links'), { getLinks, saveLinks, getView: () => store.get().linksView });
const applyOrder = () => document.body.classList.toggle('search-top', store.get().linksView.searchTop);
applyOrder();
const quickReady = quick.load().catch((e) => console.error('Rychlé odkazy se nepodařilo načíst', e));

// Vyhledávání hned na začátku, ať jde psát dřív, než se načte plocha.
// Widgety nabízí až po vykreslení plochy (do té doby by jejich zapnutí přepsalo uložené rozložení).
let searchWidgets = [];
initSearch(
  { form: $('search'), input: $('search-input'), select: $('search-engine'), list: $('search-list') },
  {
    getApps,
    getLinks,
    getWidgets: () => searchWidgets,
    onWidget: (id) => {
      if (!instances.has(id)) { enable(id); persist(); }
      grid.focus(id);
    },
    getEngine: () => store.get().search.engine,
    setEngine: (prefix) => store.update((s) => { s.search.engine = prefix; }),
  },
);

const loaded = await loadAll(widgets);
const byId = new Map(loaded.map((l) => [l.entry.id, l]));
const instances = new Map(); // id -> Promise<instance>
const closing = new Map(); // id -> Promise dokončeného úklidu (nový běh počká na starý)
let rendering = false; // při hromadném překreslení se změny mřížky neukládají

const grid = createGrid($('grid'), {
  onChange: () => { if (!rendering) persist(); },
  onClose: (id) => { disable(id); persist(); },
  onSettings: async (id) => {
    const inst = await instances.get(id);
    if (!inst) return;
    openSettings({
      title: byId.get(id).manifest.name,
      defs: inst.defs,
      values: inst.values(),
      onSave: (values) => inst.applySettings(values),
    });
  },
});

// V jednosloupcovém režimu by snímek mřížky přepsal rozložení, proto se pozice zachovají.
function persist() {
  if (!narrow()) {
    store.update((s) => { s.layout = grid.snapshot(); });
    return;
  }
  store.update((s) => {
    const old = new Map((s.layout ?? []).map((i) => [i.id, i]));
    s.layout = [...instances.keys()].map((id) => old.get(id) ?? { id, ...byId.get(id).manifest.defaultSize });
  });
}

function updateEmpty() {
  $('empty').hidden = instances.size > 0;
}

function enable(id, pos) {
  const item = byId.get(id);
  if (!item?.manifest || instances.has(id)) return;
  try {
    const body = grid.add(item.manifest, pos ?? item.manifest.defaultSize, !!item.mod.settings?.length);
    const previous = closing.get(id) ?? Promise.resolve();
    instances.set(id, previous.then(() => mount(item, body)).catch((e) => {
      console.error(`Widget „${id}“ se nepodařilo připojit`, e);
      showError(body, 'Widget se nepodařilo spustit.');
      return null;
    }));
  } catch (e) {
    console.error(`Widget „${id}“ se nepodařilo přidat na plochu`, e);
    grid.remove(id);
  }
  updateEmpty();
}

function disable(id) {
  if (!instances.has(id)) return;
  const pending = instances.get(id);
  instances.delete(id);
  grid.remove(id);
  const done = pending.then((inst) => inst?.destroy()).finally(() => {
    if (closing.get(id) === done) closing.delete(id);
  });
  closing.set(id, done);
  updateEmpty();
}

function renderLayout() {
  rendering = true;
  try {
    for (const id of [...instances.keys()]) disable(id);
    const layout = store.get().layout ?? defaultLayout.map((id) => ({ id }));
    for (const it of layout) enable(it.id, it);
  } finally {
    rendering = false;
  }
  updateEmpty();
}

await quickReady;

const catalog = createCatalog({
  getItems: () => loaded.map((l) => ({ id: l.entry.id, manifest: l.manifest })),
  isEnabled: (id) => instances.has(id),
  onToggle: (id, on) => {
    if (on) enable(id);
    else disable(id);
    persist();
  },
  onReset: () => { store.resetLayout(); renderLayout(); },
  onExport: () => {
    const date = new Date().toISOString().slice(0, 10);
    store.download(`rozcestnik-${date}.json`, store.exportJson());
  },
  getServiceUrl: () => store.get().serviceUrl,
  onServiceUrl: (value) => store.setServiceUrl(value),
  onBackground: (opts) => background.apply(opts),
  onLinksView: () => { applyOrder(); quick.render(); },
  onResetLinks: async () => { resetLinks(); await quick.load(); },
  onImport: async (text) => {
    // i widgety, které se zrovna nenačetly, ať o své nastavení a polohu nepřijdou
    const mins = new Map(loaded.map((l) => [l.entry.id, l.manifest?.minSize ?? { w: 1, h: 1 }]));
    const result = store.importJson(text, mins);
    if (result.ok) location.reload(); // téma, vyhledávač i plocha se načtou znovu
    return result;
  },
});

$('btn-settings').addEventListener('click', () => catalog.open());
$('btn-add-widget').addEventListener('click', () => catalog.open('Widgety'));

function setEditing(on) {
  $('btn-edit').setAttribute('aria-pressed', String(on));
  $('edit-bar').hidden = !on;
  grid.setEditing(on);
}

$('btn-edit-done').addEventListener('click', () => setEditing(false));

$('btn-edit').addEventListener('click', () => {
  setEditing($('btn-edit').getAttribute('aria-pressed') !== 'true');
});

// V jednosloupcovém režimu se úpravy vypnou.
window.matchMedia('(max-width: 640px)').addEventListener('change', (e) => {
  if (e.matches) setEditing(false);
});

renderLayout();
searchWidgets = loaded.filter((l) => l.manifest).map((l) => l.manifest);
