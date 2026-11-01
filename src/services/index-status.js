/**
 * index-status.js (facade) - index status entry point.
 * Extracted verbatim from the legacy server.js lines L666-L673.
 */
const { esEnabled } = require('../config/env');
const { elasticIndexStatus } = require('./elasticsearch/index-status');
const { index, records } = require('./local/data-index');

async function indexStatus() {
  if (!esEnabled) return { code:200, sources:index.sources, indexedRecords:records.length, generatedAt:index.generatedAt, backend:'local' };
  try {
    return await elasticIndexStatus();
  } catch {
    return { code:200, sources:index.sources, indexedRecords:records.length, generatedAt:index.generatedAt, backend:'local' };
  }
}

module.exports = { indexStatus };
