/**
 * index-status.js (elasticsearch) - per-index document counts (30s cache).
 * Extracted verbatim from the legacy server.js lines L211, L654-L664.
 */
const { esIndices } = require('../../config/env');
const { elasticRequest } = require('./client');
const { index } = require('../local/data-index');

let esSourceCache = null;

async function elasticIndexStatus() {
  if (esSourceCache && Date.now() - esSourceCache.createdAt < 30000) return esSourceCache.value;
  const counts = await Promise.all(Object.entries(esIndices).map(async ([type, name]) => {
    const response = await elasticRequest(`/${encodeURIComponent(name)}/_count`, 'POST', { query:{ match_all:{} } });
    return [type, { ...(index.sources[type] || {}), file:name, count:Number(response.count) || 0 }];
  }));
  const sources = Object.fromEntries(counts);
  const value = { code:200, sources, indexedRecords:Object.values(sources).reduce((sum, source) => sum + source.count, 0), generatedAt:new Date().toISOString(), backend:'elasticsearch' };
  esSourceCache = { createdAt:Date.now(), value };
  return value;
}

module.exports = { esSourceCache, elasticIndexStatus };
