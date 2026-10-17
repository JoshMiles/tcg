// Dev-only fake of Resend's POST /emails: records every message the app sends so it can be inspected, like mock-twitch.cjs does for Twitch.
// Start: node scripts/mock-resend.cjs (port 4444; MOCK_RESEND_PORT changes it). Point the app at it with RESEND_API_URL=http://localhost:4444
// (ignored in production builds) and any RESEND_API_KEY. A message to an address at @fail.test answers 500, anything else 200 { id }.
// GET /__sent lists what arrived ({ auth, body }), /__reset clears the list.

const http = require('http');

function start(port = Number(process.env.MOCK_RESEND_PORT) || 4444) {
  const sent = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/__sent') return res.end(JSON.stringify(sent));
    if (url.pathname === '/__reset') { sent.length = 0; return res.end('"ok"'); }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
      if (req.method !== 'POST' || url.pathname !== '/emails' || !body) { res.statusCode = 404; return res.end('{}'); }
      sent.push({ auth: req.headers.authorization, body });
      const fail = (body.to || []).some(a => String(a).endsWith('@fail.test'));
      res.statusCode = fail ? 500 : 200;
      res.end(JSON.stringify(fail ? { message: 'fail' } : { id: `mock-${sent.length}` }));
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, sent, stop: () => server.close() })));
}

module.exports = { start };
if (require.main === module) start().then(s => console.log(`mock resend on ${s.port}`));
