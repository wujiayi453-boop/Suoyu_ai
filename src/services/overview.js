/**
 * overview.js (facade) - overview entry point + local aggregation.
 * Extracted verbatim from the legacy server.js lines L726-L739, L760-L785, L812-L816.
 */
const { esEnabled } = require('../config/env');
const { elasticOverview } = require('./elasticsearch/overview');
const { records } = require('./local/data-index');
const { asText } = require('../utils/text');

function localBucket(items, limit=12) {
  const counts = new Map();
  items.forEach(value => {
    const text = asText(value);
    if (text) counts.set(text, (counts.get(text) || 0) + 1);
  });
  return [...counts.entries()].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN')).slice(0, limit);
}

function localMonthly(items, field, limit=18) {
  const values = items.map(item => String(item[field] || '').match(/(\\d{4}-\\d{2})/)?.[1] || '').filter(Boolean);
  return localBucket(values, limit).sort((a, b) => a.value.localeCompare(b.value));
}

function overviewLocal() {
  const byType = type => records.filter(record => record.type === type);
  const jobs = byType('job');
  const companies = byType('company');
  const papers = byType('paper');
  const news = byType('news');
  const models = byType('model');
  return {
    code: 200,
    backend: 'local',
    generatedAt: new Date().toISOString(),
    totals: { indexedRecords: records.length, jobs: jobs.length, companies: companies.length, papers: papers.length, models: models.length, news: news.length },
    jobs: {
      directions: localBucket(jobs.map(item => item.category)),
      cities: localBucket(jobs.map(item => item.city)),
      sources: localBucket(jobs.map(item => item.source)),
      jobTypes: localBucket(jobs.map(item => item.detail && item.detail.jobType)),
      status: localBucket(jobs.map(item => item.detail && item.detail.status)),
      trend: localMonthly(jobs, 'date')
    },
    companies: { stages: localBucket(companies.map(item => item.detail && item.detail.stage)), sizes: localBucket(companies.map(item => item.detail && item.detail.size)), cities: localBucket(companies.map(item => item.city)) },
    papers: { categories: localBucket(papers.map(item => item.category)), trend: localMonthly(papers, 'date') },
    news: { categories: localBucket(news.map(item => item.category)), sources: localBucket(news.map(item => item.source)), topics: localBucket(news.flatMap(item => item.tags || [])), trend: localMonthly(news, 'date') },
    models: { categories: localBucket(models.map(item => item.category)), sources: localBucket(models.map(item => item.source)) }
  };
}

async function overview() {
  if (!esEnabled) return overviewLocal();
  try { return await elasticOverview(); }
  catch (error) { console.error('overview aggregation failed:', error.message); return overviewLocal(); }
}

module.exports = { localBucket, localMonthly, overviewLocal, overview };
