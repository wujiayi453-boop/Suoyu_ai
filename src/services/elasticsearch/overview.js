/**
 * overview.js (elasticsearch) - operations overview aggregations (60s cache).
 * Extracted verbatim from the legacy server.js lines L213, L787-L810.
 */
const { aggregationValues, keywordMonthlyAggregation, mergeFacetValues, monthlyAggregation } = require('./aggregations');
const { elasticIndexStatus } = require('./index-status');
const { elasticSearchBody } = require('./query');

let overviewCache = null;

async function elasticOverview() {
  if (overviewCache && Date.now() - overviewCache.createdAt < 60000) return overviewCache.value;
  const observe = (label, promise) => promise.catch(error => { console.error(`overview ${label} failed:`, error.message); throw error; });
  const [status, jobs, companies, papers, news, models] = await Promise.all([
    observe('status', elasticIndexStatus()),
    observe('jobs', elasticSearchBody('job', { size: 0, track_total_hits: true, aggs: { directions: { terms: { field: 'direction_label', size: 12 } }, cities: { terms: { field: 'city', size: 12 } }, sources: { terms: { field: 'source', size: 12 } }, jobTypes: { terms: { field: 'job_type', size: 12 } }, statuses: { terms: { field: 'status', size: 8 } }, trend: monthlyAggregation('updated_at') } })),
    observe('companies', elasticSearchBody('company', { size: 0, track_total_hits: true, aggs: { stages: { terms: { field: 'stage', size: 10 } }, sizes: { terms: { field: 'company_size', size: 10 } }, cities: { terms: { field: 'city', size: 12 } }, hqCities: { terms: { field: 'city_hq', size: 12 } } } })),
    observe('papers', elasticSearchBody('paper', { size: 0, track_total_hits: true, aggs: { categories: { terms: { field: 'categories', size: 12 } }, subfields: { terms: { field: 'extra.ai_subfield', size: 12 } }, trend: monthlyAggregation('published_date') } })),
    observe('news', elasticSearchBody('news', { size: 0, track_total_hits: true, aggs: { categories: { terms: { field: 'category', size: 12 } }, sources: { terms: { field: 'source_name', size: 12 } }, topics: { terms: { field: 'technologies', size: 12 } }, trend: keywordMonthlyAggregation('published_at') } })),
    observe('models', elasticSearchBody('model', { size: 0, track_total_hits: true, aggs: { categories: { terms: { field: 'categories', size: 12 } }, sources: { terms: { field: 'source', size: 12 } } } }))
  ]);
  const countFor = type => Number(status.sources[type] && status.sources[type].count) || 0;
  const value = {
    code: 200, backend: 'elasticsearch', generatedAt: status.generatedAt,
    totals: { indexedRecords: status.indexedRecords, jobs: countFor('job'), companies: countFor('company'), papers: countFor('paper'), models: countFor('model'), news: countFor('news') },
    jobs: { directions: aggregationValues(jobs, 'directions'), cities: aggregationValues(jobs, 'cities'), sources: aggregationValues(jobs, 'sources'), jobTypes: aggregationValues(jobs, 'jobTypes'), status: aggregationValues(jobs, 'statuses'), trend: aggregationValues(jobs, 'trend') },
    companies: { stages: aggregationValues(companies, 'stages'), sizes: aggregationValues(companies, 'sizes'), cities: mergeFacetValues(aggregationValues(companies, 'cities'), aggregationValues(companies, 'hqCities')) },
    papers: { categories: aggregationValues(papers, 'categories'), subfields: aggregationValues(papers, 'subfields'), trend: aggregationValues(papers, 'trend') },
    news: { categories: aggregationValues(news, 'categories'), sources: aggregationValues(news, 'sources'), topics: aggregationValues(news, 'topics'), trend: aggregationValues(news, 'trend') },
    models: { categories: aggregationValues(models, 'categories'), sources: aggregationValues(models, 'sources') }
  };
  overviewCache = { createdAt: Date.now(), value };
  return value;
}

module.exports = { overviewCache, elasticOverview };
