/**
 * detail.js (facade) - detail entry point: Elasticsearch with local fallback.
 * Extracted verbatim from the legacy server.js lines L645-L652.
 */
const { esEnabled } = require('../config/env');
const { elasticDetail } = require('./elasticsearch/detail');
const { localDetail } = require('./local/detail');
const { relatedContent } = require('./relations');

async function detail(type, id) {
  const enrich = data => data ? { ...data, relatedContent: relatedContent(data.record) } : null;
  // The packaged sources hold the full text, whereas search services may hold summaries.
  const local = localDetail(type, id);
  if (local) return enrich(local);
  if (!esEnabled) return enrich(localDetail(type, id));
  try {
    return enrich(await elasticDetail(type, id));
  } catch {
    return enrich(localDetail(type, id));
  }
}

module.exports = { detail };
