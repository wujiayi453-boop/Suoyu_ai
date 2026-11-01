'use strict';
/*
 * Regression smoke test for the AI search server.
 *
 *   node scripts/smoke-test.js --out logs/smoke/before.json
 *   node scripts/smoke-test.js --out logs/smoke/after.json --diff logs/smoke/before.json
 *
 * Captures every HTTP endpoint used by the frontend, the static assets that
 * index.html references, and the negative/security cases, then normalizes
 * volatile fields so two runs can be compared byte for byte.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const BASE = arg('base-url', 'http://127.0.0.1:4173').replace(/\/+$/, '');
const OUT = arg('out', '');
const DIFF = arg('diff', '');
const TIMEOUT = Number(arg('timeout', '120000'));
const VOLATILE_KEYS = new Set(['generatedAt']);

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const next = {};
    Object.keys(value).sort().forEach(key => {
      if (VOLATILE_KEYS.has(key)) return;
      next[key] = normalize(value[key]);
    });
    return next;
  }
  return value;
}

async function getJson(urlPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(BASE + urlPath, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); }
    catch { body = { __raw: text.length > 2000 ? text.slice(0, 2000) + '...[truncated]' : text }; }
    return { status: response.status, contentType: response.headers.get('content-type'), body: normalize(body) };
  } catch (error) {
    return { status: 0, error: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function getAsset(urlPath) {
  try {
    const response = await fetch(BASE + urlPath);
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      contentType: response.headers.get('content-type'),
      text: response.status === 200 && /text\/html/.test(response.headers.get('content-type') || '')
        ? buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 400)
        : undefined
    };
  } catch (error) {
    return { status: 0, error: String((error && error.message) || error) };
  }
}

// Chinese filter values are written as escapes so this file stays pure ASCII.
const TEXT = {
  bigModel: '\u5927\u6a21\u578b',
  coreResearch: '\u5e95\u5c42\u6838\u5fc3\u7814\u53d1',
  beijing: '\u5317\u4eac',
  newsCategory: '\u884c\u4e1a\u52a8\u6001',
  fullTime: '\u5168\u804c',
  roundA: 'A\u8f6e'
};

function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, value);
  });
  const text = search.toString();
  return text ? '?' + text : '';
}

const SEARCH_CASES = [
  ['search/empty', {}],
  ['search/q-ai', { q: 'AI' }],
  ['search/q-chinese', { q: TEXT.bigModel }],
  ['search/group', { q: 'AI', group: '1' }],
  ['search/group-empty-q', { group: '1' }],
  ['search/paging', { q: 'AI', type: 'job', page: '2', page_size: '5' }],
  ['search/page-size-clamp', { q: 'AI', type: 'job', page_size: '500' }],
  ['search/type-job', { q: 'AI', type: 'job' }],
  ['search/type-company', { q: 'AI', type: 'company' }],
  ['search/type-paper', { q: 'transformer', type: 'paper' }],
  ['search/type-model', { q: 'llm', type: 'model' }],
  ['search/type-news', { q: 'AI', type: 'news' }],
  ['search/job-sort-time', { q: 'AI', type: 'job', sort: 'time' }],
  ['search/job-sort-source', { q: 'AI', type: 'job', sort: 'source' }],
  ['search/job-sort-title', { q: 'AI', type: 'job', sort: 'title' }],
  ['search/job-direction', { type: 'job', direction: TEXT.coreResearch }],
  ['search/job-filters', { type: 'job', experience: 'campus', education: 'bachelor', job_type: TEXT.fullTime }],
  ['search/job-unspecified', { type: 'job', experience: 'unspecified', education: 'unspecified' }],
  ['search/job-city', { type: 'job', city: TEXT.beijing }],
  ['search/job-source-filter', { q: 'AI', type: 'job', source: 'boss' }],
  ['search/company-direction', { type: 'company', direction: TEXT.coreResearch }],
  ['search/company-filters', { type: 'company', size: '100-499', stage: TEXT.roundA }],
  ['search/news-filters', { type: 'news', category: TEXT.newsCategory, topic: 'RAG' }],
  ['search/news-unpublished', { type: 'news', published: 'unspecified' }],
  ['search/news-date-range', { type: 'news', published_from: '2026-01-01', published_to: '2026-06-30' }],
  ['search/news-sort-asc', { type: 'news', sort: 'time_asc' }],
  ['search/news-sort-desc', { type: 'news', sort: 'time_desc' }],
  ['search/boolean-and-or-not', { q: 'AI', type: 'job', and: 'python', or: 'rust', not: 'intern' }],
  ['search/scopes', { q: 'attention', type: 'job', scope: 'title' }],
  ['search/paper-scope-fulltext', { q: 'attention', type: 'paper', scope: 'fulltext' }],
  ['search/paper-scope-author', { q: 'bengio', type: 'paper', scope: 'author' }],
  ['search/paper-advanced', { type: 'paper', advanced: JSON.stringify([
    { operator: 'and', scope: 'title', query: 'transformer' },
    { operator: 'or', scope: 'abstract', query: 'diffusion' },
    { operator: 'not', scope: 'keyword', query: 'survey' }
  ]) }],
  ['search/paper-advanced-flat', { type: 'paper', and: 'transformer', and_scope: 'title', not: 'survey', not_scope: 'abstract' }],
  ['search/model-sort-title', { type: 'model', sort: 'title' }],
  ['search/model-sort-time', { type: 'model', sort: 'time' }],
  ['search/unknown-type', { q: 'AI', type: 'nope' }]
];

const FACET_TYPES = ['job', 'company', 'news', 'paper', 'model', ''];
const DETAIL_TYPES = ['job', 'company', 'paper', 'model', 'news'];
const NEGATIVE_CASES = [
  '/api/detail/unknown-type/whatever',
  '/api/detail/job/',
  '/api/detail/news/does-not-exist',
  '/api/facets?type=nope',
  '/no-such-page',
  '/.env',
  '/data-full.js',
  '/database/generated/data-full.js',
  '/news-offsets.json',
  '/paper-offsets.json',
  '/../.env',
  '/%2e%2e/.env',
  '/server.js',
  '/src/server.js',
  '/api/unknown-endpoint'
];

async function collect() {
  const snapshot = { baseUrl: BASE, capturedAt: new Date().toISOString(), api: {}, assets: {}, negative: {} };

  snapshot.api['GET /api/index'] = await getJson('/api/index');
  snapshot.api['GET /api/overview'] = await getJson('/api/overview');
  FACET_TYPES.forEach(() => {});
  for (const type of FACET_TYPES) {
    snapshot.api['GET /api/facets?type=' + (type || '(empty)')] = await getJson('/api/facets' + qs({ type }));
  }
  for (const [name, params] of SEARCH_CASES) {
    snapshot.api['GET /api/search [' + name + ']'] = await getJson('/api/search' + qs(params));
  }

  // Detail endpoints need real ids, so resolve them from a per-type search first.
  for (const type of DETAIL_TYPES) {
    const listing = await getJson('/api/search' + qs({ type, page_size: '3' }));
    const results = (listing.body && listing.body.results) || [];
    snapshot.api['GET /api/detail/' + type + '/(first of 3)'] = results.length
      ? await getJson('/api/detail/' + encodeURIComponent(type) + '/' + encodeURIComponent(results[0].id))
      : { status: 'skipped', reason: 'no results' };
    if (results.length > 1) {
      snapshot.api['GET /api/detail/' + type + '/(second of 3)'] =
        await getJson('/api/detail/' + encodeURIComponent(type) + '/' + encodeURIComponent(results[1].id));
    }
  }

  // Static assets are discovered from index.html so the check survives path moves.
  const home = await getAsset('/');
  snapshot.assets['/ (index.html)'] = home;
  if (home.status === 200) {
    const html = Buffer.from(await (await fetch(BASE + '/')).arrayBuffer()).toString('utf8');
    const refs = new Set();
    const pattern = /(?:href|src)="([^"#]+)"/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const value = match[1].split('?')[0];
      if (/^(https?:)?\/\//.test(value) || value.startsWith('data:') || value.startsWith('mailto:')) continue;
      refs.add(value.startsWith('/') ? value : '/' + value.replace(/^\.\//, ''));
    }
    for (const ref of [...refs].sort()) {
      snapshot.assets[ref + '  <' + path.basename(ref) + '>'] = await getAsset(ref);
    }
  }

  for (const urlPath of NEGATIVE_CASES) {
    snapshot.negative['GET ' + urlPath] = await getAsset(urlPath);
  }
  return snapshot;
}

function diffPaths(a, b, trail, out, depth) {
  if (out.length >= 12) return out;
  if (a === b) return out;
  const typeA = a === null ? 'null' : typeof a;
  const typeB = b === null ? 'null' : typeof b;
  if (typeA !== typeB || (typeA !== 'object' && a !== b)) {
    out.push(trail.join('.') + ': ' + JSON.stringify(a) + '  ->  ' + JSON.stringify(b));
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { out.push(trail.join('.') + ': array shape changed'); return out; }
    if (a.length !== b.length) out.push(trail.join('.') + '.length: ' + a.length + ' -> ' + b.length);
    const len = Math.min(a.length, b.length, 5);
    for (let i = 0; i < len; i += 1) diffPaths(a[i], b[i], trail.concat('[' + i + ']'), out, depth + 1);
    return out;
  }
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of [...keys].sort()) {
    if (!(key in (a || {}))) { out.push(trail.concat(key).join('.') + ': (missing) -> present'); continue; }
    if (!(key in (b || {}))) { out.push(trail.concat(key).join('.') + ': present -> (missing)'); continue; }
    diffPaths(a[key], b[key], trail.concat(key), out, depth + 1);
  }
  return out;
}

function compare(before, after) {
  const lines = [];
  let same = 0;
  let changed = 0;
  for (const section of ['api', 'assets', 'negative']) {
    const keys = new Set([...Object.keys(before[section] || {}), ...Object.keys(after[section] || {})]);
    for (const key of [...keys].sort()) {
      const a = (before[section] || {})[key];
      const b = (after[section] || {})[key];
      if (a === undefined) { lines.push('[NEW]     ' + section + ' :: ' + key); changed += 1; continue; }
      if (b === undefined) { lines.push('[REMOVED] ' + section + ' :: ' + key); changed += 1; continue; }
      const details = diffPaths(a, b, [], [], 0);
      if (!details.length) { same += 1; continue; }
      changed += 1;
      lines.push('[DIFF]    ' + section + ' :: ' + key);
      details.slice(0, 8).forEach(line => lines.push('            ' + line.slice(0, 300)));
    }
  }
  lines.push('');
  lines.push('identical cases: ' + same + '   changed cases: ' + changed);
  return lines.join('\n');
}

(async () => {
  const snapshot = await collect();
  const json = JSON.stringify(snapshot, null, 2);
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, json + '\n', 'utf8');
    console.log('snapshot written: ' + path.resolve(OUT) + '  (' + json.length + ' bytes)');
  }
  if (DIFF) {
    const before = JSON.parse(fs.readFileSync(DIFF, 'utf8'));
    console.log('\n=== diff ' + DIFF + '  vs  new snapshot ===');
    console.log(compare(before, JSON.parse(json)));
  }
  if (!OUT && !DIFF) console.log(json);
})().catch(error => { console.error(error); process.exitCode = 1; });
