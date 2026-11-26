import { get, put } from '@vercel/blob';

const KEY = 'syllabus-progress.json';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const file = await get(KEY, { access: 'private' });
      if (!file) {
        send(res, 200, { courses: [], updatedAt: 0 });
        return;
      }
      const text = await new Response(file.stream).text();
      const data = JSON.parse(text);
      send(res, 200, {
        courses: Array.isArray(data.courses) ? data.courses : [],
        updatedAt: Number(data.updatedAt) || 0
      });
      return;
    }

    if (req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw || '{}');
      if (!Array.isArray(data.courses)) {
        send(res, 400, { error: 'courses must be an array' });
        return;
      }
      const updatedAt = Number(data.updatedAt) || Date.now();
      await put(
        KEY,
        JSON.stringify({ courses: data.courses, updatedAt }),
        { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }
      );
      send(res, 200, { ok: true, updatedAt });
      return;
    }

    res.setHeader('allow', 'GET, PUT');
    send(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Storage request failed' });
  }
}
