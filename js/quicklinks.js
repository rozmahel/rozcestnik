// Rychlé odkazy nad vyhledávačem: dlaždice s ikonou, až 3 řádky, přidání, úprava, odebrání, přeřazení.
// Ikony se berou ze samotné stránky (HTML, apple-touch-icon, favicon.ico); přes Google jen po zapnutí v nastavení.
const ICON_KEY = 'rozcestnik:icons2';
try { localStorage.removeItem('rozcestnik:icons'); } catch { /* starý formát mezipaměti */ }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const isHttp = (url) => {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
};

// „github.com“ -> „https://github.com“
function normalizeUrl(text) {
  const t = text.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Zapamatované ikony podle adresy odkazu: { u: url nebo '' (nic nenalezeno), w: šířka, t: čas }.
// Neúspěch se po 3 dnech zkusí znovu (třeba byl jen výpadek sítě).
const RETRY_MS = 3 * 24 * 60 * 60 * 1000;
const iconCache = {
  all() {
    try { return JSON.parse(localStorage.getItem(ICON_KEY)) || {}; } catch { return {}; }
  },
  get(key) {
    const e = this.all()[key];
    if (!e || typeof e.u !== 'string') return undefined;
    if (e.u === '' && Date.now() - (e.t || 0) > RETRY_MS) return undefined;
    return e;
  },
  set(key, value) {
    try {
      const all = this.all();
      if (value === undefined) delete all[key];
      else all[key] = { ...value, t: Date.now() };
      localStorage.setItem(ICON_KEY, JSON.stringify(all));
    } catch { /* bez úložiště se jen nic nezapamatuje */ }
  },
  clear() {
    try { localStorage.removeItem(ICON_KEY); } catch { /* nevadí */ }
  },
};

const isImageSrc = (u) => isHttp(u) || /^data:image\//i.test(u);

// Načte obrázek a vrátí jeho šířku (0 = nejde). SVG bez rozměrů bere jako ostré.
function probe(src, ms = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => { img.src = ''; resolve(0); }, ms);
    img.onload = () => {
      clearTimeout(t);
      const svg = /\.svg(\?|$)|^data:image\/svg/i.test(src);
      resolve(img.naturalWidth || (svg ? 512 : 0));
    };
    img.onerror = () => { clearTimeout(t); resolve(0); };
    img.src = src;
  });
}

// Ikony deklarované v HTML stránky (<link rel="icon">, apple-touch-icon).
// Jde jen u webů, které dovolí čtení odjinud (např. GitHub Pages); jinak prázdný seznam.
async function pageIcons(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return [];
    const html = (await res.text()).slice(0, 300_000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = res.url || url;
    const found = [];
    for (const l of doc.querySelectorAll('link[rel][href]')) {
      const rel = l.getAttribute('rel').toLowerCase().split(/\s+/);
      const touch = rel.some((r) => r.startsWith('apple-touch-icon'));
      if (!touch && !rel.includes('icon')) continue;
      let href;
      try { href = new URL(l.getAttribute('href'), base).href; } catch { continue; }
      if (!isImageSrc(href)) continue;
      const sizes = l.getAttribute('sizes') || '';
      const size = /any/i.test(sizes) || /svg/i.test(l.getAttribute('type') || href) ? 512
        : Math.max(0, ...sizes.split(/\s+/).map((x) => parseInt(x, 10) || 0));
      found.push({ href, rank: (touch ? 1000 : 0) + (size || (touch ? 180 : 16)) });
    }
    return found.sort((a, b) => b.rank - a.rank).map((f) => f.href);
  } catch {
    return [];
  }
}

// Najde nejostřejší ikonu: z HTML stránky, z obvyklých adres, volitelně přes Google.
async function resolveIcon(url, google) {
  let u;
  try { u = new URL(url); } catch { return { u: '', w: 0 }; }
  const dir = u.href.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); // složka stránky (GitHub Pages projekty)
  const candidates = [...await pageIcons(url)];
  for (const root of new Set([dir, `${u.origin}/`])) {
    candidates.push(`${root}apple-touch-icon.png`, `${root}apple-touch-icon-precomposed.png`, `${root}favicon.ico`);
  }
  let best = { u: '', w: 0 };
  for (const c of new Set(candidates)) {
    const w = await probe(c);
    if (w >= 64) return { u: c, w };
    if (w > best.w) best = { u: c, w };
  }
  if (google) {
    const g = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
    const w = await probe(g);
    if (w > Math.max(best.w, 32)) return { u: g, w };
  }
  return best;
}

const pending = new Map(); // adresa -> Promise, ať se jedna stránka nehledá víckrát najednou

function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function letter(link) {
  const span = el('span', 'ql-letter', (link.name || hostOf(link.url)).trim().charAt(0).toUpperCase());
  span.style.setProperty('--h', hue(hostOf(link.url)));
  return span;
}

function imgEl(src, w) {
  const img = el('img', w && w < 48 ? 'small' : '');
  img.alt = '';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = src;
  return img;
}

// Ikona: vlastní (emoji nebo adresa obrázku), jinak nalezená, jinak písmeno.
function icon(link, google) {
  const box = el('span', 'ql-ico');
  const custom = link.icon?.trim();
  if (custom && !isHttp(custom)) {
    box.append(el('span', 'ql-emoji', custom));
    return box;
  }
  if (custom) {
    const img = imgEl(custom);
    img.addEventListener('error', () => img.replaceWith(letter(link)), { once: true });
    box.append(img);
    return box;
  }

  const key = `${google ? 'g|' : ''}${link.url}`;
  const cached = iconCache.get(key);
  if (cached) {
    if (!cached.u) { box.append(letter(link)); return box; }
    const img = imgEl(cached.u, cached.w);
    img.addEventListener('error', () => { iconCache.set(key, undefined); img.replaceWith(letter(link)); }, { once: true });
    box.append(img);
    return box;
  }

  const placeholder = letter(link);
  box.append(placeholder);
  if (!pending.has(key)) {
    pending.set(key, resolveIcon(link.url, google).then((r) => {
      iconCache.set(key, r);
      pending.delete(key);
      return r;
    }));
  }
  pending.get(key).then((r) => { if (r.u && placeholder.isConnected) placeholder.replaceWith(imgEl(r.u, r.w)); });
  return box;
}

export const clearIconCache = () => iconCache.clear();

// deps: { getLinks, saveLinks, getView }
export function createQuickLinks(root, { getLinks, saveLinks, getView }) {
  let links = [];
  let dragFrom = null;

  // sdílené menu u dlaždice
  const menu = el('div', 'ql-pop');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let menuFor = null;

  function closeMenu(returnFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (returnFocus) root.querySelector(`.ql[data-i="${menuFor}"] .ql-more`)?.focus();
    menuFor = null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.ql-more')) closeMenu(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(true); });
  window.addEventListener('resize', () => closeMenu(false));

  function openMenu(i, anchor) {
    if (menuFor === i && !menu.hidden) return closeMenu(true);
    menuFor = i;
    const item = (text, fn, cls = '') => {
      const b = el('button', cls, text);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(false); fn(); });
      return b;
    };
    const items = [item('Upravit', () => openEditor(i))];
    if (i > 0) items.push(item('Posunout doleva', () => move(i, i - 1)));
    if (i < links.length - 1) items.push(item('Posunout doprava', () => move(i, i + 1)));
    items.push(item('Odebrat', () => remove(i), 'danger'));
    menu.replaceChildren(...items);
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w + 8)) + window.scrollX}px`;
    menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
    menu.querySelector('button')?.focus();
  }

  function persist(list, focusIndex) {
    saveLinks(list);
    links = list;
    render();
    if (focusIndex !== undefined) {
      (root.querySelector(`.ql[data-i="${focusIndex}"] .ql-link`) ?? root.querySelector('.ql-add'))?.focus();
    }
  }

  function move(from, to) {
    const list = [...links];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    persist(list, to);
  }

  function remove(i) {
    if (!confirm(`Odebrat odkaz „${links[i].name}“?`)) return;
    persist(links.filter((_, j) => j !== i), Math.min(i, links.length - 2));
  }

  function openEditor(index) {
    const link = index >= 0 ? links[index] : { name: '', url: '' };
    const dlg = el('dialog');
    const form = el('form');
    form.noValidate = true;
    form.append(el('h2', '', index >= 0 ? 'Upravit odkaz' : 'Přidat odkaz'));

    const field = (label, value, type, placeholder) => {
      const l = el('label', 'field');
      const input = el('input');
      input.type = type;
      input.value = value;
      input.placeholder = placeholder;
      l.append(el('span', '', label), input);
      form.append(l);
      return input;
    };
    const url = field('Adresa', link.url, 'url', 'např. github.com');
    const name = field('Název', link.name, 'text', 'doplní se z adresy');
    const ico = field('Ikona (volitelně: emoji nebo adresa obrázku)', link.icon || '', 'text', 'prázdné = ikona stránky');
    const error = el('p', 'form-error');
    error.setAttribute('role', 'alert');

    const row = el('div', 'dialog-actions');
    const cancel = el('button', '', 'Zrušit');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dlg.close());
    const save = el('button', 'primary', index >= 0 ? 'Uložit' : 'Přidat');
    save.type = 'submit';
    row.append(cancel, save);
    form.append(error, row);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const href = normalizeUrl(url.value);
      if (!isHttp(href)) { error.textContent = 'Zadej platnou webovou adresu.'; url.focus(); return; }
      const iconText = ico.value.trim();
      if (iconText && /^[a-z]+:/i.test(iconText) && !isHttp(iconText)) {
        error.textContent = 'Adresa ikony musí začínat http:// nebo https://.';
        ico.focus();
        return;
      }
      const item = { name: name.value.trim() || hostOf(href), url: href };
      iconCache.set(href, undefined);
      iconCache.set(`g|${href}`, undefined);
      if (iconText) item.icon = iconText;
      const list = [...links];
      if (index >= 0) list[index] = item;
      else list.push(item);
      dlg.close();
      persist(list, index >= 0 ? index : list.length - 1);
    });

    dlg.addEventListener('close', () => dlg.remove());
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    url.focus();
  }

  function tile(link, i, draggable) {
    const box = el('div', 'ql');
    box.dataset.i = i;
    const a = el('a', 'ql-link');
    a.href = link.url;
    a.title = link.url;
    a.rel = 'noreferrer';
    a.draggable = false;
    a.append(icon(link, !!getView().googleIcons), el('span', 'ql-name', link.name));
    const more = el('button', 'ql-more', '⋮');
    more.type = 'button';
    more.title = 'Možnosti';
    more.setAttribute('aria-label', `Možnosti: ${link.name}`);
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', () => openMenu(i, more));
    box.append(a, more);

    if (draggable) {
      box.draggable = true;
      box.addEventListener('dragstart', (e) => {
        dragFrom = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', link.url);
        box.classList.add('dragging');
      });
      box.addEventListener('dragend', () => {
        dragFrom = null;
        box.classList.remove('dragging');
        root.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
      });
      box.addEventListener('dragover', (e) => {
        if (dragFrom === null || dragFrom === i) return;
        e.preventDefault();
        box.classList.add('drop');
      });
      box.addEventListener('dragleave', () => box.classList.remove('drop'));
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom !== null && dragFrom !== i) move(dragFrom, i);
      });
    }
    return box;
  }

  function render() {
    closeMenu(false);
    const view = getView();
    root.hidden = !view.show;
    if (!view.show) return;
    const capacity = view.rows * view.perRow;
    root.style.setProperty('--per-row', view.perRow);
    root.style.setProperty('--rows', view.rows);
    const shown = links.slice(0, capacity);
    const tiles = shown.map((l, i) => tile(l, i, true));
    if (links.length < capacity) {
      const add = el('button', 'ql ql-add');
      add.type = 'button';
      add.setAttribute('aria-label', 'Přidat odkaz');
      add.title = 'Přidat odkaz';
      const plus = el('span', 'ql-ico');
      plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      add.append(plus, el('span', 'ql-name', 'Přidat'));
      add.addEventListener('click', () => openEditor(-1));
      tiles.push(add);
    }
    root.replaceChildren(...tiles);
  }

  return {
    async load() {
      links = await getLinks();
      render();
    },
    render,
    count: () => links.length,
  };
}
