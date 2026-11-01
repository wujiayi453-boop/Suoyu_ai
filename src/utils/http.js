/**
 * http.js - static content types + JSON response writer.
 * Extracted verbatim from the legacy server.js lines L43, L818-L821.
 */

const contentType = { '.svg':'image/svg+xml', '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function json(res, value, status=200) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(value));
}

module.exports = { contentType, json };
