// Dev-only fake of the Upstash REST API that @vercel/kv talks to, so the app can run locally without touching
// the real database. Supports only the commands this app uses. Start: node scripts/mock-kv.cjs (port 4111).
// Point the app at it with KV_REST_API_URL=http://localhost:4111 (see CLAUDE.md → Testing locally).

const http = require('http');
const store = new Map();
function run(cmd) {
  if (!Array.isArray(cmd)) return null;
  const [op, key, ...rest] = cmd; const o = String(op).toLowerCase();
  switch (o) {
    case 'get': return store.has(key) ? store.get(key) : null;
    case 'set': {
      // SET key value [NX] [EX seconds]: NX only sets when the key is absent (what the app's locks rely on), EX expires it.
      const opts = rest.slice(1).map(x => String(x).toLowerCase());
      if (opts.includes('nx') && store.has(key)) return null;
      store.set(key, rest[0]);
      const ex = opts.indexOf('ex');
      if (ex >= 0) setTimeout(() => store.delete(key), Number(rest[1 + ex + 1]) * 1000).unref();
      return 'OK';
    }
    case 'del': { let n = 0; for (const k of [key, ...rest]) if (store.delete(k)) n++; return n; }
    case 'scan': {
      // SCAN cursor MATCH pattern COUNT n: one pass over everything, cursor 0 means done.
      const mi = rest.findIndex(x => String(x).toLowerCase() === 'match');
      const pat = mi >= 0 ? String(rest[mi + 1]) : '*';
      const esc = pat.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, c => '\\' + c)).join('.*');
      const re = new RegExp('^' + esc + '$');
      return ['0', [...store.keys()].filter(k => re.test(k))];
    }
    case 'lpush': { const l = store.get(key) || []; l.unshift(rest[0]); store.set(key, l); return l.length; }
    case 'rpop': { const l = store.get(key) || []; return l.pop() ?? null; }
    case 'incr': { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return n; }
    case 'lrange': { const l = store.get(key) || []; const [a, b] = rest.map(Number); return l.slice(Number(key === undefined ? 0 : a), b + 1); }
    case 'ltrim': return 'OK';
    case 'sadd': { const s = new Set(store.get(key) || []); rest.forEach(x => s.add(x)); store.set(key, [...s]); return 1; }
    case 'srem': { const s = new Set(store.get(key) || []); let n = 0; rest.forEach(x => { if (s.delete(x)) n++; }); store.set(key, [...s]); return n; }
    case 'hset': { const h = store.get(key) || {}; for (let i = 0; i < rest.length; i += 2) h[rest[i]] = rest[i+1]; store.set(key, h); return rest.length / 2; }
    case 'hdel': { const h = store.get(key) || {}; let n = 0; rest.forEach(f => { if (f in h) { delete h[f]; n++; } }); store.set(key, h); return n; }
    case 'hincrby': { const h = store.get(key) || {}; h[rest[0]] = Number(h[rest[0]] || 0) + Number(rest[1]); store.set(key, h); return h[rest[0]]; }
    case 'scard': return (store.get(key) || []).length;
    case 'llen': return (store.get(key) || []).length;
    case 'hget': { const h = store.get(key) || {}; return rest[0] in h ? h[rest[0]] : null; }
    case 'hlen': return Object.keys(store.get(key) || {}).length;
    case 'hgetall': { const h = store.get(key); return h ? Object.entries(h).flat() : []; }
    case 'smembers': return store.get(key) || [];
    default: return null;
  }
}
const b64 = v => v === 'OK' ? v : typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const enc = req.headers['upstash-encoding'] === 'base64';
    const wrap = r => ({ result: enc ? b64(r) : r });
    let j; try { j = JSON.parse(body || "[]"); } catch { j = []; }
    const out = req.url.includes('pipeline') ? j.map(c => wrap(run(c))) : wrap(run(j));
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
}).listen(4111, () => console.log('mock kv on 4111'));
