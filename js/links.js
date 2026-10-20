// Rychlé odkazy: vlastní úpravy z úložiště, jinak výchozí links.json.
// Plochý seznam; odkaz s „floor“ (1, 2, ...) patří do dalšího patra, bez něj do prvního.
import * as store from './store.js';

let fileCache = null;

function fromFile() {
  if (!fileCache) {
    fileCache = fetch('links.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => store.cleanLinks(list) ?? [])
      .catch((e) => {
        console.warn('links.json se nepodařilo načíst', e);
        return [];
      });
  }
  return fileCache;
}

export async function getLinks() {
  const own = store.get().links;
  return structuredClone(own ?? await fromFile());
}

export function saveLinks(list) {
  const clean = store.cleanLinks(list);
  if (!clean) throw new Error('Seznam odkazů musí být pole.');
  store.update((s) => { s.links = clean; });
}

export function resetLinks() {
  store.update((s) => { s.links = null; });
}
