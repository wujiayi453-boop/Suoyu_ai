/**
 * search.js (local) - in-memory search over the local index.
 * Supports the full filter matrix used by the frontend (direction / source /
 * city / experience / education / job_type / size / stage / category / topic /
 * published windows) so the local fallback behaves like the ES backend.
 */
const { aiEvidenceRank, companyDirectionCodes, jobEducationOptions, jobExperienceOptions } = require('../../config/constants');
const { index, records, slim } = require('./data-index');

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function detailOf(record) {
  return record.detail || {};
}

function isIsoDay(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || '').trim());
}

function dayKey(value) {
  const raw = String(value || '').trim();
  return isIsoDay(raw) ? raw.slice(0, 10) : '';
}

function cityTokens(record) {
  const detail = detailOf(record);
  return [
    record.city,
    ...String(detail.location || '').split(/[\/、,，]/),
    ...String(detail.jobCities || '').split(/[,，]/),
    ...String(detail.jobCityMain || '').split(/[,，]/)
  ].map(item => String(item || '').trim()).filter(Boolean);
}

function matchesExperience(record, code) {
  const experience = String(detailOf(record).experience || '').trim();
  if (code === 'unspecified') return !experience;
  const labels = jobExperienceOptions[code] || [];
  return labels.includes(experience);
}

function matchesEducation(record, code) {
  const education = String(detailOf(record).education || '').trim();
  if (code === 'unspecified') return !education;
  const labels = jobEducationOptions[code] || [];
  return labels.includes(education);
}

function matchesCompanyDirection(record, label) {
  const code = companyDirectionCodes[label];
  const directions = detailOf(record).directions;
  if (!code || !directions || typeof directions !== 'object') return false;
  return Number(directions[code]) > 0;
}

function newsTopicHaystack(record) {
  const detail = detailOf(record);
  return [record.tags, detail.technologies, detail.keywords, detail.models, detail.companies]
    .flatMap(asList).join(' ');
}

function activeFilters(type, params) {
  const value = name => {
    const raw = params.get(name);
    return raw && raw !== 'all' ? raw : '';
  };
  return {
    city: value('city'), source: value('source'), direction: value('direction'),
    experience: value('experience'), education: value('education'), jobType: value('job_type'),
    size: value('size'), stage: value('stage'), category: value('category'), topic: value('topic'),
    published: value('published'), from: params.get('published_from') || '', to: params.get('published_to') || '',
    isRemote: value('is_remote'), salaryMin: params.get('salary_min') || '', salaryMonths: params.get('salary_months') || '',
    companyName: params.get('company') || '', businessDirection: params.get('business_direction') || '',
    activeJobCount: params.get('active_job_count') || '', aiDomains: params.get('ai_domains') || ''
  };
}

function hasActiveFilters(filters) {
  return Object.values(filters).some(item => item);
}

function matchesFilters(type, record, filters) {
  const detail = detailOf(record);
  if (filters.source && String(record.source || '') !== filters.source) return false;
  if (type === 'job') {
    if (filters.city && record.city !== filters.city && String(detail.location || '').split('·')[0] !== filters.city) return false;
    if (filters.direction && record.category !== filters.direction) return false;
    if (filters.experience && !matchesExperience(record, filters.experience)) return false;
    if (filters.education && !matchesEducation(record, filters.education)) return false;
    if (filters.jobType && String(detail.jobType || '') !== filters.jobType) return false;
    if (filters.isRemote && Boolean(detail.isRemote) !== (filters.isRemote === 'true')) return false;
    if (filters.salaryMin && Number(detail.salaryMonthlyMin || 0) < Number(filters.salaryMin)) return false;
    if (filters.salaryMonths && Number(detail.salaryMonths || 0) !== Number(filters.salaryMonths)) return false;
    if (filters.companyName && String(record.company || '') !== filters.companyName) return false;
    return true;
  }
  if (type === 'company') {
    if (filters.city && !cityTokens(record).includes(filters.city)) return false;
    if (filters.direction && !matchesCompanyDirection(record, filters.direction)) return false;
    if (filters.size && String(detail.size || '') !== filters.size) return false;
    if (filters.stage && String(detail.stage || '') !== filters.stage) return false;
    if (filters.businessDirection && String(detail.businessDirection || '') !== filters.businessDirection) return false;
    if (filters.activeJobCount && Number(detail.openJobs || 0) < Number(filters.activeJobCount)) return false;
    return true;
  }
  if (type === 'news') {
    if (filters.category && String(record.category || '') !== filters.category) return false;
    if (filters.topic && !newsTopicHaystack(record).includes(filters.topic)) return false;
    if (filters.published === 'unspecified' && isIsoDay(record.date)) return false;
    if (filters.from || filters.to) {
      const day = dayKey(record.date);
      if (!day) return false;
      if (filters.from && day < filters.from.slice(0, 10)) return false;
      if (filters.to && day > filters.to.slice(0, 10)) return false;
    }
    if (filters.companyName && !asList(detail.companies).includes(filters.companyName)) return false;
    if (filters.aiDomains && !asList(detail.aiDomains).includes(filters.aiDomains)) return false;
    return true;
  }
  if (filters.city && record.city !== filters.city) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * 检索范围(scope) + 布尔高级检索(and / or / not / advanced)
 * 语义对齐 Elasticsearch 版 query.js 的 scopedSearchFields 与
 * paperAdvancedClauses；离线模式只在内存索引字段上匹配：
 * 资讯正文与论文全文分别存放在 211MB / 975MB 的 JSONL 里，逐条读盘
 * 会让每次检索变成十几秒的磁盘扫描，所以 content / fulltext 用
 * 摘要 + 关键词 + 标签等内存字段近似，其余范围都是精确字段。
 * ------------------------------------------------------------------ */
const SCOPES_BY_TYPE = {
  job: new Set(['all', 'title', 'company', 'skills', 'city']),
  news: new Set(['all', 'title', 'content']),
  paper: new Set(['all', 'title', 'author', 'abstract', 'keyword', 'fulltext']),
  model: new Set(['all', 'title', 'description', 'task', 'framework', 'source', 'tag'])
};

function joinText(...parts) {
  return parts.map(part => (Array.isArray(part) ? part.join(' ') : part === undefined || part === null ? '' : String(part))).join(' ');
}

function normalizeScope(type, value, fallback) {
  const allowed = SCOPES_BY_TYPE[type];
  if (!allowed) return 'all';
  if (allowed.has(value)) return value;
  return allowed.has(fallback) ? fallback : 'all';
}

function scopedHaystack(record, type, scope) {
  const detail = detailOf(record);
  const everything = joinText(record.title, record.summary, record.tags, record.company, record.city, record.category, record.meta);
  if (!scope || scope === 'all') return everything;
  if (type === 'job') {
    if (scope === 'title') return joinText(record.title);
    if (scope === 'company') return joinText(record.company);
    if (scope === 'skills') return joinText(record.tags, detail.requirements, detail.industry);
    if (scope === 'city') return joinText(record.city, detail.location, detail.district);
  }
  if (type === 'news') {
    if (scope === 'title') return joinText(record.title);
    if (scope === 'content') return joinText(record.summary, record.tags, detail.keywords, detail.companies, detail.models, detail.technologies, record.meta);
  }
  if (type === 'paper') {
    if (scope === 'title') return joinText(record.title);
    if (scope === 'author') return joinText(detail.authors, record.meta);
    if (scope === 'abstract') return joinText(detail.abstract, record.summary);
    if (scope === 'keyword') return joinText(record.tags, detail.categories, detail.task);
    if (scope === 'fulltext') return joinText(detail.abstract, record.summary, record.title, record.tags, detail.authors, detail.categories, detail.task);
  }
  if (type === 'model') {
    if (scope === 'title') return joinText(record.title);
    if (scope === 'description') return joinText(detail.description, detail.abstract, record.summary);
    if (scope === 'task') return joinText(detail.task, record.category);
    if (scope === 'framework') return joinText(detail.framework, record.meta);
    if (scope === 'source') return joinText(record.source);
    if (scope === 'tag') return joinText(record.tags, detail.language, detail.license, detail.baseModel);
  }
  return everything;
}

// 兼容 simple_query_string 的常见写法：a b（默认算符）、a | b、a OR b、a AND b、-a、NOT a、"短语"
function parseBooleanText(text) {
  const tokens = String(text || '').match(/"[^"]+"|\S+/g) || [];
  const orParts = [];
  const excludes = [];
  let current = [];
  let negateNext = false;
  tokens.forEach(token => {
    const value = token.replace(/^"|"$/g, '');
    const upper = value.toUpperCase();
    if (!value) return;
    if (upper === 'AND' || value === '+') return;
    if (upper === 'OR' || value === '|') { if (current.length) { orParts.push(current); current = []; } return; }
    if (upper === 'NOT') { negateNext = true; return; }
    if (value.startsWith('-') && value.length > 1) { excludes.push(value.slice(1).toLowerCase()); return; }
    if (negateNext) { excludes.push(value.toLowerCase()); negateNext = false; return; }
    negateNext = false;
    current.push(value.toLowerCase());
  });
  if (current.length) orParts.push(current);
  return { orParts, excludes };
}

function matchesClause(haystack, parsed, anyWithin) {
  if (parsed.excludes.some(term => haystack.includes(term))) return false;
  if (!parsed.orParts.length) return true;
  const partOk = part => (anyWithin ? part.some(term => haystack.includes(term)) : part.every(term => haystack.includes(term)));
  return parsed.orParts.length > 1 ? parsed.orParts.some(partOk) : partOk(parsed.orParts[0]);
}

function advancedClauses(params, type, defaultScope) {
  const operators = new Set(['and', 'or', 'not']);
  const normalize = value => ({
    operator: operators.has(value && value.operator) ? value.operator : 'and',
    scope: normalizeScope(type, value && value.scope, defaultScope),
    query: String((value && value.query) || '').trim()
  });
  const encoded = params.get('advanced');
  let list = null;
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded);
      if (Array.isArray(parsed)) list = parsed.slice(0, 12).map(normalize);
    } catch {}
  }
  if (!list) {
    list = ['and', 'or', 'not'].map(operator => normalize({
      operator,
      scope: params.get(operator + '_scope') || defaultScope,
      query: params.get(operator)
    }));
  }
  return list.filter(clause => clause.query).map(clause => ({ ...clause, parsed: parseBooleanText(clause.query) }));
}

// 中文搜索停用词：查询里的泛用词不参与匹配，避免"岗位""招聘"等词把所有结果过滤掉
const STOP_WORDS = new Set([
  '岗位', '招聘', '职位', '工作', '人才', '方向', '相关', '的', '了', '在', '是', '和', '与', '及',
  'job', 'jobs', 'position', 'recruitment', 'hire', 'hiring', 'career'
]);

/**
 * 混合分词：英文/数字按词，中文按 2-gram 滑窗，去掉停用词。
 * "上海AI岗位" → ["上海", "ai"]（"岗位"被停用）
 * "NLP 算法" → ["nlp", "算法"]
 */
function tokenize(q) {
  const parts = String(q || '').match(/[a-zA-Z0-9]+|[\u4e00-\u9fa5]+/g) || [];
  const tokens = [];
  for (const part of parts) {
    if (/^[a-zA-Z0-9]+$/.test(part)) {
      const lower = part.toLowerCase();
      if (!STOP_WORDS.has(lower)) tokens.push(lower);
    } else {
      // 纯中文连续段
      if (part.length === 1) {
        if (!STOP_WORDS.has(part)) tokens.push(part);
      } else {
        for (let i = 0; i < part.length - 1; i++) {
          const gram = part.slice(i, i + 2);
          if (!STOP_WORDS.has(gram)) tokens.push(gram);
        }
      }
    }
  }
  return tokens;
}

function matchingRecords(params) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const type = params.get('type') || 'all';
  const terms = tokenize(q);
  const scope = normalizeScope(type, params.get('scope') || 'all', 'all');
  const clauses = advancedClauses(params, type, scope);
  const andClauses = clauses.filter(clause => clause.operator === 'and');
  const orClauses = clauses.filter(clause => clause.operator === 'or');
  const notClauses = clauses.filter(clause => clause.operator === 'not');
  const filters = activeFilters(type, params);
  const filtered = hasActiveFilters(filters);
  const needsText = Boolean(terms.length) || Boolean(clauses.length);
  return records.filter(record => {
    if (type !== 'all' && record.type !== type) return false;
    if (filtered && !matchesFilters(record.type, record, filters)) return false;
    if (!needsText) return true;
    const cache = new Map();
    const haystack = want => {
      const key = want || 'all';
      if (!cache.has(key)) cache.set(key, scopedHaystack(record, record.type, key).toLowerCase());
      return cache.get(key);
    };
    if (terms.length && !terms.every(term => haystack(scope).includes(term))) return false;
    if (andClauses.some(clause => !matchesClause(haystack(clause.scope), clause.parsed, false))) return false;
    if (orClauses.length && !orClauses.some(clause => matchesClause(haystack(clause.scope), clause.parsed, true))) return false;
    if (notClauses.some(clause => matchesClause(haystack(clause.scope), clause.parsed, true))) return false;
    return true;
  });
}

function recordTime(record) {
  const raw = String(record.date || '').trim();
  const timestamp = Date.parse(raw);
  if (Number.isFinite(timestamp)) return timestamp;
  const match = raw.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : 0;
}

const titleCompare = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');

/* ------------------------------------------------------------------ *
 * 岗位「AI 相关度」排序
 *
 * 库里 6017 条岗位 is_ai_relevant 全为 true，光看这个布尔值排不出先后，
 * 所以按分级证据 ai_evidence_level 打分（与 ES 的 evidenceSort 同一套分值）：
 *   strong(4) > weak_*(3) > title_role / curated_company_technical(2) > adjacent_*(1)
 * 同级别内再用查询词命中位置加权（标题 > 技能标签 > 公司 > 摘要），
 * 最后才退化到方向置信度、更新时间、标题，保证结果稳定可复现。
 * ------------------------------------------------------------------ */
function aiEvidenceScore(record) {
  const detail = detailOf(record);
  const level = String(detail.aiEvidenceLevel || '').trim();
  if (!level) return 0;
  return aiEvidenceRank[level] || 0;
}

function countHits(text, term) {
  if (!text || !term) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(term, from);
    if (at === -1) return count;
    count++;
    from = at + term.length;
  }
}

function textRelevance(record, terms) {
  if (!terms || !terms.length) return 0;
  const detail = detailOf(record);
  const title = String(record.title || '').toLowerCase();
  const tags = joinText(record.tags).toLowerCase();
  const company = String(record.company || '').toLowerCase();
  const summary = String(record.summary || '').toLowerCase();
  const requirements = String(detail.requirements || '').toLowerCase();
  let score = 0;
  terms.forEach(term => {
    score += countHits(title, term) * 8;
    score += countHits(tags, term) * 4;
    score += countHits(company, term) * 3;
    score += countHits(summary, term) * 2;
    score += countHits(requirements, term) * 1;
  });
  return score;
}

function directionConfidence(record) {
  return Number(detailOf(record).directionConfidence) || 0;
}

// 岗位默认排序：AI 相关度优先，其次查询词命中，再退化到置信度 / 时间 / 标题
function jobRelevanceCompare(terms) {
  return (a, b) => {
    const evidence = aiEvidenceScore(b) - aiEvidenceScore(a);
    if (evidence) return evidence;
    const text = textRelevance(b, terms) - textRelevance(a, terms);
    if (text) return text;
    const confidence = directionConfidence(b) - directionConfidence(a);
    if (confidence) return confidence;
    const time = recordTime(b) - recordTime(a);
    if (time) return time;
    return titleCompare(a, b);
  };
}

// 公司薪资中位数：从岗位记录解析月薪并聚合，供“按薪资中位数排序”使用
const salaryMedianCache = new Map();

/**
 * 把薪资文本折算成「月薪（元）」。
 *
 * 数据里的写法很杂：20-35K·15薪 / 8千-1.2万 / 200-250元/天 / 20-40万/年 / 30-60元/时 …
 * 旧实现只认「万 / 千 / K」，于是 700 多条日薪、170 多条年薪、几十条时薪全部解析成 0，
 * 公司月薪中位数明明有样本却显示「未注明」。这里补上周期换算：
 *   年 → ÷12，天 → ×21.75（月计薪天数），周 → ×52/12，时 → ×21.75×8。
 */
const SALARY_PERIODS = [
  { pattern: /年|yr|year/i, factor: 1 / 12 },
  { pattern: /天|日|day/i, factor: 21.75 },
  { pattern: /周|week/i, factor: 52 / 12 },
  { pattern: /小时|时|hour|hr/i, factor: 21.75 * 8 }
];

function parseSalary(text) {
  const source = String(text || '').trim();
  if (!source) return 0;
  if (/面议|电议|待议|面谈/.test(source)) return 0;
  // 「15薪」是发放月数不是金额，先摘掉，否则会被当成一个数字拉低均值。
  const body = source.replace(/\d+\s*薪/g, '');
  const period = SALARY_PERIODS.find(item => item.pattern.test(body));
  const factor = period ? period.factor : 1;
  const scale = ch => (ch === '万' ? 10000 : 1000);
  const primary = body.includes('万') ? 10000 : /[千kK]/.test(body) ? 1000 : 1;
  // 先按原始单位放行（日薪「200-250元/天」里的 200 本身就是合法值），折算成月薪后再卡区间。
  const numbers = [...body.matchAll(/(\d+(?:\.\d+)?)\s*(万|千|[kK])?/g)]
    .map(match => Number(match[1]) * (match[2] ? scale(match[2]) : primary))
    .filter(value => value >= 15 && value <= 5000000);
  if (!numbers.length) return 0;
  const monthly = numbers.reduce((sum, value) => sum + value, 0) / numbers.length * factor;
  if (!Number.isFinite(monthly) || monthly < 500 || monthly > 500000) return 0;
  return Math.round(monthly);
}

function companySalaryMedians() {
  if (salaryMedianCache.size) return salaryMedianCache;
  const buckets = new Map();
  records.forEach(record => {
    if (record.type !== 'job') return;
    const key = record.companyId || record.company;
    if (!key) return;
    const value = parseSalary(detailOf(record).salary);
    if (!value) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(value);
  });
  buckets.forEach((values, key) => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    salaryMedianCache.set(key, values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
  });
  return salaryMedianCache;
}

function companySalary(record) {
  const medians = companySalaryMedians();
  return medians.get(record.companyId) || medians.get(record.title) || 0;
}

function companyActivity(record) {
  return Number(detailOf(record).openJobs) || 0;
}

/**
 * 抓取失败的资讯只剩一个标题：没有摘要、没有正文、也没有配图。
 * 它们恰好集中在最新一天，会把「最新优先」的首屏占满，看起来像图片全坏了。
 * 这里不删除数据（总数不变、仍可通过搜索或直达链接命中），只把空壳记录沉到列表末尾。
 */
function newsHasBody(record) {
  return Boolean(String(record.summary || '').trim());
}

function sortNewsResults(list, requested) {
  const ordered = rows => {
    if (requested !== 'time_asc' && requested !== 'time_desc') return rows;
    const direction = requested === 'time_asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const difference = recordTime(a) - recordTime(b);
      return difference ? direction * difference : titleCompare(a, b);
    });
  };
  const filled = [];
  const hollow = [];
  list.forEach(record => (newsHasBody(record) ? filled : hollow).push(record));
  if (!hollow.length) return ordered(filled);
  return ordered(filled).concat(ordered(hollow));
}

function sortResults(list, type, requested, options = {}) {
  const byTitle = titleCompare;
  if (type === 'news') return sortNewsResults(list, requested);
  if (type === 'job') {
    if (requested === 'title') return [...list].sort(byTitle);
    if (requested === 'source') return [...list].sort((a, b) => String(a.source || '').localeCompare(String(b.source || '')) || byTitle(a, b));
    if (requested === 'time') return [...list].sort((a, b) => recordTime(b) - recordTime(a) || byTitle(a, b));
    return [...list].sort(jobRelevanceCompare(options.terms));
  }
  // 混合检索（type=all）：只在岗位分组内部按 AI 相关度排，其余类型的原有次序不动。
  if (type === 'all' && (!requested || requested === 'relevance')) {
    const compare = jobRelevanceCompare(options.terms);
    const position = new Map(list.map((record, at) => [record, at]));
    return [...list].sort((a, b) => {
      if (a.type !== 'job' || b.type !== 'job') return position.get(a) - position.get(b);
      return compare(a, b);
    });
  }
  if (type === 'company') {
    if (requested === 'name') return [...list].sort(byTitle);
    if (requested === 'salary') return [...list].sort((a, b) => companySalary(b) - companySalary(a) || companyActivity(b) - companyActivity(a) || byTitle(a, b));
    if (requested === 'activity') return [...list].sort((a, b) => companyActivity(b) - companyActivity(a) || byTitle(a, b));
    return list;
  }
  if (type === 'model') {
    if (requested === 'title') return [...list].sort(byTitle);
    if (requested === 'time') return [...list].sort((a, b) => recordTime(b) - recordTime(a) || byTitle(a, b));
    return list;
  }
  return list;
}

function localSearch(params) {
  const q = (params.get('q') || '').trim();
  const type = params.get('type') || 'all';
  const requestedSort = params.get('sort') || (type === 'news' ? 'time_desc' : 'relevance');
  const results = sortResults(matchingRecords(params), type, requestedSort, { terms: tokenize(q) });
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.get('page_size')) || 20));
  if (params.get('group') === '1') {
    const groups = Object.fromEntries(['job','company','paper','model','news'].map(kind => {
      const group = results.filter(record => record.type === kind);
      return [kind, { total:group.length, results:group.slice(0, 4).map(slim) }];
    }));
    return { code:200, query:q, total:results.length, groups, sources:index.sources };
  }
  const offset = (page - 1) * pageSize;
  return { code:200, query:q, type, total:results.length, page, page_size:pageSize, results:results.slice(offset, offset + pageSize).map(slim), sources:index.sources };
}

module.exports = { matchingRecords, localSearch, parseSalary };
