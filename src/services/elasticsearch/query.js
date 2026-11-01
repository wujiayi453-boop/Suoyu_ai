/**
 * query.js - Elasticsearch query / filter builders.
 * Extracted verbatim from the legacy server.js lines L272-L429.
 */
const { jobEducationOptions, jobExperienceOptions, searchFields, sourceFields } = require('../../config/constants');
const { esIndices } = require('../../config/env');
const { elasticRequest } = require('./client');

function scopedSearchFields(type, scope) {
  if (type === 'job') {
    if (scope === 'title') return ['title^5'];
    if (scope === 'company') return ['company^4', 'company_display^4'];
    if (scope === 'skills') return ['skills^4'];
    if (scope === 'city') return ['city^4', 'location^3'];
  }
  if (type === 'news') {
    if (scope === 'title') return ['title^5'];
    if (scope === 'content') return ['content^4', 'summary^2'];
  }
  if (type === 'paper') {
    if (scope === 'title') return ['title^5'];
    if (scope === 'author') return ['authors^5', 'authors.name^5'];
    if (scope === 'abstract') return ['abstract^4', 'description^3'];
    if (scope === 'keyword') return ['tags^4', 'keywords^4', 'extra.ai_keywords^5', 'extra.ai_methods^3', 'extra.ai_datasets^3'];
    if (scope === 'fulltext') return ['extra.full_text^4'];
  }
  if (type === 'model') {
    if (scope === 'title') return ['title^5', 'source_id^4'];
    if (scope === 'description') return ['description^4', 'abstract^3', 'extra.model_card^2'];
    if (scope === 'task') return ['extra.task_type^5', 'extra.pipeline_tag^5', 'extra.ai_subfield^4', 'categories^3'];
    if (scope === 'framework') return ['extra.framework^5', 'extra.library_name^5'];
    if (scope === 'source') return ['source^5', 'data_source^4'];
    if (scope === 'tag') return ['tags^4', 'categories^4', 'extra.ai_keywords^4', 'extra.ai_methods^3', 'extra.framework^3', 'license^2', 'language^2'];
  }
  return searchFields[type];
}

function wildcardAny(fields, fragments) {
  return { bool:{ should:fields.flatMap(field => fragments.map(fragment => ({ wildcard:{ [field]:`*${fragment}*` } }))), minimum_should_match:1 } };
}

function missingFields(fields) {
  return { bool:{ must_not:fields.map(field => ({ exists:{ field } })) } };
}

function booleanTextClause(text, fields, operator) {
  return text ? { simple_query_string:{ query:text, fields, default_operator:operator, analyze_wildcard:false } } : null;
}

function paperAdvancedClauses(params, defaultScope, type = 'paper') {
  const scopes = new Set(type === 'model'
    ? ['all', 'title', 'description', 'task', 'framework', 'source', 'tag']
    : ['all', 'title', 'author', 'abstract', 'keyword', 'fulltext']);
  const operators = new Set(['and', 'or', 'not']);
  const normalize = value => ({
    operator:operators.has(value && value.operator) ? value.operator : 'and',
    scope:scopes.has(value && value.scope) ? value.scope : defaultScope,
    query:String(value && value.query || '').trim()
  });
  const encoded = params.get('advanced');
  if (encoded) {
    try {
      const clauses = JSON.parse(encoded);
      if (Array.isArray(clauses)) return clauses.slice(0, 12).map(normalize).filter(clause => clause.query);
    } catch {}
  }
  return [['and', 'and_scope'], ['or', 'or_scope'], ['not', 'not_scope']]
    .map(([operator, scope]) => normalize({ operator, scope:params.get(scope), query:params.get(operator) }))
    .filter(clause => clause.query);
}

function publishedDateClause(from, to) {
  return {
    script:{
      script:{
        lang:'painless',
        params:{ from:from || '', to:to || '' },
        source:"if (doc['published_at'].size() == 0) return false; String value = doc['published_at'].value; if (value.length() < 10 || value.substring(4,5) != '-' || value.substring(7,8) != '-') return false; String day = value.substring(0,10); if (params.from != '' && day.compareTo(params.from) < 0) return false; if (params.to != '' && day.compareTo(params.to) > 0) return false; return true;"
      }
    }
  };
}

function unpublishedDateClause() {
  return {
    script:{
      script:{
        lang:'painless',
        source:"if (doc['published_at'].size() == 0) return true; String value = doc['published_at'].value; return value.length() < 10 || value.substring(4,5) != '-' || value.substring(7,8) != '-';"
      }
    }
  };
}

async function elasticFilters(type, params) {
  const filters = [];
  const city = params.get('city') || 'all';
  const source = params.get('source') || 'all';
  if (city !== 'all' && (type === 'job' || type === 'company')) {
    const cityFields = type === 'company' ? ['city', 'city_hq', 'job_city_main', 'job_cities'] : ['city', 'location'];
    filters.push({ bool:{ should:cityFields.map(field => ({ term:{ [field]:city } })), minimum_should_match:1 } });
  }
  if (source !== 'all') {
    if (type === 'news') filters.push({ bool:{ should:['source', 'source_name', 'source_site'].map(field => ({ term:{ [field]:source } })), minimum_should_match:1 } });
    else filters.push({ term:{ [sourceFields[type]]:source } });
  }
  if (type === 'job') {
    const direction = params.get('direction') || 'all';
    const experience = params.get('experience') || 'all';
    const education = params.get('education') || 'all';
    const jobType = params.get('job_type') || 'all';
    const isRemote = params.get('is_remote') || 'all';
    const salaryMin = params.get('salary_min') || '';
    const salaryMonths = params.get('salary_months') || '';
    const companyName = params.get('company') || '';
    if (direction !== 'all') filters.push({ term:{ direction_label:direction } });
    if (experience !== 'all' && jobExperienceOptions[experience]) filters.push(experience === 'unspecified' ? missingFields(['experience', 'experience_raw']) : { terms:{ experience:jobExperienceOptions[experience] } });
    if (education !== 'all' && jobEducationOptions[education]) filters.push(education === 'unspecified' ? missingFields(['education', 'education_raw']) : { terms:{ education:jobEducationOptions[education] } });
    if (jobType !== 'all') filters.push({ term:{ job_type:jobType } });
    if (isRemote !== 'all') filters.push({ term:{ is_remote:isRemote === 'true' } });
    if (salaryMin) filters.push({ range:{ salary_monthly_min:{ gte:Number(salaryMin) } } });
    if (salaryMonths) filters.push({ term:{ salary_months:Number(salaryMonths) } });
    if (companyName) filters.push({ term:{ 'company.keyword':companyName } });
  }
  if (type === 'company') {
    const direction = params.get('direction') || 'all';
    const size = params.get('size') || 'all';
    const stage = params.get('stage') || 'all';
    const businessDirection = params.get('business_direction') || '';
    const activeJobCount = params.get('active_job_count') || '';
    if (size !== 'all') filters.push({ term:{ company_size:size } });
    if (stage !== 'all') filters.push({ term:{ stage } });
    if (businessDirection) filters.push({ term:{ business_direction:businessDirection } });
    if (activeJobCount) filters.push({ range:{ active_job_count:{ gte:Number(activeJobCount) } } });
  }
  if (type === 'news') {
    const category = params.get('category') || 'all';
    const topic = params.get('topic') || 'all';
    const from = params.get('published_from') || '';
    const to = params.get('published_to') || '';
    const published = params.get('published') || 'all';
    const companyName = params.get('company') || '';
    const aiDomains = params.get('ai_domains') || '';
    if (category !== 'all') filters.push({ term:{ category } });
    if (topic !== 'all') filters.push({ bool:{ should:['ai_domains', 'technologies', 'keywords', 'tags'].map(field => ({ term:{ [field]:topic } })), minimum_should_match:1 } });
    if (published === 'unspecified') filters.push(unpublishedDateClause());
    else if (from || to) filters.push(publishedDateClause(from, to));
    if (companyName) filters.push({ term:{ companies:companyName } });
    if (aiDomains) filters.push({ term:{ ai_domains:aiDomains } });
  }
  return filters;
}

async function elasticQuery(type, params) {
  const query = (params.get('q') || '').trim();
  const scope = params.get('scope') || 'all';
  const fields = scopedSearchFields(type, scope);
  const filter = await elasticFilters(type, params);
  const must = [query ? { multi_match:{ query, fields, operator:'and' } } : null].filter(Boolean);
  const should = [];
  const mustNot = [];
  const clauses = ['paper', 'model'].includes(type) ? paperAdvancedClauses(params, scope, type) : [
    { operator:'and', scope:params.get('and_scope') || scope, query:params.get('and') },
    { operator:'or', scope:params.get('or_scope') || scope, query:params.get('or') },
    { operator:'not', scope:params.get('not_scope') || scope, query:params.get('not') }
  ];
  clauses.forEach(clause => {
    const match = booleanTextClause(clause.query, scopedSearchFields(type, clause.scope), clause.operator === 'and' ? 'and' : 'or');
    if (!match) return;
    if (clause.operator === 'and') must.push(match);
    else if (clause.operator === 'or') should.push(match);
    else mustNot.push(match);
  });
  if (!must.length && !should.length && !mustNot.length && !filter.length) return { match_all:{} };
  return {
    bool: {
      ...(must.length ? { must } : {}),
      ...(should.length ? { should, minimum_should_match:1 } : {}),
      ...(mustNot.length ? { must_not:mustNot } : {}),
      ...(filter.length ? { filter } : {})
    }
  };
}

async function elasticSearchBody(type, body) {
  return elasticRequest(`/${encodeURIComponent(esIndices[type])}/_search`, 'POST', body);
}

function elasticTotal(result) {
  const total = result && result.hits && result.hits.total;
  return typeof total === 'number' ? total : Number(total && total.value) || 0;
}

module.exports = { scopedSearchFields, wildcardAny, missingFields, booleanTextClause, paperAdvancedClauses, publishedDateClause, unpublishedDateClause, elasticFilters, elasticQuery, elasticSearchBody, elasticTotal };
