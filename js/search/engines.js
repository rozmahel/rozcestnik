// Vyhledávače a jejich prefixy. %s se nahradí zakódovaným dotazem.
export const engines = [
  { prefix: 'g', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { prefix: 'd', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { prefix: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  { prefix: 'w', name: 'Wikipedie', url: 'https://cs.wikipedia.org/w/index.php?search=%s' },
  { prefix: 'm', name: 'Mapy.cz', url: 'https://mapy.cz/zakladni?q=%s' },
];

export const findEngine = (prefix) => engines.find((e) => e.prefix === prefix);
export const buildUrl = (engine, query) => engine.url.replace('%s', encodeURIComponent(query));
