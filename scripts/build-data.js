const fs = require('fs');
const readline = require('readline');

// Keep the complete offline package portable: every path is resolved from the project root.
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const rawRootDir = path.join(projectRoot, 'database', 'raw');
const nestedRawDir = path.join(rawRootDir, 'raw');
const rawDir = fs.existsSync(path.join(rawRootDir, 'ai_news_merged.jsonl')) ? rawRootDir : nestedRawDir;
const generatedDir = path.join(projectRoot, 'database', 'generated');
const publicJsDir = path.join(projectRoot, 'public', 'js');
const files = {
  news: 'ai_news_merged.jsonl',
  paper: 'arxiv_papers_fulltext_clean.jsonl',
  company: 'companies_clean.jsonl',
  job: 'jobs_clean.jsonl',
  model: 'models_merged.jsonl'
};
// Keep compact, renderable fields for every record rather than shipping raw full text.
const limit = Infinity;
const previewPerType = 70;
const arr = value => Array.isArray(value) ? value.filter(Boolean).map(String) : value ? [String(value)] : [];
const plain = value => String(value || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const clip = (value, n=210) => plain(value).slice(0, n);
const names = value => (Array.isArray(value) ? value : []).map(item => typeof item === 'string' ? item : item && item.name).filter(Boolean);

function normalize(type, o) {
  if (type === 'news') return { id:o.news_id, type, title:o.title, summary:clip(o.summary || o.content), source:o.source_name || o.source || '资讯来源', city:'', date:o.published_at || o.crawled_at || '', category:o.category || 'AI 资讯', tags:[...arr(o.tags), ...arr(o.ai_domains), ...arr(o.technologies)].slice(0,10), url:o.source_url || '', meta:o.source_site || '', detail:{sourceSite:o.source_site || '', companies:arr(o.companies), models:arr(o.models), technologies:arr(o.technologies), keywords:arr(o.keywords), aiDomains:arr(o.ai_domains)} };
  if (type === 'paper') return { id:o.id, type, title:o.title, summary:clip(o.abstract || o.description), source:o.source || 'arXiv', city:'', date:o.published_date || o.updated_date || '', category:(arr(o.categories)[0] || 'Research'), tags:[...arr(o.categories), ...arr(o.tags)].slice(0,10), url:o.url || o.html_url || '', meta:names(o.authors).slice(0,3).join(', '), detail:{abstract:clip(o.abstract || o.description,6000),authors:names(o.authors),categories:arr(o.categories),license:o.license || '',pdfUrl:o.pdf_url || '',htmlUrl:o.html_url || '',doi:o.external_ids && o.external_ids.doi || '',task:o.extra && (o.extra.task_type || o.extra.pipeline_tag) || ''} };
  if (type === 'company') return { id:o.company_id, type, title:o.name || o.company_key, summary:clip(o.oneliner || o.description), source:arr(o.sources).join(' · ') || '企业名录', city:o.city || o.city_hq || '', date:'', category:o.industry || 'AI 公司', tags:arr(o.tech_stack).slice(0,10), url:o.website || o.job_website || '', meta:`${o.company_size || ''} · ${o.active_job_count || o.job_count || 0} 个开放岗位`, detail:{description:clip(o.description || o.oneliner,6000),oneliner:o.oneliner || '',website:o.website || '',jobWebsite:o.job_website || '',size:o.company_size || '',stage:o.stage || '',funding:o.funding || '',location:o.location || '',techStack:arr(o.tech_stack),directions:o.job_directions || {},jobCities:arr(o.job_cities),openJobs:o.active_job_count || o.job_count || 0,businessDirection:o.business_direction || '',logo:o.logo || ''} };
  if (type === 'job') return { id:o.job_id, type, title:o.title, summary:clip(o.summary || o.jd), source:o.source || '招聘平台', company:o.company || '', companyId:o.company_id || '', city:o.city || '', date:o.published_at || o.updated_at || '', category:o.direction_label || o.industry || 'AI 岗位', tags:arr(o.skills).slice(0,10), url:o.apply_url || o.job_link || '', meta:[o.salary, o.experience, o.education, o.job_type].filter(Boolean).join(' · '), detail:{description:clip(o.jd || o.summary,6000),salary:o.salary || '',experience:o.experience || '',education:o.education || '',jobType:o.job_type || '',location:o.location || '',district:o.district || '',responsibilities:clip(o.responsibilities,4000),requirements:clip(o.requirements,4000),benefits:arr(o.benefits || o.welfare),industry:o.industry || '',applyUrl:o.apply_url || o.job_link || '',isRemote:o.is_remote === true,salaryMonthlyMin:Number(o.salary_monthly_min)||0,salaryMonths:Number(o.salary_months)||0,direction:o.direction || '',aiRelevant:o.is_ai_relevant === true,aiEvidenceLevel:o.ai_evidence_level || '',aiEvidenceHits:arr(o.ai_evidence_hits),directionConfidence:Number(o.direction_confidence)||0} };
  return { id:o.id, type, title:o.title, summary:clip(o.description || o.abstract), source:o.data_source || o.source || '模型库', city:'', date:o.updated_date || o.published_date || '', category:arr(o.categories)[0] || 'Model', tags:[...arr(o.tags), ...arr(o.categories)].slice(0,10), url:o.url || o.html_url || '', meta:[o.language, o.extra && o.extra.task_type].filter(Boolean).join(' · '), detail:{description:clip(o.description || o.abstract,6000),abstract:clip(o.abstract,6000),categories:arr(o.categories),authors:names(o.authors),license:o.license || '',language:o.language || '',task:o.extra && (o.extra.task_type || o.extra.pipeline_tag) || '',framework:o.extra && o.extra.framework || '',downloads:o.extra && o.extra.downloads || null,likes:o.extra && o.extra.likes || null,baseModel:o.extra && o.extra.base_model || ''} };
}

async function readFile(type, file) {
  const records=[]; let count=0;
  const rl=readline.createInterface({ input:fs.createReadStream(path.join(rawDir, file), {encoding:'utf8'}), crlfDelay:Infinity });
  for await (const line of rl) { if (!line.trim()) continue; count++; if (records.length < limit) { try { const o=JSON.parse(line); const n=normalize(type,o); if(n.id && n.title) records.push(n); } catch {} } }
  return {count, records};
}

async function buildJsonlOffsets(source, idField, target, recordedSource = source) {
  const offsets = {};
  const matcher = new RegExp(`"${idField}"\\s*:\\s*"([^"]+)"`);
  const input = fs.createReadStream(source, { highWaterMark:1024 * 1024 });
  let remainder = Buffer.alloc(0);
  let remainderOffset = 0;
  for await (const chunk of input) {
    const bytes = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
    let start = 0;
    for (let end = bytes.indexOf(10, start); end !== -1; end = bytes.indexOf(10, start)) {
      const line = bytes.subarray(start, end);
      const match = matcher.exec(line.toString('utf8'));
      if (match) offsets[match[1]] = [remainderOffset + start, end - start];
      start = end + 1;
    }
    remainder = bytes.subarray(start);
    remainderOffset += start;
  }
  if (remainder.length) {
    const match = matcher.exec(remainder.toString('utf8'));
    if (match) offsets[match[1]] = [remainderOffset, remainder.length];
  }
  fs.writeFileSync(target, JSON.stringify({ source: recordedSource, offsets }));
}

(async()=>{
  const out={generatedAt:new Date().toISOString(), sources:{}, records:[]};
  for(const [type,file] of Object.entries(files)){
    const r=await readFile(type,file);
    out.sources[type]={file,count:r.count};
    out.records.push(...r.records);
  }
  const preview={...out,records:Object.keys(files).flatMap(type=>out.records.filter(r=>r.type===type).slice(0,previewPerType).map(({detail,...record})=>record.type==='company'&&detail&&detail.logo?{...record,detail:{logo:detail.logo}}:record))};
  fs.writeFileSync(path.join(publicJsDir, 'data.js'),'window.SEARCH_DATA='+JSON.stringify(preview)+';');
  fs.writeFileSync(path.join(generatedDir, 'data-full.js'),'window.FULL_SEARCH_INDEX='+JSON.stringify(out)+';');
  await buildJsonlOffsets(path.join(rawDir, files.news), 'news_id', path.join(generatedDir, 'news-offsets.json'), path.relative(projectRoot, path.join(rawDir, files.news)));
  await buildJsonlOffsets(path.join(rawDir, files.paper), 'id', path.join(generatedDir, 'paper-offsets.json'), path.relative(projectRoot, path.join(rawDir, files.paper)));
  console.log(JSON.stringify(out.sources));
})();
