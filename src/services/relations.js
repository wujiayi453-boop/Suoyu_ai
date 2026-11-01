const { records } = require('./local/data-index');
const fs = require('fs');
const path = require('path');
const { rawDir } = require('../config/paths');
const key = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const names = new Map();
const aliases = [];
function addAlias(type, name, id, basis) {
  if (!key(name)) return;
  const term = `${type}:${key(name)}`;
  if (!names.has(term)) names.set(term, new Set());
  names.get(term).add(String(id));
  aliases.push({ type, name, id, basis });
}
records.filter(r => ['company', 'model'].includes(r.type)).forEach(r => addAlias(r.type, r.title, r.id, `${r.type}:${r.id}.title`));
const companyIds = new Set(records.filter(r => r.type === 'company').map(r => r.id));
const companiesFile = path.join(rawDir, 'companies_clean.jsonl');
if (fs.existsSync(companiesFile)) {
  for (const line of fs.readFileSync(companiesFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const company = JSON.parse(line);
    if (!companyIds.has(company.company_id)) continue;
    for (const field of ['aliases', 'name_legal', 'name_normalized', 'company_key']) {
      const values = Array.isArray(company[field]) ? company[field] : [company[field]];
      values.forEach(name => addAlias('company', name, company.company_id, `companies_clean.jsonl:${company.company_id}.${field}`));
    }
  }
}
records.filter(r => r.type === 'job' && companyIds.has(r.companyId)).forEach(r => addAlias('company', r.company, r.companyId, `job:${r.id}.company + companyId`));
function mentionedEntity(news, entity) {
  if (news.type !== 'news' || !['company', 'model'].includes(entity.type)) return '';
  const field = entity.type === 'company' ? 'companies' : 'models';
  return ((news.detail || {})[field] || []).find(name => {
    const ids = names.get(`${entity.type}:${key(name)}`);
    return ids?.size === 1 && ids.has(String(entity.id));
  }) || '';
}
const generic = new Set(['ai', '人工智能', '模型', '技术', '工程', '开发']);
const normalizedTags = new Map(records.map(r => [`${r.type}:${r.id}`, [...new Set((r.tags || []).map(key))]]));

// Only use explicit fields. Shared tags are topical links, never factual affiliation.
function relatedContent(record, unlimited = false) {
  const tags = new Map((record.tags || []).filter(t => !generic.has(key(t))).map(t => [key(t), t]));
  const detail = record.detail || {};
  const matches = [];
  for (const target of records) {
    if (target.type === record.type && target.id === record.id) continue;
    let relation = '', evidence = [], rank = 0;
    if ((record.type === 'job' && target.type === 'company' && record.companyId === target.id) ||
        (record.type === 'company' && target.type === 'job' && target.companyId === record.id)) {
      relation = '岗位所属公司'; evidence = ['岗位 companyId 与公司 id 一致']; rank = 3;
    } else {
      const mentioned = mentionedEntity(record, target) || mentionedEntity(target, record);
      if (mentioned) {
        const news = record.type === 'news' ? record : target;
        const entity = record.type === 'news' ? target : record;
        const basis = aliases.find(a => a.type === entity.type && String(a.id) === String(entity.id) && key(a.name) === key(mentioned));
        relation = '资讯提及'; evidence = [`news:${news.id} 的实体字段：${mentioned}`, `名称依据：${basis?.basis || '实体标题'}`]; rank = 2;
      }
    }
    if (!rank) {
      const shared = (normalizedTags.get(`${target.type}:${target.id}`) || []).filter(t => tags.has(t));
      if (shared.length < 2 || target.type === record.type) continue;
      relation = '共同主题'; evidence = shared.map(t => tags.get(t)); rank = 1;
    }
    matches.push({ type: target.type, id: target.id, title: target.title, relation, evidence, rank });
  }
  matches.sort((a, b) => b.rank - a.rank || b.evidence.length - a.evidence.length || String(a.id).localeCompare(String(b.id)));
  if (unlimited) return matches;
  const counts = {};
  return matches.filter(item => (counts[item.type] = (counts[item.type] || 0) + 1) <= 3).slice(0, 12);
}
module.exports = { relatedContent, aliases, names, key };
