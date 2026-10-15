// RSS čtečka: více kanálů přes servisní vrstvu, označení přečtených.
export const manifest = {
  id: 'rss',
  name: 'RSS čtečka',
  icon: '📰',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  description: 'Novinky z RSS a Atom kanálů. Potřebuje servisní vrstvu.',
};

export const settings = [
  { key: 'feeds', label: 'Adresy kanálů (oddělené čárkou)', type: 'text', default: '' },
];

const LIMIT = 30;
const READ_KEEP = 500;
const REFRESH_MS = 15 * 60 * 1000;

const STYLE = `
.w-rss { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.w-rss .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.w-rss .count { flex: 1; white-space: nowrap; color: var(--muted); font-size: 0.85rem; }
.w-rss .bar button { min-height: 0; padding: 4px 10px; font-size: 0.85rem; }
.w-rss .note { margin: 0; color: var(--muted); font-size: 0.9rem; }
.w-rss .error { margin: 0; color: var(--danger); font-size: 0.85rem; }
.w-rss ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
.w-rss li a { display: grid; grid-template-columns: 10px minmax(0, 1fr); column-gap: 8px; padding: 8px 8px;
  border-radius: var(--radius-sm); color: inherit; text-decoration: none; }
.w-rss li a:hover { background: var(--surface-2); }
.w-rss .dot { width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--accent); }
.w-rss .read .dot { visibility: hidden; }
.w-rss .title { font-weight: 600; overflow-wrap: anywhere; }
.w-rss .read .title { font-weight: 400; color: var(--muted); }
.w-rss .meta { grid-column: 2; color: var(--muted); font-size: 0.8rem; }
`;

let root = null;
let ctx = null;
let timer = null;
let controller = null;
let items = [];
let errors = [];
let status = 'loading'; // loading | ready | no-service | unreachable | forbidden | no-feeds
let loading = false; // obnovení běží, staré položky zůstávají vidět
let read = new Set();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, onClick, act) {
  const b = el('button', '', text);
  b.type = 'button';
  b.dataset.act = act;
  b.addEventListener('click', onClick);
  return b;
}

const parseFeeds = (text) => String(text || '').split(',').map((s) => s.trim()).filter(Boolean);

function httpUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const stripHtml = (t) => new DOMParser().parseFromString(t, 'text/html').body.textContent.trim();

// Text prvku. HTML se odstraní u Atomu s type="html", u RSS, když text obsahuje značku.
function textOf(parent, names) {
  for (const child of parent.children) {
    if (!names.includes(child.localName)) continue;
    const t = child.textContent.trim();
    const type = child.getAttribute('type');
    if (type === 'html') return stripHtml(t);
    if (type === null && /<\/?[a-z][^<>]*>/i.test(t)) return stripHtml(t);
    return t;
  }
  return '';
}

// Date.parse nezná CET/CEST; budoucí data (chybné kanály) se nesmí řadit nad aktuální.
function parseDate(text) {
  const ts = Date.parse(text.replace(/\bCEST\b/, '+0200').replace(/\bCET\b/, '+0100')) || 0;
  return Math.min(ts, Date.now());
}

function linkOf(entry, base) {
  for (const child of entry.children) {
    if (child.localName !== 'link') continue;
    const href = child.getAttribute('href');
    if (href && (!child.getAttribute('rel') || child.getAttribute('rel') === 'alternate')) return httpUrl(href, base);
    if (!href && child.textContent.trim()) return httpUrl(child.textContent.trim(), base);
  }
  const guid = [...entry.children].find((c) => c.localName === 'guid' && c.getAttribute('isPermaLink') !== 'false');
  return guid ? httpUrl(guid.textContent.trim(), base) : null;
}

// RSS 2.0, RSS 1.0 (RDF) i Atom.
export function parseFeed(xml, feedUrl) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Kanál není platné XML.');
  const top = doc.documentElement;
  if (!['rss', 'RDF', 'feed'].includes(top.localName)) throw new Error('Nejde o RSS ani Atom.');
  const isAtom = top.localName === 'feed';
  const channel = isAtom ? top : [...top.children].find((c) => c.localName === 'channel') ?? top;
  const source = textOf(channel, ['title']) || new URL(feedUrl).hostname;
  const entries = [...top.getElementsByTagNameNS('*', isAtom ? 'entry' : 'item')];
  return entries.map((entry) => {
    const link = linkOf(entry, feedUrl);
    const title = textOf(entry, ['title']) || link || '(bez názvu)';
    const date = parseDate(textOf(entry, ['pubDate', 'date', 'updated', 'published']));
    const id = textOf(entry, ['guid', 'id']) || link || `${title}|${date}`;
    return { key: `${feedUrl}|${id}`, title, link, date, source };
  });
}

// Kódování z hlavičky nebo z XML prologu (např. windows-1250), jinak UTF-8.
function decode(buffer, contentType) {
  const head = new TextDecoder('ascii').decode(buffer.slice(0, 200));
  const label = /charset=([\w-]+)/i.exec(contentType || '')?.[1] || /encoding=["']([\w-]+)["']/i.exec(head)?.[1] || 'utf-8';
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return new TextDecoder().decode(buffer);
  }
}

const rtf = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' });
function ago(ts) {
  if (!ts) return '';
  const min = Math.round((ts - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

function saveRead() {
  const keep = [...read].slice(-READ_KEEP);
  read = new Set(keep);
  ctx.storage.set('read', keep);
}

function markRead(keys) {
  keys.forEach((k) => { read.delete(k); read.add(k); }); // nově přečtené na konec
  saveRead();
  render();
}

async function refresh() {
  if (!ctx) return;
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const feeds = parseFeeds(ctx.settings.feeds);

  if (!ctx.service.url) { status = 'no-service'; return render(); }
  if (!feeds.length) { status = 'no-feeds'; return render(); }
  if (status !== 'ready') status = 'loading';
  loading = true;
  render();

  try {
    await ctx.service.fetch('/health', { signal });
  } catch (e) {
    if (signal.aborted || !ctx) return;
    status = /\b403\b/.test(e.message) ? 'forbidden' : 'unreachable';
    loading = false;
    return render();
  }
  if (signal.aborted || !ctx) return;

  const results = await Promise.allSettled(feeds.map(async (url) => {
    const res = await ctx.service.fetch(`/feed?url=${encodeURIComponent(url)}`, { signal });
    return parseFeed(decode(await res.arrayBuffer(), res.headers.get('content-type')), url);
  }));
  if (signal.aborted || !ctx) return;

  errors = results.flatMap((r, i) => (r.status === 'rejected' ? [`Kanál ${feeds[i]} se nepodařilo načíst.`] : []));
  const seen = new Set(); // stejný kanál zadaný dvakrát
  items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((it) => !seen.has(it.key) && seen.add(it.key))
    .sort((a, b) => b.date - a.date)
    .slice(0, LIMIT);
  status = 'ready';
  loading = false;
  render();
}

const MESSAGES = {
  loading: 'Načítám…',
  'no-service': 'Servisní vrstva není nastavená (Widgety → Adresa servisní vrstvy).',
  unreachable: 'Servisní vrstva je nedostupná.',
  forbidden: 'Servisní vrstva odmítla tuto adresu rozcestníku. Přidej ji do ALLOWED_ORIGINS.',
  'no-feeds': 'Zatím žádné kanály. Přidej je v nastavení widgetu (⚙).',
};

function render() {
  if (!root) return;
  // po překreslení vrátit fokus na stejné tlačítko (nebo na Obnovit, když zmizelo)
  const act = root.contains(document.activeElement) ? document.activeElement.dataset.act : null;
  const unread = items.filter((it) => !read.has(it.key));
  const bar = el('div', 'bar');
  bar.append(el('span', 'count', status !== 'ready' ? '' : loading ? 'Načítám…' : `Nepřečtené: ${unread.length}`), button('Obnovit', refresh, 'refresh'));
  if (status === 'ready' && unread.length) bar.append(button('Vše přečteno', () => markRead(unread.map((it) => it.key)), 'read-all'));

  const parts = [bar];
  if (status !== 'ready') parts.push(el('p', 'note', MESSAGES[status]));
  else {
    parts.push(...errors.map((t) => el('p', 'error', t)));
    if (!items.length && !errors.length) parts.push(el('p', 'note', 'Kanály jsou prázdné.'));
    const list = el('ul');
    for (const it of items) {
      const li = el('li', read.has(it.key) ? 'read' : '');
      const a = el(it.link ? 'a' : 'div');
      if (it.link) {
        a.href = it.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.addEventListener('click', () => markRead([it.key]));
        a.addEventListener('auxclick', (e) => { if (e.button === 1) markRead([it.key]); });
      }
      a.append(el('span', 'dot'), el('span', 'title', it.title), el('span', 'meta', [it.source, ago(it.date)].filter(Boolean).join(' · ')));
      li.append(a);
      list.append(li);
    }
    parts.push(list);
  }
  root.replaceChildren(...parts);
  if (act) (root.querySelector(`[data-act="${act}"]`) ?? root.querySelector('[data-act="refresh"]'))?.focus();
}

export function init(container, context) {
  ctx = context;
  read = new Set(ctx.storage.get('read', []));
  const style = document.createElement('style');
  style.textContent = STYLE;
  root = el('div', 'w-rss');
  container.append(style, root);
  ctx.onSettings(refresh);
  timer = setInterval(refresh, REFRESH_MS);
  refresh();
}

export function destroy() {
  clearInterval(timer);
  controller?.abort();
  timer = null;
  controller = null;
  root = null;
  ctx = null;
  items = [];
  errors = [];
  status = 'loading';
  loading = false;
  read = new Set();
}
