// Vyhledávač: prefixy, návrhy z apps.json a widgetů, ovládání klávesnicí.
import { engines, findEngine, buildUrl } from './engines.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches = (query, ...fields) => {
  const q = norm(query);
  return fields.some((f) => f && norm(String(f)).includes(q));
};

// deps: { getApps, getLinks, getWidgets() -> [{id, name, icon, description}], onWidget(id),
//         getEngine(), setEngine(prefix) }
export function initSearch({ form, input, select, list }, deps) {
  for (const e of engines) {
    const o = document.createElement('option');
    o.value = e.prefix;
    o.textContent = e.name;
    select.append(o);
  }
  select.value = findEngine(deps.getEngine()) ? deps.getEngine() : engines[0].prefix;
  select.addEventListener('change', () => deps.setEngine(select.value));

  let rows = [];
  let active = -1;
  let seq = 0;

  function parse(raw) {
    const m = raw.match(/^(\S+)\s+(.+)$/);
    const engine = m && findEngine(m[1]);
    return engine ? { engine, text: m[2].trim() } : { engine: findEngine(select.value), text: raw.trim() };
  }

  function go(url) {
    window.location.assign(url);
  }

  async function update() {
    const my = ++seq;
    const { engine, text } = parse(input.value);
    if (!text) return close();

    const [apps, links] = await Promise.all([deps.getApps(), deps.getLinks?.() ?? []]);
    if (my !== seq) return; // mezitím přišel novější dotaz
    const next = [];
    const seen = new Set();
    for (const l of links) {
      if (matches(text, l.name, l.url)) {
        seen.add(l.url);
        next.push({ label: l.name, sub: 'odkaz', run: () => go(l.url) });
      }
    }
    for (const a of apps) {
      if (!seen.has(a.url) && matches(text, a.name, ...(a.tags || []), a.url)) {
        next.push({ label: `${a.icon || '🔗'} ${a.name}`, sub: 'aplikace', run: () => go(a.url) });
      }
    }
    for (const w of deps.getWidgets()) {
      if (matches(text, w.name, w.description)) {
        next.push({ label: `${w.icon || ''} ${w.name}`.trim(), sub: 'widget', run: () => deps.onWidget(w.id) });
      }
    }
    next.push({
      label: `Hledat „${text}“ v ${engine.name}`,
      sub: '',
      run: () => go(buildUrl(engine, text)),
    });
    rows = next;
    active = -1;
    render();
  }

  function render() {
    list.replaceChildren(...rows.map((r, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `search-opt-${i}`;
      li.setAttribute('aria-selected', String(i === active));
      li.classList.toggle('active', i === active);
      const a = document.createElement('span');
      a.textContent = r.label;
      const b = document.createElement('small');
      b.textContent = r.sub;
      li.append(a, b);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); r.run(); });
      return li;
    }));
    list.hidden = rows.length === 0;
    input.setAttribute('aria-expanded', String(rows.length > 0));
    if (active >= 0) input.setAttribute('aria-activedescendant', `search-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    seq++;
    rows = [];
    active = -1;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('input', update);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + d + rows.length) % rows.length;
      render();
    } else if (e.key === 'Escape') {
      if (rows.length) close();
      else input.value = '';
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (active >= 0 && rows[active]) return rows[active].run();
    const { engine, text } = parse(input.value);
    if (text) go(buildUrl(engine, text));
  });

  // „/“ přesune fokus do pole, pokud se zrovna nepíše jinde.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
    if (e.key === '/' && !typing && !document.querySelector('dialog[open]') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      input.focus();
    }
  });
}
