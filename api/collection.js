import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { name, username } = req.query;
  if (!name) return res.status(400).json({ error: 'missing name' });
  const key = `tcg_${name}`;

  if (req.method === 'GET') {
    const data = (await kv.get(key)) ?? {};
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { data } = req.body;
    await kv.set(key, data);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (username) {
      const data = (await kv.get(key)) ?? {};
      delete data[username.toLowerCase()];
      await kv.set(key, data);
    } else {
      await kv.del(key);
    }
    return res.json({ ok: true });
  }

  res.status(405).end();
}
