/**
 * data-index.js - loads database/generated/data-full.js and the two offset indexes.
 * Extracted verbatim from the legacy server.js lines L35-L42, L45-L48.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { dataFullFile, newsOffsetsFile, paperOffsetsFile, rawDir, root } = require('../../config/paths');
const { firstImageUrl, newsCover } = require('../../utils/news-cover');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(dataFullFile, 'utf8'), context);
const index = context.window.FULL_SEARCH_INDEX;
const records = index.records;
const byTypeAndId = new Map(records.map(record => [`${record.type}:${record.id}`, record]));
const newsOffsets = JSON.parse(fs.readFileSync(newsOffsetsFile, 'utf8'));
const paperOffsets = JSON.parse(fs.readFileSync(paperOffsetsFile, 'utf8'));
const companyLogos = new Map();
const companiesFile = path.join(rawDir, 'companies_clean.jsonl');

if (fs.existsSync(companiesFile)) {
  fs.readFileSync(companiesFile, 'utf8').split(/\r?\n/).forEach(line => {
    if (!line) return;
    try {
      const company = JSON.parse(line);
      if (company.company_id && company.logo) companyLogos.set(String(company.company_id), String(company.logo));
    } catch {}
  });
}

/**
 * News cover images live inside the article body, which is stored in a 200MB
 * JSONL addressed by byte offsets. Read the cover on demand and memoise it so
 * list responses carry a thumbnail without inflating the in-memory index.
 */
const newsCoverCache = new Map();
const NEWS_COVER_CACHE_LIMIT = 4000;

function newsCoverFor(id) {
  const key = String(id);
  if (newsCoverCache.has(key)) return newsCoverCache.get(key);
  let cover = '';
  const entry = newsOffsets.offsets[key];
  const file = path.isAbsolute(newsOffsets.source || '') ? newsOffsets.source : path.join(root, newsOffsets.source || '');
  if (entry && fs.existsSync(file)) {
    try {
      const [offset, length] = entry;
      const fd = fs.openSync(file, 'r');
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, offset);
      fs.closeSync(fd);
      const article = JSON.parse(buffer.toString('utf8').replace(/\r$/, ''));
      // 统一走 newsCover：它会剔除文章自身链接，并在「声明的 images」和正文首图之间挑出真正像图片的那张。
      cover = String(newsCover(article) || firstImageUrl(article.content_html) || '').trim();
    } catch { cover = ''; }
  }
  if (newsCoverCache.size >= NEWS_COVER_CACHE_LIMIT) newsCoverCache.clear();
  newsCoverCache.set(key, cover);
  return cover;
}

function slim(record) {
  const { detail, ...result } = record;
  if (record.type === 'company') {
    const logo = detail && detail.logo || companyLogos.get(String(record.id));
    if (logo) return { ...result, detail:{ logo } };
  }
  if (record.type === 'news') {
    const cover = newsCoverFor(record.id);
    if (cover) return { ...result, cover };
  }
  return result;
}

/*
 * AI 相关度证据。
 * 预览索引 data-full.js 只保留了摘要字段，ai_evidence_level 与 direction_confidence
 * 都留在清洗产物 jobs_clean.jsonl 里，所以默认排序读不到它们。这里按需把两个
 * 字段回填到 record.detail（detail 会被 slim 裁掉，只用于服务端排序，不外泄到响应体）。
 */
let jobEvidenceLoaded = false;

function ensureJobEvidence() {
  if (jobEvidenceLoaded) return false;
  jobEvidenceLoaded = true;
  const file = path.join(rawDir, 'jobs_clean.jsonl');
  if (!fs.existsSync(file)) return false;
  const started = Date.now();
  const evidence = new Map();
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    if (!line) return;
    let row = null;
    try { row = JSON.parse(line); } catch { return; }
    const id = String(row.job_id || '');
    if (!id) return;
    evidence.set(id, {
      level: String(row.ai_evidence_level || '').trim(),
      confidence: Number(row.direction_confidence) || 0,
      relevant: row.is_ai_relevant !== false
    });
  });
  let filled = 0;
  records.forEach(record => {
    if (record.type !== 'job') return;
    const row = evidence.get(String(record.id));
    if (!row) return;
    const detail = record.detail || {};
    if (row.level) detail.aiEvidenceLevel = row.level;
    if (row.confidence) detail.directionConfidence = row.confidence;
    detail.isAiRelevant = row.relevant;
    record.detail = detail;
    filled += 1;
  });
  console.log(`job AI evidence enriched: ${filled} jobs in ${Date.now() - started}ms`);
  return true;
}

module.exports = { context, index, records, byTypeAndId, newsOffsets, paperOffsets, slim, newsCoverFor, companyLogos, ensureJobEvidence };
