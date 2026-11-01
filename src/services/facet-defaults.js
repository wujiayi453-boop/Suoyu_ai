/**
 * facet-defaults.js - static fallback facet values.
 * Extracted verbatim from the legacy server.js lines L685-L690.
 */
const { jobDirections, newsCategories, newsTopics } = require('../config/constants');

function fallbackFacets(type) {
  if (type === 'job') return { directions:jobDirections.map(value => ({ value, count:0 })), sources:[], cities:[], jobTypes:[], sizes:[], stages:[], categories:[], topics:[] };
  if (type === 'company') return { directions:jobDirections.map(value => ({ value, count:0 })), sources:[], cities:[], jobTypes:[], sizes:[], stages:[], categories:[], topics:[] };
  if (type === 'news') return { directions:[], sources:[], cities:[], jobTypes:[], sizes:[], stages:[], categories:newsCategories.map(value => ({ value, count:0 })), topics:newsTopics.map(value => ({ value, count:0 })) };
  return { directions:[], sources:[], cities:[], jobTypes:[], sizes:[], stages:[], categories:[], topics:[] };
}

module.exports = { fallbackFacets };
