// Service worker rozcestníku: instalace jako aplikace + rychlé otevření i bez sítě.
// Stránka se otevře hned z uložené kopie a novou verzi souborů si stáhne na pozadí,
// změny (i v apps.json a links.json) se tedy projeví až při dalším otevření.
// Na localhostu (vývoj) jde naopak vše nejdřív ze sítě, ať jsou úpravy vidět hned.
// Cizí adresy a servisní vrstva (jiný port) se neřeší.
// Po změně seznamu souborů nebo chování zvyš VERSION, ať se stará cache smaže.
const VERSION = 'v2';
const CACHE = `rozcestnik-${VERSION}`;
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

// Jádro stránky, ať jde otevřít bez sítě hned po instalaci. Co tu chybí, uloží se při prvním použití.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apps.json',
  './links.json',
  './css/base.css',
  './css/links.css',
  './css/grid.css',
  './css/search.css',
  './js/main.js',
  './js/store.js',
  './js/theme.js',
  './js/apps.js',
  './js/links.js',
  './js/quicklinks.js',
  './js/background.js',
  './js/grid.js',
  './js/host.js',
  './js/catalog.js',
  './js/settings-dialog.js',
  './js/search/search.js',
  './js/search/engines.js',
  './widgets/registry.js',
  './widgets/clock.js',
  './widgets/apps.js',
  './widgets/rss.js',
  './vendor/gridstack/gridstack-all.js',
  './vendor/gridstack/gridstack.min.css',
  './vendor/fonts/plus-jakarta-sans/latin.woff2',
  './vendor/fonts/plus-jakarta-sans/latin-ext.woff2',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' = čerstvě ze serveru, ne z mezipaměti prohlížeče
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('rozcestnik-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stáhne ze sítě a uloží kopii.
async function fetchAndStore(req) {
  const res = await fetch(req);
  if (res.ok && res.type === 'basic' && !res.redirected) {
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone());
  }
  return res;
}

// Uložená kopie; pro samotnou stránku i se záložní adresou.
async function fromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit || req.mode !== 'navigate') return hit;
  return (await cache.match('./')) || cache.match('./index.html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const network = fetchAndStore(req);

  if (DEV) {
    event.respondWith(network.catch(async () => (await fromCache(req)) || Response.error()));
    return;
  }
  // aktualizace dobíhá na pozadí i po odpovědi z cache
  event.waitUntil(network.catch(() => {}));
  event.respondWith((async () => (await fromCache(req)) || network.catch(() => Response.error()))());
});
