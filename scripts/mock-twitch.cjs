// Dev-only fake of the Twitch endpoints used by "Log in with Twitch" (authorize, token, revoke, helix/users), so the
// website login can be exercised locally without real Twitch credentials. Start: node scripts/mock-twitch.cjs (port 4222).
// Point the app at it with TWITCH_ID_URL=http://localhost:4222 and TWITCH_API_URL=http://localhost:4222 (see CLAUDE.md →
// Testing locally). The app ignores those variables in production builds.
//
// The "user" you log in as is picked with ?as=<login> on the authorize URL (default: tester, or whoever /__as?login=name last set). Each user gets a stable fake ID.

const http = require('http');
const { URL } = require('url');

const codes = new Map();   // code -> login
const tokens = new Map();  // token -> login
const revoked = [];
let defaultUser = 'tester'; // who the next login becomes; change with /__as?login=name

const profile = login => ({
  id: String(100000 + [...login].reduce((n, ch) => n + ch.charCodeAt(0), 0)),
  login,
  display_name: login.charAt(0).toUpperCase() + login.slice(1),
  profile_image_url: '',
});

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:4222');
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

    // Step 1: instantly "approve" and bounce back with a code (a real Twitch shows a consent screen).
    if (url.pathname === '/oauth2/authorize') {
      const redirect = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (url.searchParams.get('deny')) {
        res.writeHead(302, { location: `${redirect}?error=access_denied&state=${encodeURIComponent(state)}` });
        return res.end();
      }
      const code = 'code-' + Math.random().toString(36).slice(2);
      codes.set(code, (url.searchParams.get('as') || defaultUser).toLowerCase());
      res.writeHead(302, { location: `${redirect}?code=${code}&state=${encodeURIComponent(state)}` });
      return res.end();
    }

    if (url.pathname === '/oauth2/token' && req.method === 'POST') {
      const p = new URLSearchParams(body);
      const login = codes.get(p.get('code'));
      if (!login || p.get('client_secret') === null) return json(400, { status: 400, message: 'invalid code' });
      codes.delete(p.get('code'));
      const token = 'tok-' + Math.random().toString(36).slice(2);
      tokens.set(token, login);
      return json(200, { access_token: token, expires_in: 3600, token_type: 'bearer' });
    }

    if (url.pathname === '/oauth2/revoke' && req.method === 'POST') {
      const p = new URLSearchParams(body);
      revoked.push(p.get('token'));
      tokens.delete(p.get('token'));
      res.writeHead(200); return res.end();
    }

    if (url.pathname === '/helix/users') {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const login = tokens.get(token);
      if (!login) return json(401, { error: 'Unauthorized' });
      return json(200, { data: [profile(login)] });
    }

    // Test helpers: switch who logs in next, and see which tokens were revoked.
    if (url.pathname === '/__as') { defaultUser = (url.searchParams.get('login') || 'tester').toLowerCase(); return json(200, { defaultUser }); }
    if (url.pathname === '/__revoked') return json(200, { revoked, outstanding: tokens.size });

    json(404, { error: 'not found' });
  });
}).listen(4222, () => console.log('mock twitch on 4222'));
