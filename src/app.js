/**
 * app.js - HTTP router and static file handler.
 * Extracted verbatim from the legacy server.js lines L823-L839.
 */
const fs = require('fs');
const path = require('path');
const { publicDir } = require('./config/paths');
const { detail } = require('./services/detail');
const { facets } = require('./services/facets');
const { indexStatus } = require('./services/index-status');
const { imageProxy } = require('./services/image-proxy');
const { overview } = require('./services/overview');
const { search } = require('./services/search');
const { contentType, json } = require('./utils/http');

const requestHandler = async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/api/search') return json(res, await search(url.searchParams));
  if (url.pathname === '/api/index') return json(res, await indexStatus());
  if (url.pathname === '/api/facets') return json(res, await facets(url.searchParams.get('type') || ''));
  if (url.pathname === '/api/overview') return json(res, await overview());
  if (url.pathname === '/api/image') return imageProxy(req, res, url.searchParams.get('url') || '');
  if (segments[0] === 'api' && segments[1] === 'detail' && segments.length === 4) {
    const data = await detail(decodeURIComponent(segments[2]), decodeURIComponent(segments[3]));
    return data ? json(res, { code:200, data }) : json(res, { code:404, error:'找不到该记录' }, 404);
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(publicDir, requested);
  const denied = new Set(['data-full.js', 'news-offsets.json', 'paper-offsets.json']);
  if (!file.startsWith(publicDir) || path.basename(file).startsWith('.') || !fs.existsSync(file) || denied.has(path.basename(file))) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type':contentType[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(file).pipe(res);
};

module.exports = { requestHandler };
