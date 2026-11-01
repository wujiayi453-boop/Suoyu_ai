/**
 * search.js (facade) - search entry point: Elasticsearch with local fallback.
 * Extracted verbatim from the legacy server.js lines L559-L566.
 */
const { esEnabled } = require('../config/env');
const { ensureJobEvidence } = require('./local/data-index');
const { elasticSearch } = require('./elasticsearch/search');
const { localSearch } = require('./local/search');

/* 本地链路缺少 AI 相关度证据字段，检索前先回填，保证「AI 相关度优先」排序生效。 */
function searchLocal(params) {
  ensureJobEvidence();
  return { ...localSearch(params), backend:'local' };
}

async function search(params) {
  if (!esEnabled) return searchLocal(params);
  try {
    return await elasticSearch(params);
  } catch {
    return searchLocal(params);
  }
}

module.exports = { search };
