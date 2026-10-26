// Dev-only fake of the Upstash REST API that @vercel/kv talks to, so the app can run locally without touching
// the real database. Supports only the commands this app uses. Start: node scripts/mock-kv.cjs (port 4111, or MOCK_KV_PORT).
// Point the app at it with KV_REST_API_URL=http://localhost:4111 (see CLAUDE.md → Testing locally).

const http = require('http');
const PORT = Number(process.env.MOCK_KV_PORT) || 4111;
const store = new Map();
const timers = new Map(); // key -> pending EXPIRE timer
const types = new Map(); // key -> 'string' | 'hash' | 'list' | 'set' (the stored value alone can't tell a list from a set)
const counts = {}; // op -> commands served, read from GET /__stats (add ?reset to zero it), so a check or a measurement can count KV commands
function run(cmd) {
  if (!Array.isArray(cmd)) return null;
  const [op, key, ...rest] = cmd; const o = String(op).toLowerCase();
  counts[o] = (counts[o] || 0) + 1;
  switch (o) {
    case 'mget': return [key, ...rest].map(k => (store.has(k) ? store.get(k) : null));
    case 'get': return store.has(key) ? store.get(key) : null;
    case 'set': {
      // SET key value [NX] [EX seconds]: NX only sets when the key is absent (what the app's locks rely on), EX expires it.
      const opts = rest.slice(1).map(x => String(x).toLowerCase());
      if (opts.includes('nx') && store.has(key)) return null;
      store.set(key, rest[0]); types.set(key, 'string');
      const ex = opts.indexOf('ex');
      if (ex >= 0) setTimeout(() => store.delete(key), Number(rest[1 + ex + 1]) * 1000).unref();
      return 'OK';
    }
    case 'del': { let n = 0; for (const k of [key, ...rest]) if (store.delete(k)) { types.delete(k); n++; } return n; }
    case 'eval': {
      // EVAL script numkeys key... arg...: Lua is not run. Only the lock release in lib/kv.ts is understood (delete KEYS[1] if it still equals ARGV[1]).
      if (!String(key).includes("redis.call('get', KEYS[1]) == ARGV[1]")) throw new Error('mock kv: unsupported EVAL script');
      const k = rest[1], token = rest[1 + Number(rest[0])];
      if (!store.has(k) || String(store.get(k)) !== String(token)) return 0;
      store.delete(k); types.delete(k); return 1;
    }
    case 'expire': {
      // EXPIRE key seconds: drops the key after that long (a later EXPIRE on the same key replaces the earlier one).
      if (!store.has(key)) return 0;
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { store.delete(key); types.delete(key); timers.delete(key); }, Number(rest[0]) * 1000).unref());
      return 1;
    }
    case 'type': return types.get(key) ?? 'none';
    case 'exists': return store.has(key) ? 1 : 0;
    case 'scan': {
      // SCAN cursor MATCH pattern COUNT n: one pass over everything, cursor 0 means done.
      const mi = rest.findIndex(x => String(x).toLowerCase() === 'match');
      const pat = mi >= 0 ? String(rest[mi + 1]) : '*';
      const esc = pat.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, c => '\\' + c)).join('.*');
      const re = new RegExp('^' + esc + '$');
      return ['0', [...store.keys()].filter(k => re.test(k))];
    }
    case 'lpush': { const l = store.get(key) || []; l.unshift(rest[0]); store.set(key, l); types.set(key, 'list'); return l.length; }
    case 'rpush': { const l = store.get(key) || []; l.push(...rest); store.set(key, l); types.set(key, 'list'); return l.length; }
    case 'rpop': { const l = store.get(key) || []; return l.pop() ?? null; }
    case 'incr': { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return n; }
    case 'decr': { const n = Number(store.get(key) || 0) - 1; store.set(key, String(n)); return n; }
    case 'lrange': { const l = store.get(key) || []; const [a, b] = rest.map(Number); return l.slice(Number(key === undefined ? 0 : a), b < 0 ? l.length + b + 1 : b + 1); }
    case 'ltrim': return 'OK';
    case 'sadd': { const s = new Set(store.get(key) || []); rest.forEach(x => s.add(x)); store.set(key, [...s]); types.set(key, 'set'); return 1; }
    case 'srem': { const s = new Set(store.get(key) || []); let n = 0; rest.forEach(x => { if (s.delete(x)) n++; }); store.set(key, [...s]); return n; }
    case 'hset': { const h = store.get(key) || {}; for (let i = 0; i < rest.length; i += 2) h[rest[i]] = rest[i+1]; store.set(key, h); types.set(key, 'hash'); return rest.length / 2; }
    case 'hsetnx': { const h = store.get(key) || {}; if (rest[0] in h) return 0; h[rest[0]] = rest[1]; store.set(key, h); types.set(key, 'hash'); return 1; }
    case 'hdel': {
      const h = store.get(key); if (!h) return 0;
      let n = 0; [...rest].forEach(f => { if (f in h) { delete h[f]; n++; } });
      if (Object.keys(h).length === 0) { store.delete(key); types.delete(key); } // like Redis, an emptied hash is no key at all
      return n;
    }
    case 'rename': {
      // RENAME src dst: atomic move, replaces dst; an error when src is missing (as Redis does).
      if (!store.has(key)) throw new Error('ERR no such key');
      const dst = rest[0];
      store.set(dst, store.get(key)); types.set(dst, types.get(key)); store.delete(key); types.delete(key);
      return 'OK';
    }
    case 'hincrby': { const h = store.get(key) || {}; h[rest[0]] = Number(h[rest[0]] || 0) + Number(rest[1]); store.set(key, h); types.set(key, 'hash'); return h[rest[0]]; }
    case 'scard': return (store.get(key) || []).length;
    case 'llen': return (store.get(key) || []).length;
    case 'hget': { const h = store.get(key) || {}; return rest[0] in h ? h[rest[0]] : null; }
    case 'hmget': { const h = store.get(key) || {}; return rest.map(f => (f in h ? h[f] : null)); }
    case 'hlen': return Object.keys(store.get(key) || {}).length;
    case 'hgetall': { const h = store.get(key); return h ? Object.entries(h).flat() : []; }
    case 'smembers': return store.get(key) || [];
    default: return null;
  }
}
const b64 = v => v === 'OK' ? v : typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
http.createServer((req, res) => {
  if (req.url.startsWith('/__stats')) {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(counts));
    if (req.url.includes('reset')) for (const k of Object.keys(counts)) delete counts[k];
    return;
  }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const enc = req.headers['upstash-encoding'] === 'base64';
    const wrap = r => ({ result: enc ? b64(r) : r });
    let j; try { j = JSON.parse(body || "[]"); } catch { j = []; }
    let out;
    try { out = req.url.includes('pipeline') ? j.map(c => wrap(run(c))) : wrap(run(j)); }
    catch (e) { res.statusCode = 400; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: String(e.message || e) })); return; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
}).listen(PORT, () => console.log('mock kv on ' + PORT));
