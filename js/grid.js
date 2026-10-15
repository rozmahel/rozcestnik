// Jediné místo, které zná GridStack. Kreslí rámeček widgetu a vrací jeho tělo.
const COLUMNS = 12;

export function createGrid(root, { onChange, onClose, onSettings }) {
  const gs = window.GridStack.init({
    column: COLUMNS,
    cellHeight: 80,
    margin: 8,
    float: false,
    animate: false,
    staticGrid: true,
    handle: '.widget-head',
    columnOpts: { breakpoints: [{ w: 640, c: 1 }], breakpointForWindow: true },
  }, root);

  let editing = false;
  const items = new Map(); // id -> element

  // Přímo z uzlů: gs.save() vynechává w/h, když se rovnají minimu, a položka by se pak při načtení zahodila.
  const snapshot = () => [...gs.engine.nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  gs.on('change', () => { if (editing) onChange(snapshot()); });

  function button(label, title, cls, handler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', handler);
    return b;
  }

  return {
    // pos: { x, y, w, h } nebo jen { w, h } (pak se pozice najde automaticky)
    add(manifest, pos, hasSettings) {
      const { id } = manifest;
      const w = Math.min(COLUMNS, Math.max(pos.w ?? manifest.defaultSize.w, manifest.minSize.w));
      const h = Math.max(pos.h ?? manifest.defaultSize.h, manifest.minSize.h);
      const el = document.createElement('div');
      el.className = 'grid-stack-item';
      el.setAttribute('gs-id', id);
      el.setAttribute('gs-w', w);
      el.setAttribute('gs-h', h);
      el.setAttribute('gs-min-w', manifest.minSize.w);
      el.setAttribute('gs-min-h', manifest.minSize.h);
      if (Number.isInteger(pos.x) && Number.isInteger(pos.y)) {
        el.setAttribute('gs-x', pos.x);
        el.setAttribute('gs-y', pos.y);
      } else {
        el.setAttribute('gs-auto-position', 'true');
      }

      const content = document.createElement('div');
      content.className = 'grid-stack-item-content widget';
      content.dataset.id = id;

      const head = document.createElement('div');
      head.className = 'widget-head';
      const title = document.createElement('span');
      title.className = 'widget-title';
      title.textContent = `${manifest.icon || ''} ${manifest.name}`.trim();
      head.append(title);
      if (hasSettings) head.append(button('⚙', 'Nastavení widgetu', 'widget-btn', () => onSettings(id)));
      head.append(button('✕', 'Vypnout widget', 'widget-btn widget-close', () => onClose(id)));

      const body = document.createElement('div');
      body.className = 'widget-body';
      content.append(head, body);
      el.append(content);
      root.append(el);
      gs.makeWidget(el);
      items.set(id, el);
      return body;
    },

    remove(id) {
      const el = items.get(id);
      if (!el) return;
      gs.removeWidget(el, true);
      items.delete(id);
    },

    has: (id) => items.has(id),
    snapshot,

    setEditing(on) {
      editing = on;
      gs.setStatic(!on);
      root.classList.toggle('editing', on);
    },

    focus(id) {
      const el = items.get(id);
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1500);
    },
  };
}
