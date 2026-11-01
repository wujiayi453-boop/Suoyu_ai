const fs = require('fs');
const path = require('path');
const { records } = require('../src/services/local/data-index');
const { localDetail } = require('../src/services/local/detail');
const totals = {}, issues = [];
for (const r of records) {
  const t = totals[r.type] ||= { total: 0, readable: 0, summaryOnly: 0, errors: 0 };
  t.total++;
  try {
    const d = localDetail(r.type, r.id);
    if (!d?.record?.title) throw new Error('Missing record/title');
    const content = r.type === 'news' ? d.article?.contentHtml || d.article?.content : r.type === 'paper' ? d.paper?.fullText || d.paper?.sections?.map(s=>s.content).join('') : d.record.detail?.description;
    if (content && String(content).trim()) t.readable++;
    else { t.summaryOnly++; issues.push({ type:r.type,id:r.id,reason:'No saved body',summary: Boolean(r.summary) }); }
  } catch (e) { t.errors++; issues.push({type:r.type,id:r.id,reason:e.message}); }
}
const file = path.join(__dirname,'../database/quality/content-report.json');
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,JSON.stringify({checkedAt:new Date().toISOString(),totals,issues},null,2));
console.log(JSON.stringify(totals,null,2));
if(Object.values(totals).some(t=>t.errors))process.exitCode=1;
