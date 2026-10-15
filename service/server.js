// Servisní vrstva rozcestníku: stahuje to, co prohlížeč kvůli CORS nesmí (RSS kanály, fotka dne z Bingu).
// Node 18+, bez závislostí. Spuštění: node service/server.js
// Proměnné: PORT (výchozí 8787), ALLOWED_ORIGINS (adresy rozcestníku oddělené čárkou).
// Poslouchá jen na 127.0.0.1. Nic neukládá a nic neloguje kromě chyb.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = new Set((process.env.ALLOWED_ORIGINS
  || 'http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765')
  .split(',').map((s) => s.trim()).filter(Boolean));
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Jen veřejné adresy: servis nesmí sloužit jako průchod na localhost a do domácí sítě.
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase().replace(/%.*$/, '');
  // IPv4 mapovaná do IPv6, i v hex zápisu (::ffff:7f00:1 = 127.0.0.1)
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (dotted) return isPrivate(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
  if (hex) {
    const [h, l] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivate(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  // ::, ::1, IPv4-compatible, ULA, link/site-local, multicast, NAT64, 6to4, dokumentační
  return v6.startsWith('::') || /^(f[c-f]|ff)/.test(v6)
    || /^(64:ff9b|2002|2001:db8|100):/.test(v6);
}

// DNS se ověřuje přímo při připojení, takže druhý překlad (DNS rebinding) nic neobejde.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return callback(err);
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) {
      return callback(new HttpError(403, 'Lokální adresy nejsou povolené.'));
    }
    if (options.all) return callback(null, addrs);
    return callback(null, addrs[0].address, addrs[0].family);
  });
}

function checkTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(400, 'Neplatná adresa.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Jen http a https.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivate(host)) throw new HttpError(403, 'Lokální adresy nejsou povolené.');
  return url;
}

function request(url, signal, accept) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, {
      lookup: safeLookup,
      signal,
      headers: { 'user-agent': 'rozcestnik-service', accept },
    }, resolve);
    req.on('error', reject);
  });
}

const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5';

// Stáhne adresu, přesměrování ověřuje po jednom, tělo nejvýš MAX_BYTES.
async function fetchUrl(raw, accept = FEED_ACCEPT) {
  let url = checkTarget(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await request(url, signal, accept);
    const status = res.statusCode;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume(); // zahodit tělo, ať se uvolní spojení
      url = checkTarget(new URL(res.headers.location, url).href);
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new HttpError(502, `Zdroj vrátil ${status}.`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        res.destroy();
        throw new HttpError(502, 'Kanál je příliš velký.');
      }
      chunks.push(chunk);
    }
    const charset = /charset=([\w-]+)/i.exec(res.headers['content-type'] || '')?.[1];
    return { body: Buffer.concat(chunks), charset };
  }
  throw new HttpError(502, 'Příliš mnoho přesměrování.');
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}

const text = { 'content-type': 'text/plain; charset=utf-8' };

// Fotka dne z Bingu (idx 0 = dnes, až 7 dní zpět). Odpověď se drží hodinu v paměti.
const bingCache = new Map();
async function bingPhoto(idx) {
  const hit = bingCache.get(idx);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;
  const { body } = await fetchUrl(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=1&mkt=cs-CZ`, 'application/json');
  const img = JSON.parse(body.toString('utf-8'))?.images?.[0];
  if (!img?.urlbase) throw new HttpError(502, 'Bing nevrátil fotku.');
  const data = {
    url: `https://www.bing.com${img.urlbase}_1920x1080.jpg`,
    credit: String(img.copyright || img.title || 'Bing'),
    link: typeof img.copyrightlink === 'string' && img.copyrightlink.startsWith('https://') ? img.copyrightlink : 'https://www.bing.com',
  };
  bingCache.set(idx, { at: Date.now(), data });
  return data;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  // Host jen náš (proti DNS rebindingu na servis), cizí stránky bez Origin (obrázek, navigace) ne.
  if (!HOSTS.has(req.headers.host)) return send(res, 403, 'Nepovolený host.', text);
  if (origin && !ORIGINS.has(origin)) return send(res, 403, 'Nepovolený původ.', text);
  if (!origin && req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, 'Nepovolený původ.', text);
  const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
  if (req.method !== 'GET') return send(res, 405, 'Jen GET.', { ...cors, ...text });

  let path = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    path = url.pathname;
    if (path === '/health') {
      return send(res, 200, JSON.stringify({ ok: true }), { ...cors, 'content-type': 'application/json' });
    }
    if (path === '/feed') {
      const feed = await fetchUrl(url.searchParams.get('url') || '');
      const type = feed.charset ? `application/xml; charset=${feed.charset}` : 'application/xml';
      return send(res, 200, feed.body, { ...cors, 'content-type': type });
    }
    if (path === '/background') {
      const idx = Math.min(7, Math.max(0, Number.parseInt(url.searchParams.get('idx'), 10) || 0));
      const data = await bingPhoto(idx);
      return send(res, 200, JSON.stringify(data), { ...cors, 'content-type': 'application/json' });
    }
    return send(res, 404, 'Neznámá cesta.', { ...cors, ...text });
  } catch (e) {
    const known = e instanceof HttpError;
    if (!known) console.error(`${path || req.url}: ${e.message}`);
    return send(res, known ? e.status : 502, known ? e.message : 'Zdroj je nedostupný.', { ...cors, ...text });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servisní vrstva běží na http://127.0.0.1:${PORT} (povolené původy: ${[...ORIGINS].join(', ')})`);
});
