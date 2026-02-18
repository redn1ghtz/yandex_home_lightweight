/**
 * Vercel serverless proxy для видеопотоков камер
 */
const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  const streamUrl = req.query.url;
  if (!streamUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  const protocol = streamUrl.startsWith('https') ? https : http;

  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46'
      },
      rejectUnauthorized: false
    };

    if (req.headers.range) {
      options.headers['Range'] = req.headers.range;
    }

    const proxyReq = protocol.get(streamUrl, options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      const ctype = proxyRes.headers['content-type'] || 'application/octet-stream';
      res.setHeader('Content-Type', ctype);
      res.setHeader('Accept-Ranges', 'bytes');
      const cl = proxyRes.headers['content-length'];
      if (cl) res.setHeader('Content-Length', cl);
      const cr = proxyRes.headers['content-range'];
      if (cr) res.setHeader('Content-Range', cr);
      proxyRes.pipe(res, { end: true });
      resolve();
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ error: String(err.message) });
      resolve();
    });
  });
};
