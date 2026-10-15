// Panel nastavení (ozubené kolo): pozadí, vzhled, rychlé odkazy, widgety, servisní vrstva, data.
// Změny se projeví hned, bez tlačítka Uložit.
import * as store from './store.js';
import { THEMES, setTheme } from './theme.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, fn, cls = '') {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

function select(key, label, options, value, onChange) {
  const l = el('label', 'field row');
  const s = el('select');
  s.dataset.focus = key;
  for (const o of options) {
    const opt = el('option', '', o.label);
    opt.value = String(o.value);
    s.append(opt);
  }
  s.value = String(value);
  s.addEventListener('change', () => onChange(s.value));
  l.append(el('span', '', label), s);
  return l;
}

function checkbox(key, label, checked, onChange) {
  const l = el('label', 'field');
  const c = el('input');
  c.type = 'checkbox';
  c.dataset.focus = key;
  c.checked = checked;
  c.addEventListener('change', () => onChange(c.checked));
  l.append(c, el('span', '', label));
  return l;
}

// výchozí bledě zelená podle aktuálního motivu
function defaultColor() {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? '#17211b' : '#e3efdc';
}

export function createCatalog({
  getItems, isEnabled, onToggle, onReset, onExport, onImport,
  getServiceUrl, onServiceUrl, onBackground, onLinksView, onResetLinks, getLinksCount,
}) {
  const dlg = el('dialog', 'panel');
  dlg.setAttribute('aria-labelledby', 'panel-title');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // klik vedle panelu

  function render(message = '', focusKey = document.activeElement?.dataset?.focus) {
    const s = store.get();
    const head = el('div', 'panel-head');
    const h = el('h2', '', 'Nastavení');
    h.id = 'panel-title';
    const close = button('✕', () => dlg.close(), 'icon-btn plain');
    close.setAttribute('aria-label', 'Zavřít nastavení');
    close.dataset.focus = 'close';
    head.append(h, close);

    const sections = [];
    const section = (title, ...children) => {
      const sec = el('section', 'panel-section');
      sec.dataset.section = title;
      sec.append(el('h3', '', title), ...children);
      sections.push(sec);
      return sec;
    };

    // --- pozadí
    const bg = s.background;
    const setBg = (patch) => {
      store.update((st) => { Object.assign(st.background, patch); });
      onBackground({ fresh: true });
      render();
    };
    const seg = el('div', 'segmented');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Typ pozadí');
    for (const [value, label] of [['photo', 'Fotka'], ['color', 'Barva']]) {
      const b = button(label, () => { if (bg.mode !== value) setBg({ mode: value }); });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(bg.mode === value));
      b.dataset.focus = `bg-${value}`;
      seg.append(b);
    }
    const bgParts = [seg];
    if (bg.mode === 'photo') {
      bgParts.push(select('bg-every', 'Měnit fotku', [
        { value: 'day', label: 'Každý den' },
        { value: 'open', label: 'Při každém otevření' },
      ], bg.every, (v) => setBg({ every: v })));
      bgParts.push(el('p', 'hint', s.serviceUrl
        ? 'Zdroj: fotka dne z Bingu přes servisní vrstvu (když neodpovídá, Lorem Picsum).'
        : 'Zdroj: Lorem Picsum. S nastavenou servisní vrstvou se použije fotka dne z Bingu.'));
    } else {
      const row = el('div', 'field row');
      const color = el('input');
      color.type = 'color';
      color.dataset.focus = 'bg-color';
      color.value = bg.color || defaultColor();
      color.addEventListener('input', () => {
        store.update((st) => { st.background.color = color.value; });
        onBackground();
      });
      const label = el('label', '', 'Barva');
      color.id = 'panel-bg-color';
      label.htmlFor = color.id;
      const reset = button('Výchozí zelená', () => setBg({ color: null }), 'small');
      reset.dataset.focus = 'bg-color-reset';
      reset.disabled = !bg.color;
      const ctl = el('div', 'inline');
      ctl.append(color, reset);
      row.append(label, ctl);
      bgParts.push(row);
    }
    section('Pozadí', ...bgParts);

    // --- vzhled
    section('Vzhled', select('theme', 'Motiv', THEMES, s.theme, (v) => {
      setTheme(v);
      onBackground(); // výchozí barva pozadí se liší podle motivu
      render();
    }));

    // --- rychlé odkazy
    const lv = s.linksView;
    const setLv = (patch) => {
      store.update((st) => { Object.assign(st.linksView, patch); });
      onLinksView();
      render();
    };
    const linkParts = [
      checkbox('links-show', 'Zobrazit rychlé odkazy', lv.show, (v) => setLv({ show: v })),
      checkbox('search-top', 'Vyhledávač nad odkazy', lv.searchTop, (v) => setLv({ searchTop: v })),
    ];
    if (lv.show) {
      linkParts.push(
        select('links-rows', 'Počet řádků', [1, 2, 3].map((n) => ({ value: n, label: String(n) })), lv.rows, (v) => setLv({ rows: Number(v) })),
        select('links-per-row', 'Odkazů na řádek', [4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ value: n, label: String(n) })), lv.perRow, (v) => setLv({ perRow: Number(v) })),
      );
      const count = getLinksCount();
      const cap = lv.rows * lv.perRow;
      linkParts.push(el('p', 'hint', count > cap
        ? `Zobrazeno ${cap} z ${count} odkazů. Zbytek se ukáže po přidání řádku.`
        : `Odkazy přidáš dlaždicí „+“, upravíš přes ⋮ u dlaždice, pořadí změníš přetažením.`));
      linkParts.push(
        checkbox('google-icons', 'Ostřejší ikony přes Google', lv.googleIcons, (v) => setLv({ googleIcons: v })),
        el('p', 'hint', 'Když web sám nabízí jen malou ikonu (např. YouTube), vezme se větší od Googlu. Google tím uvidí domény tvých odkazů.'),
      );
    }
    const resetLinks = button('Obnovit výchozí odkazy', () => {
      if (!confirm('Zahodit úpravy odkazů a načíst výchozí z links.json?')) return;
      onResetLinks().then(() => render('Výchozí odkazy obnoveny.'));
    }, 'small');
    resetLinks.dataset.focus = 'links-reset';
    linkParts.push(resetLinks);
    section('Rychlé odkazy', ...linkParts);

    // --- widgety
    const list = el('ul', 'catalog-list');
    const items = getItems();
    if (!items.length) list.append(el('li', '', 'Zatím nejsou k dispozici žádné widgety.'));
    for (const it of items) {
      const li = el('li');
      const label = el('label');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.focus = `w-${it.id}`;
      cb.checked = isEnabled(it.id);
      cb.disabled = !it.manifest;
      cb.addEventListener('change', () => onToggle(it.id, cb.checked));
      const name = el('strong', '', it.manifest ? `${it.manifest.icon || ''} ${it.manifest.name}`.trim() : it.id);
      const desc = el('small', '', it.manifest ? it.manifest.description || '' : 'Widget se nepodařilo načíst.');
      label.append(cb, name, desc);
      li.append(label);
      list.append(li);
    }
    section('Widgety', list, el('p', 'hint', 'Přesouvat a zvětšovat je jde v režimu úprav (tužka vpravo nahoře).'));

    // --- servisní vrstva
    const service = el('form', 'catalog-service');
    service.noValidate = true;
    const serviceInput = el('input');
    serviceInput.type = 'url';
    serviceInput.placeholder = 'např. http://127.0.0.1:8787';
    serviceInput.setAttribute('aria-label', 'Adresa servisní vrstvy');
    serviceInput.dataset.focus = 'service';
    serviceInput.value = getServiceUrl() ?? '';
    const serviceSave = el('button', '', 'Uložit');
    serviceSave.type = 'submit';
    service.append(serviceInput, serviceSave);
    service.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onServiceUrl(serviceInput.value)) {
        onBackground({ fresh: true });
        render('Adresa servisní vrstvy uložena.');
      } else {
        msg.textContent = 'Adresa musí začínat http:// nebo https://.';
        serviceInput.focus();
      }
    });
    section('Servisní vrstva', service, el('p', 'hint', 'Volitelná. Potřebuje ji RSS čtečka a fotka dne z Bingu (node service/server.js).'));

    // --- data
    const file = el('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.hidden = true;
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const text = await f.text();
      file.value = '';
      const result = await onImport(text);
      render(result.ok ? 'Import proběhl.' : `Import selhal: ${result.error}`);
    });
    const actions = el('div', 'inline wrap');
    const mk = (text, fn, key) => {
      const b = button(text, fn, 'small');
      b.dataset.focus = key;
      return b;
    };
    actions.append(
      mk('Obnovit rozložení widgetů', () => {
        if (confirm('Obnovit výchozí rozložení? Nastavení widgetů zůstanou.')) {
          onReset();
          render('Výchozí rozložení obnoveno.');
        }
      }, 'reset'),
      mk('Export', onExport, 'export'),
      mk('Import', () => file.click(), 'import'),
      file,
    );
    section('Záloha', actions, el('p', 'hint', 'Export uloží odkazy, widgety, rozložení i vzhled do souboru JSON.'));

    const msg = el('p', 'catalog-message');
    msg.setAttribute('role', 'status');
    msg.textContent = message;

    const body = el('div', 'panel-body');
    body.append(...sections, msg);
    const scroll = dlg.querySelector('.panel-body')?.scrollTop ?? 0;
    dlg.replaceChildren(head, body);
    body.scrollTop = scroll;
    if (focusKey) dlg.querySelector(`[data-focus="${focusKey}"]`)?.focus();
  }

  return {
    // section: název sekce, na kterou se má panel posunout (např. „Widgety“)
    open(sectionName) {
      render('', null);
      dlg.showModal();
      if (sectionName) {
        const sec = dlg.querySelector(`[data-section="${sectionName}"]`);
        sec?.scrollIntoView({ block: 'start' });
        sec?.querySelector('input, select, button')?.focus();
      } else {
        dlg.querySelector('[data-focus="close"]')?.focus();
      }
    },
    refresh() { if (dlg.open) render(); },
  };
}
