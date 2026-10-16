// Dev-only fake push service: records every alert the app sends so it can be inspected, like mock-twitch.cjs does for Twitch.
// Start: node scripts/mock-push.cjs (port 4333; MOCK_PUSH_PORT changes it). A subscription whose endpoint is
//   http://localhost:4333/push/<name>      is accepted (201) and recorded,
//   http://localhost:4333/gone/<name>      answers 410 (the browser dropped it), /missing/ answers 404, /fail/ answers 500.
// GET /__received lists what arrived ({ path, headers, bytes }), /__reset clears the list. The bodies are encrypted for the
// browser, so only their size and the headers (TTL, Urgency, Authorization) are recorded.
// The app only accepts an http endpoint on localhost outside production builds (lib/push-core.ts validEndpoint).

const http = require('http');

function start(port = Number(process.env.MOCK_PUSH_PORT) || 4333) {
  const received = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__received') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(received)); }
    if (url.pathname === '/__reset') { received.length = 0; return res.end('ok'); }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const kind = url.pathname.split('/')[1];
      received.push({ path: url.pathname, kind, headers: req.headers, bytes: Buffer.concat(chunks).length });
      res.statusCode = kind === 'gone' ? 410 : kind === 'missing' ? 404 : kind === 'fail' ? 500 : 201;
      res.end();
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, received, stop: () => server.close() })));
}

module.exports = { start };
if (require.main === module) start().then(s => console.log(`mock push on ${s.port}`));
