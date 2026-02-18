/**
 * Vercel serverless proxy для api.iot.yandex.net
 * Проксирует запросы и обходит CORS
 */
const https = require('https');

module.exports = async (req, res) => {
  const pathParts = req.query.path;
  let path = '';
  if (Array.isArray(pathParts)) {
    path = pathParts.join('/');
  } else if (typeof pathParts === 'string') {
    path = pathParts;
  }
  const url = 'https://api.iot.yandex.net/' + path;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = req.headers.authorization || '';

  return new Promise((resolve) => {
    const options = {
      method: req.method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 YaApp/3.0',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      rejectUnauthorized: false
    };

    const proxyReq = https.request(url, options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
      proxyRes.pipe(res, { end: true });
      resolve();
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ error: String(err.message) });
      resolve();
    });

    if (req.method === 'POST' && req.body) {
      proxyReq.write(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    }
    proxyReq.end();
  });
};
