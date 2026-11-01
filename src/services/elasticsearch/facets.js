/**
 * facets.js (elasticsearch) - facet aggregations (60s cache).
 * Extracted verbatim from the legacy server.js lines L212, L692-L718.
 */
const { companyDirectionCodes, jobDirections, newsCategories, newsTopics } = require('../../config/constants');
const { aggregationValues, mergeFacetValues } = require('./aggregations');
const { elasticSearchBody } = require('./query');
const { fallbackFacets } = require('../facet-defaults');

const facetCache = new Map();

async function elasticFacets(type) {
  const cached = facetCache.get(type);
  if (cached && Date.now() - cached.createdAt < 60000) return cached.value;
  let value;
  if (type === 'job') {
    const response = await elasticSearchBody('job', { size:0, aggs:{ directions:{ terms:{ field:'direction_label', size:20 } }, sources:{ terms:{ field:'source', size:20 } }, cities:{ terms:{ field:'city', size:50 } }, jobTypes:{ terms:{ field:'job_type', size:20 } } } });
    const counts = new Map(aggregationValues(response, 'directions').map(item => [item.value, item.count]));
    value = { ...fallbackFacets(type), directions:jobDirections.map(option => ({ value:option, count:counts.get(option) || 0 })), sources:aggregationValues(response, 'sources'), cities:aggregationValues(response, 'cities'), jobTypes:aggregationValues(response, 'jobTypes') };
  } else if (type === 'company') {
    const companies = await elasticSearchBody('company', { size:300, track_total_hits:false, query:{ match_all:{} }, aggs:{ city:{ terms:{ field:'city', size:50 } }, cityHq:{ terms:{ field:'city_hq', size:50 } }, jobCities:{ terms:{ field:'job_cities', size:50 } }, sizes:{ terms:{ field:'company_size', size:20 } }, stages:{ terms:{ field:'stage', size:20 } } } });
    const directionCounts = new Map();
    (companies.hits.hits || []).forEach(hit => {
      const directions = hit._source && hit._source.job_directions || {};
      Object.entries(companyDirectionCodes).forEach(([label, code]) => {
        if (Number(directions[code]) > 0) directionCounts.set(label, (directionCounts.get(label) || 0) + 1);
      });
    });
    value = { ...fallbackFacets(type), directions:jobDirections.map(option => ({ value:option, count:directionCounts.get(option) || 0 })), cities:mergeFacetValues(aggregationValues(companies, 'city'), aggregationValues(companies, 'cityHq'), aggregationValues(companies, 'jobCities')), sizes:aggregationValues(companies, 'sizes'), stages:aggregationValues(companies, 'stages') };
  } else if (type === 'news') {
    const response = await elasticSearchBody('news', { size:0, aggs:{ categories:{ terms:{ field:'category', size:30 } }, sources:{ terms:{ field:'source_name', size:30 } }, technologies:{ terms:{ field:'technologies', size:30 } } } });
    const categoryCounts = new Map(aggregationValues(response, 'categories').map(item => [item.value, item.count]));
    const topicCounts = new Map(aggregationValues(response, 'technologies').map(item => [item.value, item.count]));
    value = { ...fallbackFacets(type), categories:newsCategories.map(option => ({ value:option, count:categoryCounts.get(option) || 0 })), sources:aggregationValues(response, 'sources'), topics:newsTopics.map(option => ({ value:option, count:topicCounts.get(option) || 0 })) };
  } else value = fallbackFacets(type);
  facetCache.set(type, { createdAt:Date.now(), value });
  return value;
}

module.exports = { facetCache, elasticFacets };
