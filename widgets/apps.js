// Mé aplikace: dlaždice odkazů (výchozí seznam z apps.json), správa (přidat, upravit, smazat, seřadit) přímo ve widgetu.
export const manifest = {
  id: 'apps',
  name: 'Mé aplikace',
  icon: '🧭',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  description: 'Odkazy na tvé aplikace (výchozí seznam z apps.json), se správou přímo na ploše.',
};

const STYLE = `
.w-apps { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.w-apps .bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.w-apps .bar.start { justify-content: flex-start; }
.w-apps .small { min-height: 0; padding: 4px 10px; font-size: 0.85rem; }
.w-apps .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.w-apps .tile { display: grid; justify-items: center; gap: 6px; padding: 10px 6px; border-radius: var(--radius-sm);
  color: inherit; text-decoration: none; text-align: center; min-width: 0; }
.w-apps .tile:hover { background: var(--surface-2); }
.w-apps .ico { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px;
  background: var(--accent-soft); color: var(--accent); font-size: 1.35rem; font-weight: 700; }
.w-apps .name { font-size: 0.85rem; font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w-apps .empty { color: var(--muted); margin: 0; }
.w-apps .list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.w-apps .row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 6px 8px; border-radius: var(--radius-sm); background: var(--surface-2); }
.w-apps .row .ico { width: 30px; height: 30px; border-radius: 8px; font-size: 1rem; flex: none; }
.w-apps .row .name { flex: 1 1 6em; min-width: 0; text-align: left; }
.w-apps .row button { flex: none; min-height: 0; padding: 3px 7px; border: 0; background: none; color: var(--muted); }
.w-apps .row button:hover:not(:disabled) { color: var(--text); background: var(--surface); }
.w-apps .row button.danger:hover { color: var(--danger); }
.w-apps .row button:disabled { opacity: 0.35; cursor: default; }
.w-apps form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.w-apps label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--muted); }
.w-apps label input { width: 100%; min-width: 0; color: var(--text); }
.w-apps .error { color: var(--danger); font-size: 0.85rem; margin: 0; }
.w-apps-live { position: absolute; top: 0; left: 0; margin: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

let root = null;
let live = null; // oznámení pro čtečky obrazovky
let ctx = null;
let apps = [];
let managing = false;
let editing = null; // null = žádný formulář, -1 = nová aplikace, jinak index
let busy = false; // ukládání běží, další změny se ignorují
let gen = 0; // zvyšuje se při init/destroy, ať pozdní odpověď nepřepíše novou instanci

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, onClick, cls = '', title) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', onClick);
  return b;
}

function icon(app) {
  return el('span', 'ico', app.icon || app.name.trim().charAt(0).toUpperCase());
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

function uniqueId(name, skip) {
  const base = slug(name);
  let id = base;
  for (let i = 2; apps.some((a, j) => j !== skip && a.id === id); i++) id = `${base}-${i}`;
  return id;
}

const isHttp = (url) => {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
};

const rowButton = (i, sel) => root?.querySelectorAll('.row')[i]?.querySelector(sel);

async function reload() {
  const g = gen;
  const list = await ctx?.getApps();
  if (g === gen && root) apps = list;
}

// Uloží seznam, překreslí a vrátí fokus (selektor nebo funkce vracející prvek).
async function change(list, focus, message) {
  if (busy || !ctx) return;
  busy = true;
  try {
    ctx.saveApps(list);
    await reload();
  } finally {
    busy = false;
  }
  render(focus);
  if (message && live) live.textContent = message;
}

function renderTiles() {
  if (!apps.length) return el('p', 'empty', 'Zatím žádné aplikace. Přidáš je přes „Spravovat“.');
  const tiles = el('div', 'tiles');
  for (const app of apps) {
    const a = el('a', 'tile');
    a.href = app.url;
    a.rel = 'noopener noreferrer';
    a.title = app.url;
    a.append(icon(app), el('span', 'name', app.name));
    tiles.append(a);
  }
  return tiles;
}

function renderForm() {
  const index = editing;
  const app = index >= 0 ? apps[index] : { name: '', url: 'https://' };
  const back = () => (index >= 0 ? rowButton(index, '.edit') : root?.querySelector('.add'));
  const form = el('form');
  form.noValidate = true;
  const field = (label, value, type = 'text', placeholder = '') => {
    const l = el('label', '', label);
    const input = el('input');
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    l.append(input);
    form.append(l);
    return input;
  };
  const name = field('Název', app.name);
  const url = field('Adresa', app.url, 'url');
  const ico = field('Ikona (emoji, volitelně)', app.icon || '', 'text', 'např. 📒');
  const tags = field('Štítky (oddělené čárkou)', (app.tags || []).join(', '));
  const error = el('p', 'error');
  error.setAttribute('role', 'alert');

  const actions = el('div', 'bar');
  const submit = el('button', 'primary', index >= 0 ? 'Uložit' : 'Přidat');
  submit.type = 'submit';
  actions.append(button('Zrušit', () => { editing = null; render(back); }), submit);
  form.append(error, actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { error.textContent = 'Vyplň název.'; name.focus(); return; }
    if (!isHttp(url.value.trim())) { error.textContent = 'Adresa musí začínat http:// nebo https://.'; url.focus(); return; }
    const item = {
      id: index >= 0 && apps[index].id ? apps[index].id : uniqueId(name.value, index),
      name: name.value.trim(),
      url: url.value.trim(),
      icon: ico.value.trim(),
      tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const list = [...apps];
    if (index >= 0) list[index] = item;
    else list.push(item);
    editing = null;
    await change(list, back, index >= 0 ? `Aplikace ${item.name} upravena.` : `Aplikace ${item.name} přidána.`);
  });
  queueMicrotask(() => name.focus());
  return form;
}

function move(i, delta) {
  const list = [...apps];
  const [item] = list.splice(i, 1);
  list.splice(i + delta, 0, item);
  const to = i + delta;
  // fokus zůstane na stejném tlačítku přesunuté položky
  const focus = () => rowButton(to, `${delta < 0 ? '.up' : '.down'}:not(:disabled)`) ?? rowButton(to, 'button:not(:disabled)');
  return change(list, focus, `${item.name}: pozice ${to + 1} z ${list.length}.`);
}

function renderManage() {
  const parts = [];
  const list = el('ul', 'list');
  apps.forEach((app, i) => {
    const li = el('li', 'row');
    const up = button('↑', () => move(i, -1), 'up', `Posunout ${app.name} nahoru`);
    const down = button('↓', () => move(i, 1), 'down', `Posunout ${app.name} dolů`);
    up.disabled = i === 0;
    down.disabled = i === apps.length - 1;
    li.append(
      icon(app),
      el('span', 'name', app.name),
      up,
      down,
      button('✎', () => { editing = i; render(); }, 'edit', `Upravit ${app.name}`),
      button('✕', () => {
        if (!confirm(`Smazat aplikaci „${app.name}“?`)) return;
        const next = Math.min(i, apps.length - 2);
        change(apps.filter((_, j) => j !== i), () => rowButton(next, '.edit') ?? root?.querySelector('.add'), `Aplikace ${app.name} smazána.`);
      }, 'danger', `Smazat ${app.name}`),
    );
    list.append(li);
  });
  parts.push(apps.length ? list : el('p', 'empty', 'Seznam je prázdný.'));

  if (editing !== null) {
    parts.push(renderForm());
  } else {
    const bottom = el('div', 'bar start');
    bottom.append(
      button('Přidat aplikaci', () => { editing = -1; render(); }, 'small add'),
      button('Obnovit z apps.json', async () => {
        if (!confirm('Zahodit úpravy a načíst seznam z apps.json?') || !ctx) return;
        ctx.resetApps();
        await reload();
        render('.reset');
      }, 'small reset'),
    );
    parts.push(bottom);
  }
  return parts;
}

function render(focus) {
  if (!root) return;
  const bar = el('div', 'bar');
  const toggle = button(managing ? 'Hotovo' : 'Spravovat', () => {
    managing = !managing;
    editing = null;
    render('.toggle');
  }, 'small toggle');
  toggle.setAttribute('aria-pressed', String(managing));
  bar.append(toggle);
  root.replaceChildren(bar, ...(managing ? renderManage() : [renderTiles()]));
  const target = typeof focus === 'function' ? focus() : focus && root.querySelector(focus);
  target?.focus();
}

export async function init(container, context) {
  gen++;
  ctx = context;
  const style = document.createElement('style');
  style.textContent = STYLE;
  root = el('div', 'w-apps');
  live = el('p', 'w-apps-live');
  live.setAttribute('aria-live', 'polite');
  container.append(style, root, live);
  await reload();
  render();
}

export function destroy() {
  gen++;
  root = null;
  live = null;
  ctx = null;
  apps = [];
  managing = false;
  editing = null;
  busy = false;
}
