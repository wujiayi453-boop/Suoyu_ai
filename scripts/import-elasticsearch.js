/*
 * 将离线 JSONL 以原始字段写入本机 Elasticsearch。
 * 使用方法（由安装脚本调用）：
 *   node scripts/import-elasticsearch.js
 * 需要环境变量 ES_ADMIN_PASSWORD；该密码不写入本文件或 .env。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
const rawRootDir = path.join(root, 'database', 'raw');
const nestedRawDir = path.join(rawRootDir, 'raw');
const rawDir = fs.existsSync(path.join(rawRootDir, 'ai_news_merged.jsonl')) ? rawRootDir : nestedRawDir;
const endpoint = new URL(process.env.ES_URL || 'https://localhost:9200');
const password = process.env.ES_ADMIN_PASSWORD;
const caPath = process.env.ES_CA_CERT || 'D:/software/elasticsearch-9.5.2/config/certs/localhost/localhost.crt';
if (!password) throw new Error('缺少 ES_ADMIN_PASSWORD；请使用本机 elastic 管理密码运行导入。');

const sources = [
  { index:'articles_v2', mapping:'articles.json', file:'arxiv_papers_fulltext_clean.jsonl', id:'id' },
  { index:'companies_v2', mapping:'companies.json', file:'companies_clean.jsonl', id:'company_id' },
  { index:'jobs_v2', mapping:'jobs.json', file:'jobs_clean.jsonl', id:'job_id' },
  { index:'models_v2', mapping:'models.json', file:'models_merged.jsonl', id:'id' },
  { index:'news_v2', mapping:'news.json', file:'ai_news_merged.jsonl', id:'news_id' }
];

function request(method, pathname, body, contentType='application/json') {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(body);
    const req = https.request({
      hostname:endpoint.hostname, port:endpoint.port || 443, path:pathname, method,
      ca:fs.readFileSync(caPath),
      auth:`elastic:${password}`,
      headers: payload ? { 'content-type':contentType, 'content-length':payload.length } : {}
    }, response => {
      const chunks=[];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text=Buffer.concat(chunks).toString('utf8');
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${method} ${pathname}: ${response.statusCode} ${text.slice(0,500)}`));
        try { resolve(text ? JSON.parse(text) : {}); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// IK 9.5.1 不能加载到 Elasticsearch 9.5.2；保留字段类型，仅落回内置分析器。
function portable(value) {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== 'object') return value;
  const next={};
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'analyzer' || key === 'search_analyzer') && /^ik_/.test(String(item))) continue;
    next[key]=portable(item);
  }
  return next;
}

// keyword 有 32766 bytes 的 Lucene 上限。原始采集的 source_keyword 偶尔包含
// 重复的长搜索词；只截断 keyword 值，全文字段（论文正文/JD）保持完整。
function trimKeywordValues(document, properties) {
  if (!document || !properties) return document;
  for (const [field, definition] of Object.entries(properties)) {
    const value=document[field];
    if (value === undefined || value === null) continue;
    if (definition.type === 'keyword') {
      const trim=value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 24000
        ? Buffer.from(value, 'utf8').subarray(0, 24000).toString('utf8') : value;
      document[field]=Array.isArray(value) ? value.map(trim) : trim(value);
    } else if (definition.properties && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(item => trimKeywordValues(item, definition.properties));
      else trimKeywordValues(value, definition.properties);
    }
  }
  return document;
}

function normalizeNumericValues(document, properties) {
  if (!document || !properties) return document;
  const numeric=new Set(['byte','short','integer','long','half_float','float','double','scaled_float']);
  const parse=value => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    const match=value.trim().replace(/,/g, '').match(/^([+-]?[\d.]+)\s*([kKmMgGtT])?$/);
    if (!match) return null;
    const multiplier={ k:1e3, m:1e6, g:1e9, t:1e12 }[(match[2] || '').toLowerCase()] || 1;
    const number=Number(match[1]) * multiplier;
    return Number.isFinite(number) ? number : null;
  };
  for (const [field, definition] of Object.entries(properties)) {
    const value=document[field];
    if (value === undefined || value === null) continue;
    if (numeric.has(definition.type)) {
      const normalized=Array.isArray(value) ? value.map(parse) : parse(value);
      if (normalized === null || (Array.isArray(normalized) && normalized.some(x => x === null))) delete document[field];
      else document[field]=normalized;
    } else if (definition.properties && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(item => normalizeNumericValues(item, definition.properties));
      else normalizeNumericValues(value, definition.properties);
    }
  }
  return document;
}

async function createIndex(source) {
  const mapping=portable(JSON.parse(fs.readFileSync(path.join(root, 'database', 'mapping', source.mapping), 'utf8')));
  await request('PUT', `/${source.index}`, JSON.stringify({ settings:{ number_of_shards:1, number_of_replicas:0 }, ...mapping }));
  console.log(`已创建 ${source.index}`);
}

async function bulk(source, lines) {
  const response=await request('POST', `/${source.index}/_bulk?refresh=false`, lines.join('\n')+'\n', 'application/x-ndjson');
  if (response.errors) {
    const bad=(response.items || []).find(x => x.index && x.index.error);
    throw new Error(`${source.index} 批量写入失败: ${JSON.stringify(bad).slice(0,800)}`);
  }
}

async function importOne(source) {
  const rawMapping=JSON.parse(fs.readFileSync(path.join(root, 'database', 'mapping', source.mapping), 'utf8'));
  const properties=rawMapping.mappings && rawMapping.mappings.properties;
  await createIndex(source);
  const input=fs.createReadStream(path.join(rawDir, source.file), { encoding:'utf8' });
  const reader=readline.createInterface({ input, crlfDelay:Infinity });
  let lines=[], bytes=0, count=0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    const document=normalizeNumericValues(trimKeywordValues(JSON.parse(line), properties), properties);
    const id=document[source.id];
    if (!id) continue;
    const action=JSON.stringify({ index:{ _id:String(id) } });
    lines.push(action, JSON.stringify(document));
    bytes += Buffer.byteLength(action) + Buffer.byteLength(line) + 2;
    count++;
    if (bytes >= 4 * 1024 * 1024) {
      await bulk(source, lines); lines=[]; bytes=0;
      if (count % 500 === 0) console.log(`${source.index}: ${count}`);
    }
  }
  if (lines.length) await bulk(source, lines);
  await request('POST', `/${source.index}/_refresh`);
  console.log(`完成 ${source.index}: ${count}`);
}

(async () => {
  const from=process.env.IMPORT_FROM;
  const start=from ? sources.findIndex(source => source.index === from) : 0;
  if (start < 0) throw new Error(`未知 IMPORT_FROM: ${from}`);
  for (const source of sources.slice(start)) await importOne(source);
})().catch(error => { console.error(error.stack || error); process.exitCode=1; });
