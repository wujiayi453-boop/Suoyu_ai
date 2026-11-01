'use strict';
/*
 * Deterministic Elasticsearch test double.
 *
 *   node scripts/mock-elasticsearch.js --port 9911 --log logs/smoke/es-requests-before.jsonl
 *
 * The offline package has no Elasticsearch running, so this mock lets the whole
 * "backend: elasticsearch" code path (query building, hit normalization,
 * aggregations, caching, fallbacks) be exercised and regression tested.
 * Every request body is appended to --log so two runs can be diffed.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const PORT = Number(arg('port', '9911'));
const LOG = arg('log', '');
if (LOG) fs.mkdirSync(path.dirname(path.resolve(LOG)), { recursive: true });

const INDEX_TYPE = {
  articles_v2: 'paper',
  companies_v2: 'company',
  jobs_v2: 'job',
  models_v2: 'model',
  news_v2: 'news'
};
const ID_FIELD = { paper: 'id', company: 'company_id', job: 'job_id', model: 'id', news: 'news_id' };
const DOC_COUNT = { paper: 5090, company: 237, job: 6017, model: 2000, news: 8800 };

function source(type, n) {
  const id = type + '-doc-' + n;
  if (type === 'job') {
    return {
      job_id: id, source_job_id: 'src-' + id, title: 'Mock \u7b97\u6cd5\u5de5\u7a0b\u5e08 ' + n,
      company: 'Mock \u79d1\u6280', company_display: 'Mock \u79d1\u6280\u6709\u9650\u516c\u53f8', company_id: 'company-doc-1',
      city: '\u5317\u4eac', location: '\u5317\u4eac\u5e02\u6d77\u6dc0\u533a', direction_label: '\u5e95\u5c42\u6838\u5fc3\u7814\u53d1',
      direction: 'core_research', job_type: '\u5168\u804c', status: 'open', salary: '30-60K', salary_monthly_avg: 45000,
      experience: '3-5\u5e74', experience_raw: '3-5\u5e74', education: '\u672c\u79d1', education_raw: '\u672c\u79d1',
      skills: ['python', 'pytorch', 'rag'], welfare: ['\u4e94\u9669\u4e00\u91d1'], benefits: ['\u5e74\u5047'],
      summary: 'mock summary ' + n, jd: 'mock jd ' + n, requirements: 'mock requirements', responsibilities: 'mock responsibilities',
      industry: 'AI', source: 'boss', published_at: '2026-0' + ((n % 9) + 1) + '-11', collected_at: '2026-09-01',
      updated_at: '2026-09-1' + (n % 9), apply_url: 'https://example.com/job/' + n, job_link: 'https://example.com/job/' + n,
      ai_evidence_level: ['strong', 'weak_title_and_jd', 'title_role', 'weak_multi', 'none'][n % 5]
    };
  }
  if (type === 'company') {
    return {
      company_id: id, name: 'Mock \u516c\u53f8 ' + n, name_legal: 'Mock \u516c\u53f8 ' + n + ' \u6709\u9650\u516c\u53f8',
      oneliner: 'mock oneliner ' + n, description: 'mock description ' + n, industry: 'AI \u57fa\u7840\u6a21\u578b',
      business_direction: ['\u5927\u6a21\u578b', '\u673a\u5668\u4eba'], city: '\u5317\u4eac', city_hq: '\u5317\u4eac',
      location: '\u5317\u4eac\u5e02\u671d\u9633\u533a', company_size: '100-499', stage: 'A\u8f6e', funding: 'A\u8f6e 1\u4ebf',
      tech_stack: ['pytorch', 'cuda'], job_skills: ['python'], provenance: 'mock', logo: 'https://example.com/logo.png',
      website: 'https://example.com', job_website: 'https://example.com/jobs', active_job_count: 12 + n, job_count: 12 + n,
      job_ids: ['job-doc-1', 'job-doc-2'], job_directions: { core_research: 5, engineering_ops: 3 }, job_city_main: '\u5317\u4eac',
      job_cities: ['\u5317\u4eac', '\u4e0a\u6d77'], salary_p50: 40000, featured: n % 2 === 0
    };
  }
  if (type === 'paper') {
    return {
      id: 'arxiv_260' + n + '.0000' + n, source_id: '260' + n + '.0000' + n, title: 'Mock Paper Title ' + n,
      abstract: 'mock abstract ' + n, description: 'mock description ' + n,
      authors: [{ name: 'A. Researcher', affiliation: 'Mock Lab' }, 'B. Author'],
      categories: ['cs.CL', 'cs.LG'], tags: ['transformer'], language: 'en', license: 'cc-by-4.0',
      published_date: '2026-0' + ((n % 9) + 1) + '-05', updated_date: '2026-09-0' + ((n % 9) + 1), created_date: '2026-01-01',
      url: 'https://arxiv.org/abs/260' + n, html_url: 'https://arxiv.org/html/260' + n, pdf_url: 'https://arxiv.org/pdf/260' + n,
      external_ids: { doi: '10.1000/mock.' + n }, source: 'arxiv',
      extra: {
        ai_subfield: 'NLP', ai_keywords: ['attention'], ai_methods: ['transformer'], ai_datasets: ['mockset'],
        full_text: 'mock full text ' + n, sections: [{ section_id: 's1', title: 'Introduction', content: 'mock section body', level: 1 }],
        comment: 'mock comment', doi: '10.1000/mock.' + n, is_open_access: true, version: 'v2', figures_count: 3,
        tables_count: 1, word_count: 4200, reference_list_count: 37, code_links: [{ url: 'https://example.com/code', platform: 'GitHub' }],
        task_type: 'text-generation'
      }
    };
  }
  if (type === 'model') {
    return {
      id: 'mock-model-' + n, source_id: 'mock-model-' + n, title: 'Mock Model ' + n,
      description: 'mock model description ' + n, abstract: 'mock model abstract ' + n,
      authors: [{ name: 'Mock Org' }], categories: ['text-generation'], tags: ['llm'], language: 'en',
      license: 'apache-2.0', url: 'https://example.com/model/' + n, html_url: 'https://example.com/model/' + n,
      published_date: '2026-02-0' + (n + 1), updated_date: '2026-08-0' + (n + 1), created_date: '2026-01-01',
      source: 'huggingface', data_source: 'huggingface',
      extra: { model_card: 'mock card', task_type: 'text-generation', pipeline_tag: 'text-generation', framework: 'pytorch',
        library_name: 'transformers', downloads: 1234 + n, likes: 56 + n, base_model: 'mock-base', ai_subfield: 'NLP',
        ai_keywords: ['llm'], ai_methods: ['finetune'] }
    };
  }
  return {
    news_id: 'news-doc-' + n, title: 'Mock \u8d44\u8baf\u6807\u9898 ' + n, summary: 'mock summary ' + n,
    content: 'mock news content ' + n, content_html: '<p>mock news content ' + n + '</p>',
    source_url: 'https://example.com/news/' + n, source_name: 'Mock \u5a92\u4f53', source: 'mock', source_site: 'example.com',
    category: '\u884c\u4e1a\u52a8\u6001', published_at: '2026-0' + ((n % 9) + 1) + '-15', crawled_at: '2026-09-01',
    tags: ['\u5927\u6a21\u578b'], keywords: ['ai'], ai_domains: ['nlp'], technologies: ['RAG'],
    companies: ['Mock \u516c\u53f8 1'], models: ['mock-model-1'], images: [{ original_url: 'https://example.com/img.png' }]
  };
}

function aggregationsFor(aggs) {
  const result = {};
  Object.entries(aggs || {}).forEach(([name, definition]) => {
    if (definition && definition.terms) {
      result[name] = { buckets: [
        { key: name + '-alpha', doc_count: 21 },
        { key: name + '-beta', doc_count: 7 },
        { key: 2026, doc_count: 3 }
      ] };
      return;
    }
    if (definition && definition.date_histogram) {
      result[name] = { buckets: [
        { key_as_string: '2026-01', key: 1767225600000, doc_count: 5 },
        { key_as_string: '2026-02', key: 1769904000000, doc_count: 2 }
      ] };
      return;
    }
    if (definition && definition.percentiles) {
      result[name] = { values: { '50.0': 25000.5 } };
      return;
    }
    result[name] = { buckets: [] };
  });
  return result;
}

function searchResponse(type, body) {
  const size = Number(body && body.size) || 0;
  const hits = [];
  for (let n = 1; n <= Math.min(size, 3); n += 1) {
    hits.push({ _index: 'mock', _id: type + '-doc-' + n, _score: 10 - n, _source: source(type, n) });
  }
  return {
    took: 3, timed_out: false,
    hits: { total: { value: DOC_COUNT[type] || 0, relation: 'eq' }, max_score: 9, hits },
    ...(body && body.aggs ? { aggregations: aggregationsFor(body.aggs) } : {})
  };
}

let sequence = 0;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null;
    if (raw) { try { body = JSON.parse(raw); } catch { body = { __raw: raw.slice(0, 200) }; } }
    sequence += 1;
    if (LOG) fs.appendFileSync(LOG, JSON.stringify({ seq: sequence, method: req.method, url: req.url, body }) + '\n', 'utf8');

    const reply = value => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    const url = new URL(req.url, 'http://127.0.0.1');
    const segments = url.pathname.split('/').filter(Boolean);
    const index = segments[0] || '';
    const type = INDEX_TYPE[index];
    if (segments.length === 0) return reply({ cluster_name: 'mock', version: { number: '9.5.2' }, tagline: 'You Know, for Search' });
    if (!type) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { type: 'index_not_found_exception', index }, status: 404 }));
    }
    if (url.pathname.endsWith('/_count')) return reply({ count: DOC_COUNT[type], _shards: { total: 1, successful: 1, failed: 0 } });
    if (url.pathname.endsWith('/_search')) return reply(searchResponse(type, body));
    if (url.pathname.endsWith('/_refresh')) return reply({ _shards: { total: 1, successful: 1, failed: 0 } });
    if (url.pathname.endsWith('/_bulk')) return reply({ took: 1, errors: false, items: [] });
    if (req.method === 'PUT' && segments.length === 1) return reply({ acknowledged: true, shards_acknowledged: true, index });
    return reply({});
  });
});

server.listen(PORT, '127.0.0.1', () => console.log('mock elasticsearch: http://127.0.0.1:' + PORT + (LOG ? '  log=' + path.resolve(LOG) : '')));
