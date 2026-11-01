/**
 * search.js (elasticsearch) - Elasticsearch search execution.
 * Extracted verbatim from the legacy server.js lines L524-L557, L568-L575.
 */
const { companyDirectionCodes, idFields } = require('../../config/constants');
const { esIndices } = require('../../config/env');
const { normalizeElasticHit } = require('./normalize');
const { elasticQuery, elasticSearchBody, elasticTotal } = require('./query');
const { elasticSort } = require('./sort');

async function elasticSearchType(type, params, page=1, pageSize=20) {
  const companyDirection = type === 'company' ? params.get('direction') || 'all' : 'all';
  const companyDirectionCode = companyDirectionCodes[companyDirection];
  const response = await elasticSearchBody(type, {
    from:companyDirectionCode ? 0 : (page - 1) * pageSize,
    size:companyDirectionCode ? 300 : pageSize,
    track_total_hits:true,
    track_scores:true,
    query:await elasticQuery(type, params),
    sort:elasticSort(type, params.get('sort'))
  });
  const hits = companyDirectionCode ? (response.hits.hits || []).filter(hit => Number(hit._source && hit._source.job_directions && hit._source.job_directions[companyDirectionCode]) > 0) : response.hits.hits || [];
  const offset = companyDirectionCode ? (page - 1) * pageSize : 0;
  return { total:companyDirectionCode ? hits.length : elasticTotal(response), results:hits.slice(offset, offset + pageSize).map(hit => normalizeElasticHit(type, hit)) };
}

async function elasticSearch(params) {
  const query = (params.get('q') || '').trim();
  const type = params.get('type') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.get('page_size')) || 20));
  if (params.get('group') === '1') {
    const entries = await Promise.all(Object.keys(esIndices).map(async kind => [kind, await elasticSearchType(kind, params, 1, 4)]));
    const groups = Object.fromEntries(entries);
    return { code:200, query, total:Object.values(groups).reduce((sum, group) => sum + group.total, 0), groups, backend:'elasticsearch' };
  }
  if (type !== 'all' && esIndices[type]) {
    const result = await elasticSearchType(type, params, page, pageSize);
    return { code:200, query, type, total:result.total, page, page_size:pageSize, results:result.results, backend:'elasticsearch' };
  }
  const entries = await Promise.all(Object.keys(esIndices).map(async kind => [kind, await elasticSearchType(kind, params, 1, pageSize)]));
  const results = entries.flatMap(([, result]) => result.results).slice(0, pageSize);
  return { code:200, query, type, total:entries.reduce((sum, [, result]) => sum + result.total, 0), page, page_size:pageSize, results, backend:'elasticsearch' };
}

async function elasticFind(type, id) {
  const field = idFields[type];
  const response = await elasticSearchBody(type, {
    size:1,
    query:{ bool:{ should:[{ ids:{ values:[id] } }, { term:{ [field]:id } }], minimum_should_match:1 } }
  });
  return response.hits && response.hits.hits && response.hits.hits[0] || null;
}

module.exports = { elasticSearchType, elasticSearch, elasticFind };
