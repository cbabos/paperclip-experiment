const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:3001';
const staticDir = __dirname;

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  return 'application/octet-stream';
}

function sendStatic(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const targetPath = path.join(staticDir, path.normalize(pathname));

  if (!targetPath.startsWith(staticDir)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  fs.readFile(targetPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    res.writeHead(200, { 'content-type': contentTypeFor(targetPath) });
    res.end(data);
  });
}

function proxyToApi(req, res) {
  const targetUrl = new URL(req.url || '/', apiOrigin);
  const proxyReq = http.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: req.headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'api_unavailable' }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/ai/')) {
    proxyToApi(req, res);
    return;
  }

  sendStatic(req, res);
});

server.listen(port, () => {
  process.stdout.write(`Web listening on :${port} (proxying API to ${apiOrigin})\n`);
});
