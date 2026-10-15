// Obecný formulář nastavení vygenerovaný z `settings` widgetu.
// Typy: text, number, checkbox, select, multiselect (seznam vybraných položek + výběr dalších).

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// multiselect: options [{ value, label, group? }], hodnota je pole value v pořadí výběru.
function multiselect(def, initial) {
  const labelOf = new Map(def.options.map((o) => [o.value, o.label]));
  let chosen = (Array.isArray(initial) ? initial : String(initial || '').split(','))
    .map((v) => String(v).trim()).filter(Boolean);
  const box = el('div', 'ms');
  const list = el('ul', 'ms-list');
  const add = el('select', 'ms-add');
  add.setAttribute('aria-label', def.addLabel || 'Přidat');

  function renderList() {
    list.replaceChildren();
    if (!chosen.length) list.append(el('li', 'ms-empty', def.emptyLabel || 'Nic nevybráno'));
    chosen.forEach((v, i) => {
      const li = el('li', 'ms-item');
      li.append(el('span', '', labelOf.get(v) || v));
      const rm = el('button', 'ms-remove', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Odebrat ${labelOf.get(v) || v}`);
      rm.addEventListener('click', () => {
        chosen.splice(i, 1);
        renderList();
        (list.querySelectorAll('.ms-remove')[Math.min(i, chosen.length - 1)] ?? add).focus();
      });
      li.append(rm);
      list.append(li);
    });
  }

  const first = el('option', '', def.addLabel || 'Přidat…');
  first.value = '';
  add.append(first);
  const groups = new Map();
  for (const o of def.options) {
    let parent = add;
    if (o.group) {
      if (!groups.has(o.group)) {
        const g = el('optgroup');
        g.label = o.group;
        groups.set(o.group, g);
        add.append(g);
      }
      parent = groups.get(o.group);
    }
    const opt = el('option', '', o.label);
    opt.value = o.value;
    parent.append(opt);
  }
  add.addEventListener('change', () => {
    const v = add.value;
    add.value = '';
    if (v && !chosen.includes(v)) {
      chosen.push(v);
      renderList();
    }
  });

  renderList();
  box.append(list, add);
  box.getValue = () => [...chosen];
  return box;
}

export function openSettings({ title, defs, values, onSave }) {
  const dlg = document.createElement('dialog');
  const form = document.createElement('form');
  form.method = 'dialog';

  const h = document.createElement('h2');
  h.textContent = `Nastavení: ${title}`;
  form.append(h);

  const inputs = new Map();
  for (const d of defs) {
    // u multiselectu div: klik na popisek nesmí „kliknout“ na první tlačítko Odebrat
    const label = document.createElement(d.type === 'multiselect' ? 'div' : 'label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = d.label;

    let input;
    if (d.type === 'select') {
      input = document.createElement('select');
      for (const o of d.options || []) {
        const opt = document.createElement('option');
        const value = typeof o === 'object' ? o.value : o;
        opt.value = value;
        opt.textContent = typeof o === 'object' ? o.label : o;
        input.append(opt);
      }
      input.value = values[d.key];
    } else if (d.type === 'multiselect') {
      input = multiselect(d, values[d.key]);
    } else if (d.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!values[d.key];
    } else {
      input = document.createElement('input');
      input.type = d.type === 'number' ? 'number' : 'text';
      input.value = values[d.key] ?? '';
    }
    inputs.set(d.key, { input, def: d });
    label.append(span, input);
    form.append(label);
  }

  const row = document.createElement('div');
  row.className = 'dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Zrušit';
  cancel.addEventListener('click', () => dlg.close());
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Uložit';
  row.append(cancel, save);
  form.append(row);

  form.addEventListener('submit', () => {
    const out = {};
    for (const [key, { input, def }] of inputs) {
      if (def.type === 'checkbox') out[key] = input.checked;
      else if (def.type === 'multiselect') out[key] = input.getValue();
      else if (def.type === 'number') out[key] = input.value === '' ? def.default : Number(input.value);
      else out[key] = input.value;
    }
    onSave(out);
  });

  dlg.addEventListener('close', () => dlg.remove());
  dlg.append(form);
  document.body.append(dlg);
  dlg.showModal();
}
