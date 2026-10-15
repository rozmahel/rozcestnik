// Registr widgetů. Nový widget = soubor v widgets/ + jeden řádek zde.
// Moduly se načítají líně, chyba v jednom nezastaví ostatní.
export const widgets = [
  { id: 'clock', load: () => import('./clock.js') },
  { id: 'apps', load: () => import('./apps.js') },
  { id: 'rss', load: () => import('./rss.js') },
];

// Výchozí rozložení: id widgetů v pořadí, pozice se dopočítají z defaultSize.
export const defaultLayout = [
  'clock', 'apps',
];
