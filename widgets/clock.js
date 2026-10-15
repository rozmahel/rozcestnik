// Hodiny: jedno nebo více časových pásem, digitálně nebo analogově.
export const manifest = {
  id: 'clock',
  name: 'Hodiny',
  icon: '🕒',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  description: 'Čas v jednom nebo více časových pásmech, digitálně nebo analogově.',
};

// České názvy častých měst; ostatní se vezmou z identifikátoru pásma („America/New_York“ -> „New York“).
const CITY_CS = {
  Prague: 'Praha', Bratislava: 'Bratislava', Vienna: 'Vídeň', Berlin: 'Berlín', Warsaw: 'Varšava',
  Budapest: 'Budapešť', London: 'Londýn', Paris: 'Paříž', Rome: 'Řím', Madrid: 'Madrid', Lisbon: 'Lisabon',
  Athens: 'Atény', Moscow: 'Moskva', Kyiv: 'Kyjev', Kiev: 'Kyjev', Istanbul: 'Istanbul', Brussels: 'Brusel',
  Amsterdam: 'Amsterdam', Copenhagen: 'Kodaň', Stockholm: 'Stockholm', Oslo: 'Oslo', Helsinki: 'Helsinky',
  Zurich: 'Curych', Dublin: 'Dublin', Reykjavik: 'Reykjavík', New_York: 'New York', Los_Angeles: 'Los Angeles',
  Chicago: 'Chicago', Denver: 'Denver', Toronto: 'Toronto', Vancouver: 'Vancouver', Mexico_City: 'Ciudad de México',
  Sao_Paulo: 'São Paulo', Buenos_Aires: 'Buenos Aires', Tokyo: 'Tokio', Shanghai: 'Šanghaj', Hong_Kong: 'Hongkong',
  Singapore: 'Singapur', Seoul: 'Soul', Kolkata: 'Kalkata', Dubai: 'Dubaj', Bangkok: 'Bangkok', Jerusalem: 'Jeruzalém',
  Cairo: 'Káhira', Johannesburg: 'Johannesburg', Sydney: 'Sydney', Melbourne: 'Melbourne', Auckland: 'Auckland',
  Honolulu: 'Honolulu', UTC: 'UTC',
};

const REGION_CS = {
  Europe: 'Evropa', America: 'Amerika', Asia: 'Asie', Africa: 'Afrika', Australia: 'Austrálie',
  Pacific: 'Tichomoří', Atlantic: 'Atlantik', Indian: 'Indický oceán', Antarctica: 'Antarktida', Arctic: 'Arktida',
};

const COMMON = ['Europe/Prague', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Australia/Sydney', 'UTC'];

// "America/Argentina/Buenos_Aires" -> "Buenos Aires"; null/'local' -> místní čas
function zoneLabel(tz) {
  if (!tz || tz === 'local') return 'Místní čas';
  const last = tz.split('/').pop();
  return CITY_CS[last] || last.replaceAll('_', ' ');
}

// „UTC+2“ podle aktuálního posunu (včetně letního času)
function offsetOf(tz) {
  try {
    const name = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
    return name.replace('GMT', 'UTC').replace('-', '−') || 'UTC';
  } catch {
    return '';
  }
}

function zoneOptions() {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch { /* starší prohlížeč */ }
  if (!all.length) all = COMMON;
  const option = (tz, group) => ({ value: tz, label: `${zoneLabel(tz)} (${offsetOf(tz)})`, group });
  const opts = [{ value: 'local', label: 'Místní čas', group: 'Časté' }, ...COMMON.map((tz) => option(tz, 'Časté'))];
  const rest = all
    .filter((tz) => tz.includes('/') && REGION_CS[tz.split('/')[0]])
    .map((tz) => option(tz, REGION_CS[tz.split('/')[0]]))
    .sort((a, b) => a.group.localeCompare(b.group, 'cs') || a.label.localeCompare(b.label, 'cs'));
  return [...opts, ...rest];
}

export const settings = [
  {
    key: 'mode', label: 'Zobrazení', type: 'select', default: 'digital',
    options: [{ value: 'digital', label: 'Digitální' }, { value: 'analog', label: 'Analogové' }],
  },
  {
    key: 'zones', label: 'Časová pásma', type: 'multiselect', default: [],
    options: zoneOptions(), addLabel: 'Přidat časové pásmo…', emptyLabel: 'Žádné nevybrané = místní čas',
  },
  { key: 'seconds', label: 'Zobrazit sekundy', type: 'checkbox', default: false },
];

const SVG = 'http://www.w3.org/2000/svg';

const STYLE = `
.w-clock { container-type: size; height: 100%; display: flex; flex-wrap: wrap; gap: 4px 12px;
  align-content: safe center; justify-content: center; }
.w-clock .zone { display: grid; justify-items: center; gap: 2px; min-width: 0; }
.w-clock .label { color: var(--muted); font-size: 0.85em; }
.w-clock .time { font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1;
  font-size: clamp(1.1rem, min(12cqi, 22cqh), 2.2rem); }
.w-clock.single .time { font-size: clamp(1.6rem, min(22cqi, 40cqh), 5rem); }
.w-clock .date { color: var(--muted); font-size: 0.85em; }
.w-clock .error { color: var(--danger); font-size: 0.85em; flex-basis: 100%; text-align: center; }
.w-clock svg { width: clamp(48px, min(28cqi, 60cqh), 140px); height: auto; }
.w-clock.single svg { width: clamp(64px, min(60cqi, 70cqh), 220px); }
.w-clock .face { fill: none; stroke: var(--border); stroke-width: 2; }
.w-clock .tick { stroke: var(--muted); stroke-width: 2; }
.w-clock .hand { stroke: var(--text); stroke-linecap: round; }
.w-clock .hand.s { stroke: var(--accent); stroke-width: 1; }
`;

// Stav modulu: host drží jednu instanci na id.
let root = null;
let timer = null;
let current = null;

// Pole pásem (nové nastavení) i text oddělený čárkou (staré nastavení).
function parseZones(value) {
  const names = (Array.isArray(value) ? value : String(value || '').split(','))
    .map((s) => String(s).trim()).filter(Boolean)
    .map((s) => (s === 'local' ? null : s));
  if (!names.length) names.push(null); // místní čas
  return names.map((tz) => {
    try {
      const opts = tz ? { timeZone: tz } : {};
      return {
        tz,
        parts: new Intl.DateTimeFormat('cs', { ...opts, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }),
        date: new Intl.DateTimeFormat('cs', { ...opts, weekday: 'short', day: 'numeric', month: 'numeric' }),
      };
    } catch {
      return { tz, invalid: true };
    }
  });
}

function timeIn(zone, now) {
  const p = Object.fromEntries(zone.parts.formatToParts(now).map((x) => [x.type, x.value]));
  return { h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second) };
}

const pad = (n) => String(n).padStart(2, '0');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function buildDigital(zone) {
  const box = el('div', 'zone');
  const time = el('div', 'time');
  const date = el('div', 'date');
  box.append(el('div', 'label', zoneLabel(zone.tz)), time, date);
  return (now, seconds) => {
    const { h, m, s } = timeIn(zone, now);
    time.textContent = `${h}:${pad(m)}${seconds ? `:${pad(s)}` : ''}`;
    date.textContent = zone.date.format(now);
    return box;
  };
}

function buildAnalog(zone) {
  const box = el('div', 'zone');
  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img' });
  svg.append(svgEl('circle', { class: 'face', cx: 50, cy: 50, r: 47 }));
  for (let i = 0; i < 12; i++) {
    svg.append(svgEl('line', { class: 'tick', x1: 50, y1: 6, x2: 50, y2: i % 3 ? 10 : 13, transform: `rotate(${i * 30} 50 50)` }));
  }
  const hand = (cls, len, width) => svgEl('line', { class: `hand ${cls}`, x1: 50, y1: 50, x2: 50, y2: 50 - len, 'stroke-width': width });
  const hh = hand('h', 24, 4);
  const mh = hand('m', 36, 2.5);
  const sh = hand('s', 40, 1);
  svg.append(hh, mh, sh, svgEl('circle', { cx: 50, cy: 50, r: 2.5, fill: 'currentColor' }));
  box.append(el('div', 'label', zoneLabel(zone.tz)), svg);
  return (now, seconds) => {
    const { h, m, s } = timeIn(zone, now);
    hh.setAttribute('transform', `rotate(${(h % 12) * 30 + m * 0.5} 50 50)`);
    mh.setAttribute('transform', `rotate(${m * 6 + (seconds ? s * 0.1 : 0)} 50 50)`);
    sh.setAttribute('transform', `rotate(${s * 6} 50 50)`);
    sh.style.display = seconds ? '' : 'none';
    const label = `${zoneLabel(zone.tz)} ${h}:${pad(m)}`;
    svg.setAttribute('aria-label', label);
    return box;
  };
}

function render(values) {
  clearTimeout(timer);
  const zones = parseZones(values.zones);
  const valid = zones.filter((z) => !z.invalid);
  const build = values.mode === 'analog' ? buildAnalog : buildDigital;
  const updaters = valid.map(build);
  const errors = zones.filter((z) => z.invalid).map((z) => el('p', 'error', `Neznámé pásmo: ${z.tz}`));

  root.classList.toggle('single', valid.length === 1);
  const now = new Date();
  root.replaceChildren(...updaters.map((u) => u(now, values.seconds)), ...errors);
  current = { updaters, seconds: !!values.seconds };
  schedule();
}

// Další překreslení na začátku příští sekundy, případně minuty.
function schedule() {
  const now = Date.now();
  const step = current.seconds ? 1000 : 60000;
  timer = setTimeout(() => {
    try {
      const d = new Date();
      current.updaters.forEach((u) => u(d, current.seconds));
    } finally {
      schedule(); // chyba v jednom ticku hodiny nezastaví
    }
  }, step - (now % step) + 5);
}

export function init(container, ctx) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  root = el('div', 'w-clock');
  container.append(style, root);
  render(ctx.settings);
  ctx.onSettings(render);
}

export function destroy() {
  clearTimeout(timer);
  timer = null;
  root = null;
  current = null;
}
