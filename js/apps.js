// Seznam aplikací: vlastní úpravy z úložiště, jinak výchozí apps.json.
import * as store from './store.js';

let fileCache = null;

// Výchozí seznam z apps.json. Při chybě prázdný seznam.
function fromFile() {
  if (!fileCache) {
    fileCache = fetch('apps.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => store.cleanApps(list) ?? [])
      .catch((e) => {
        console.warn('apps.json se nepodařilo načíst', e);
        return [];
      });
  }
  return fileCache;
}

// Vrací kopii, ať volající nemůže měnit uložený stav.
export async function getApps() {
  const own = store.get().apps;
  const list = own ?? await fromFile();
  return structuredClone(list);
}

// Uloží vlastní seznam (neplatné položky zahodí).
export function saveApps(list) {
  const clean = store.cleanApps(list);
  if (!clean) throw new Error('Seznam aplikací musí být pole.');
  store.update((s) => { s.apps = clean; });
}

// Zpět na apps.json.
export function resetApps() {
  store.update((s) => { s.apps = null; });
}
