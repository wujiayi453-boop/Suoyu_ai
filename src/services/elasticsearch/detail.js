/**
 * detail.js (elasticsearch) - Elasticsearch detail assembly.
 * Extracted verbatim from the legacy server.js lines L577-L643.
 */
const { aggregationValues } = require('./aggregations');
const { normalizeElasticHit } = require('./normalize');
const { elasticSearchBody, elasticTotal } = require('./query');
const { elasticFind } = require('./search');
const { asList, asText, firstText, unique } = require('../../utils/text');
const { newsImages } = require('../../utils/news-cover');

function paperFromElastic(source) {
  const extra = source.extra || {};
  const sections = Array.isArray(extra.sections) ? extra.sections.filter(section => section && section.content).map(section => ({ title:section.title || '', content:section.content || '', level:section.level || 1, id:section.section_id || '' })) : [];
  return {
    abstract:firstText(source.abstract, source.description), fullText:sections.length ? '' : asText(extra.full_text), sections,
    authors:(Array.isArray(source.authors) ? source.authors : []).map(author => ({ name:typeof author === 'string' ? author : asText(author.name), affiliation:typeof author === 'object' ? asText(author.affiliation) : '' })).filter(author => author.name),
    categories:asList(source.categories), sourceId:asText(source.source_id), sourceUrl:firstText(source.url, source.html_url), pdfUrl:asText(source.pdf_url), htmlUrl:asText(source.html_url), doi:firstText(extra.doi, source.external_ids && source.external_ids.doi), language:asText(source.language), publishedAt:asText(source.published_date), updatedAt:asText(source.updated_date), comment:asText(extra.comment), subfield:asText(extra.ai_subfield), keywords:asList(extra.ai_keywords), methods:asList(extra.ai_methods), datasets:asList(extra.ai_datasets), codeLinks:(Array.isArray(extra.code_links) ? extra.code_links : []).filter(link => link && link.url).map(link => ({ url:link.url, platform:link.platform || '代码仓库' })), openAccess:Boolean(extra.is_open_access), version:extra.version || '', figures:extra.figures_count || 0, tables:extra.tables_count || 0, wordCount:extra.word_count || 0, references:extra.reference_list_count || 0
  };
}

function newsFromElastic(source) {
  return {
    content:firstText(source.content, source.summary), contentHtml:asText(source.content_html), sourceUrl:asText(source.source_url), sourceName:firstText(source.source_name, source.source, source.source_site), category:asText(source.category), publishedAt:asText(source.published_at), crawledAt:asText(source.crawled_at),
    tags:unique([...asList(source.tags), ...asList(source.keywords), ...asList(source.ai_domains), ...asList(source.technologies)]), companies:asList(source.companies), models:asList(source.models), technologies:asList(source.technologies), images:newsImages(source).filter(url => url !== asText(source.source_url))
  };
}

async function relatedElasticJobs(company) {
  const should = [];
  const jobIds = company.detail && company.detail.jobIds || [];
  if (jobIds.length) should.push({ bool:{ should:[{ terms:{ job_id:jobIds.slice(0, 1000) } }, { terms:{ source_job_id:jobIds.slice(0, 1000) } }], minimum_should_match:1 } });
  if (company.id) should.push({ term:{ company_id:company.id } });
  if (company.title) {
    should.push({ match_phrase:{ company:company.title } });
    should.push({ match_phrase:{ company_display:company.title } });
  }
  if (!should.length) return { jobs:[], insights:null };
  const response = await elasticSearchBody('job', {
    size:30,
    query:{ bool:{ should, minimum_should_match:1 } },
    sort:[{ updated_at:{ order:'desc', missing:'_last' } }, { 'title.keyword':{ order:'asc', missing:'_last' } }],
    aggs:{ directions:{ terms:{ field:'direction_label', size:20 } }, skills:{ terms:{ field:'skills.keyword', size:30 } }, salary:{ percentiles:{ field:'salary_monthly_avg', percents:[50] } } }
  });
  const salaryValues = response.aggregations && response.aggregations.salary && response.aggregations.salary.values || {};
  return {
    jobs:(response.hits.hits || []).map(hit => normalizeElasticHit('job', hit)),
    insights:{ directions:aggregationValues(response, 'directions'), skills:aggregationValues(response, 'skills'), salaryMedian:Number(salaryValues['50.0']) || 0, total:elasticTotal(response) }
  };
}

async function elasticCompanyForJob(job) {
  const should = [];
  if (job.companyId) should.push({ term:{ company_id:job.companyId } });
  const relatedIds = [job.id, job.sourceJobId].filter(Boolean);
  if (relatedIds.length) should.push({ terms:{ job_ids:relatedIds } });
  if (job.company) should.push({ match_phrase:{ name:job.company } });
  if (!should.length) return null;
  const response = await elasticSearchBody('company', { size:1, query:{ bool:{ should, minimum_should_match:1 } } });
  const hit = response.hits && response.hits.hits && response.hits.hits[0];
  return hit ? normalizeElasticHit('company', hit) : null;
}

async function elasticDetail(type, id) {
  const hit = await elasticFind(type, id);
  if (!hit) return null;
  const record = normalizeElasticHit(type, hit);
  const data = { record, relatedJobs:[], company:null, article:null, paper:null, companyInsights:null };
  if (type === 'company') {
    const jobData = await relatedElasticJobs(record);
    data.relatedJobs = jobData.jobs;
    data.companyInsights = jobData.insights;
  }
  if (type === 'job') data.company = await elasticCompanyForJob(record);
  if (type === 'news') data.article = newsFromElastic(hit._source || {});
  if (type === 'paper') data.paper = paperFromElastic(hit._source || {});
  return data;
}

module.exports = { paperFromElastic, newsFromElastic, relatedElasticJobs, elasticCompanyForJob, elasticDetail };
