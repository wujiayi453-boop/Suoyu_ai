/**
 * facets.js (facade) - facets entry point.
 * Extracted verbatim from the legacy server.js lines L720-L724.
 */
const { esEnabled, esIndices } = require('../config/env');
const { elasticFacets } = require('./elasticsearch/facets');
const { localFacets } = require('./local/facets');

async function facets(type) {
  if (!esEnabled || !esIndices[type]) return { code:200, type, backend:'local', ...localFacets(type) };
  try { return { code:200, type, backend:'elasticsearch', ...await elasticFacets(type) }; }
  catch { return { code:200, type, backend:'local', ...localFacets(type) }; }
}

module.exports = { facets };
