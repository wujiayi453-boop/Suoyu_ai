const fs = require('fs');
const path = require('path');
const { records } = require('../src/services/local/data-index');
const { relatedContent, aliases, names, key } = require('../src/services/relations');
const totals = {}, unlinked = [], unresolved = [], ambiguous = [], invalidReferences = [];
const companies = new Set(records.filter(r => r.type === 'company').map(r => r.id));
const factual = new Set(), buckets = new Map();
const generic = new Set(['ai','人工智能','模型','技术','工程','开发']);
const rid = r => `${r.type}:${r.id}`;
for (const r of records) {
  if (r.type === 'job' && companies.has(r.companyId)) { factual.add(rid(r)); factual.add(`company:${r.companyId}`); }
  if (r.type === 'news') for (const [field, type] of [['companies','company'],['models','model']]) {
    for (const name of (r.detail || {})[field] || []) {
      const ids = names.get(`${type}:${key(name)}`);
      if (ids?.size === 1) { factual.add(rid(r)); factual.add(`${type}:${[...ids][0]}`); }
    }
  }
  const tags = [...new Set((r.tags || []).map(key).filter(t => !generic.has(t)))].sort();
  for (let i=0;i<tags.length;i++) for(let j=i+1;j<tags.length;j++) {
    const pair=JSON.stringify([tags[i],tags[j]]);
    if (!buckets.has(pair)) buckets.set(pair, new Map());
    const group=buckets.get(pair);
    if (!group.has(r.type)) group.set(r.type, []);
    group.get(r.type).push(rid(r));
  }
}
const topical = new Set();
for (const group of buckets.values()) if (group.size > 1) for (const ids of group.values()) for(const id of ids) topical.add(id);
for (const r of records) {
  const count = totals[r.type] ||= { total: 0, linked: 0, factual: 0, topicalOnly: 0 };
  count.total++;
  if (factual.has(rid(r)) || topical.has(rid(r))) count.linked++;
  if (factual.has(rid(r))) count.factual++;
  else if (topical.has(rid(r))) count.topicalOnly++;
  else unlinked.push({ type: r.type, id: r.id, title: r.title });
  if (r.type === 'job' && r.companyId && !companies.has(r.companyId)) invalidReferences.push({ id: r.id, companyId: r.companyId });
  if (r.type === 'news') for (const [field, type] of [['companies', 'company'], ['models', 'model']]) {
    for (const name of (r.detail || {})[field] || []) {
      const ids = [...(names.get(`${type}:${key(name)}`) || [])];
      const item = { newsId: r.id, field, name, candidates: ids };
      if (!ids.length) unresolved.push(item);
      if (ids.length > 1) ambiguous.push(item);
    }
  }
}
for (const v of Object.values(totals)) v.coverage = Number((v.linked / v.total).toFixed(4));
const out = path.join(__dirname, '..', 'database', 'quality');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'entity-aliases.json'), JSON.stringify(aliases, null, 2));
fs.writeFileSync(path.join(out, 'relations-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), definition: '全量关联覆盖率，不受页面展示数量限制；事实关系与共同主题分别统计', totals, unresolved, ambiguous, invalidReferences, unlinked }, null, 2));
console.log(JSON.stringify({ totals, unresolved: unresolved.length, ambiguous: ambiguous.length, invalidReferences: invalidReferences.length }, null, 2));
