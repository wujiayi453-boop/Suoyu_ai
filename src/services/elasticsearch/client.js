/**
 * client.js - Elasticsearch HTTP client.
 * Extracted verbatim from the legacy server.js lines L234-L270.
 */
const http = require('http');
const https = require('https');
const { esApiKey, esCa, esEnabled, esUrl } = require('../../config/env');

function elasticUrl(endpoint) {
  return new URL(endpoint, `${esUrl}/`).toString();
}

async function elasticRequest(endpoint, method='GET', body) {
  if (!esEnabled) throw new Error('Elasticsearch is not configured');
  const target = new URL(elasticUrl(endpoint));
  const payload = body ? JSON.stringify(body) : '';
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port,
      path:`${target.pathname}${target.search}`,
      method,
      ...(target.protocol === 'https:' && esCa ? { ca:esCa } : {}),
      headers:{
        Authorization:`ApiKey ${esApiKey}`,
        Accept:'application/json',
        ...(payload ? { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload) } : {})
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Elasticsearch request failed with ${response.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('Elasticsearch returned an invalid response')); }
      });
    });
    request.setTimeout(8000, () => request.destroy(new Error('Elasticsearch request timed out')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

module.exports = { elasticUrl, elasticRequest };
