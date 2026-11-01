const DATA = window.SEARCH_DATA || { records: [], sources: {} };
const previewRecords = DATA.records || [];
const TYPE = {
  job: { route: 'jobs', label: '岗位', intro: '寻找下一份 AI 工作', placeholder: '搜索职位、技能或公司', totalLabel: '个岗位' },
  company: { route: 'companies', label: '公司', intro: '了解正在构建 AI 的团队', placeholder: '搜索公司、技术方向或城市', totalLabel: '家机构' },
  paper: { route: 'knowledge', label: 'AI论文', intro: '阅读前沿论文与研究方法', placeholder: '搜索论文标题、作者或研究主题', totalLabel: '篇论文' },
  model: { route: 'models', label: '模型', intro: '发现可用的开源与商业模型', placeholder: '搜索模型名称、任务或框架', totalLabel: '个模型' },
  news: { route: 'news', label: '资讯', intro: '追踪 AI 行业的新变化', placeholder: '搜索资讯标题、公司或技术', totalLabel: '篇资讯' }
};
const routeToType = Object.fromEntries(Object.entries(TYPE).map(([type, config]) => [config.route, type]));
const labels = Object.fromEntries(Object.entries(TYPE).map(([type, config]) => [type, config.label]));
const state = {
  favorites: new Set(JSON.parse(localStorage.getItem('ai-search-favorites-v3') || '[]')),
  known: new Map(previewRecords.map(record => [record.id, record])),
  renderId: 0,
  indexBackend: 'local',
  facets: {}
};
try {
  for (const record of JSON.parse(localStorage.getItem('ai-search-favorite-records-v1') || '[]')) {
    if (record && state.favorites.has(record.id)) state.known.set(record.id, record);
  }
} catch { /* Older saved lists remain usable if snapshot storage is invalid. */ }
let toastTimer;

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
const typeTotal = type => (DATA.sources[type] && DATA.sources[type].count) || 0;
const isServer = () => location.protocol === 'http:' || location.protocol === 'https:';

function routeInfo() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

function toHash(path, params = new URLSearchParams()) {
  const query = params.toString();
  location.hash = `#${path}${query ? `?${query}` : ''}`;
}

function setSearch(path, query, extras = {}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  Object.entries(extras).forEach(([key, value]) => { if (value && value !== 'all') params.set(key, value); });
  toHash(path, params);
}

function remember(records) {
  records.forEach(record => { if (record && record.id) state.known.set(record.id, record); });
}

function api(path) {
  return fetch(path, { headers: { Accept: 'application/json' } }).then(response => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  });
}

function textTerms(query) {
  return String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
}

function fallbackSearch(type, params) {
  const q = params.get('q') || '';
  const city = params.get('city') || 'all';
  const source = params.get('source') || 'all';
  const terms = textTerms(q);
  return previewRecords.filter(record => {
    const sourceText = [record.title, record.summary, record.tags, record.company, record.city, record.category, record.meta].join(' ').toLowerCase();
    return (!type || record.type === type) &&
      (!terms.length || terms.every(term => sourceText.includes(term))) &&
      (city === 'all' || record.city === city) &&
      (source === 'all' || record.source === source);
  });
}

function activeRoute(route) {
  document.body.dataset.section = route || 'home';
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  Object.keys(TYPE).forEach(type => {
    const el = $(`#count-${type}`);
    if (el) el.textContent = typeTotal(type).toLocaleString();
  });
  $('#favCount').textContent = state.favorites.size;
}

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('ai-search-favorites-v3', JSON.stringify([...state.favorites]));
  localStorage.setItem('ai-search-favorite-records-v1', JSON.stringify([...state.favorites].map(key => state.known.get(key)).filter(Boolean)));
  render();
  showToast(state.favorites.has(id) ? '已加入收藏' : '已取消收藏');
}

function highlight(value, query) {
  const safe = esc(value);
  const parts = textTerms(query).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return parts.length ? safe.replace(new RegExp(`(${parts.join('|')})`, 'gi'), '<mark>$1</mark>') : safe;
}

function hasHighlight(value, query) {
  const text = String(value || '').toLocaleLowerCase();
  return textTerms(query).some(term => text.includes(term.toLocaleLowerCase()));
}

// 列表高亮以标题为主；标题没有命中时，摘要只提示第一处匹配，避免满屏色块。
function summaryHighlight(value, title, query) {
  const safe = esc(value);
  if (hasHighlight(title, query)) return safe;
  const parts = textTerms(query).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return parts.length ? safe.replace(new RegExp(`(${parts.join('|')})`, 'i'), '<mark>$1</mark>') : safe;
}

/* 结果高亮除了主搜索词，也包含高级检索中实际参与匹配的正向条件。
   排除条件只用于过滤，不应在结果中制造“命中”的视觉暗示。 */
function resultHighlightQuery(params, type) {
  const terms = [params.get('q') || ''];
  if (type === 'paper' || type === 'model') {
    structuredAdvancedClauses(params, type)
      .filter(clause => clause.operator !== 'not')
      .forEach(clause => terms.push(clause.query));
  } else {
    ['and', 'or'].forEach(name => terms.push(params.get(name) || ''));
  }
  return terms.join(' ').replace(/\b(?:AND|OR|NOT)\b/gi, ' ').replace(/[|]/g, ' ');
}

function detailHash(record) {
  return `#/detail/${record.type}/${encodeURIComponent(record.id)}`;
}

function externalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw.replace(/^\/+/, '')}`;
}

function assetUrl(value) {
  const url = externalUrl(value);
  return url ? `/api/image?url=${encodeURIComponent(url)}` : '';
}

function favoriteButton(record) {
  const favorite = state.favorites.has(record.id);
  return `<button class="star ${favorite ? 'on' : ''}" data-favorite="${esc(record.id)}" aria-label="${favorite ? '取消收藏' : '收藏'} ${esc(record.title)}">${favorite ? '★' : '☆'}</button>`;
}

function jobMeta(label, value) {
  return `<span><b>${esc(label)}</b>${esc(value || '未注明')}</span>`;
}

function jobSalary(value) {
  const raw = String(value || '').trim();
  if (!raw) return '薪资未注明';
  return raw.split(/\s*(?:·|｜|\||，|,|；|;)\s*/)[0].trim() || '薪资未注明';
}

/* 资讯卡片：日期统一成 YY/MM/DD，已是本地化文案的（如「8月7·周五」）原样保留。 */
function newsDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1].slice(2)}/${iso[2]}/${iso[3]}` : raw;
}

const NEWS_SOURCE_TONES = 6;

/* 来源没有 logo，用来源名生成一枚稳定配色的圆形标识。 */
function newsSourceMeta(source) {
  const name = String(source || 'AI资讯').replace(/[（(].*$/, '').trim() || 'AI资讯';
  const acronym = name.match(/^[A-Z]{2,}/);
  const initial = acronym ? acronym[0].slice(0, 2) : name.slice(0, 1).toUpperCase();
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) % 9973;
  return { initial, tone: hash % NEWS_SOURCE_TONES };
}

function newsSourceBadge(source) {
  const { initial, tone } = newsSourceMeta(source);
  return `<span class="news-source-badge tone-${tone}" aria-hidden="true">${esc(initial)}</span>`;
}

function newsThumb(record, cover) {
  if (cover) return `<img class="news-thumb" src="${esc(assetUrl(cover))}" alt="" loading="lazy">`;
  const { initial, tone } = newsSourceMeta(record.source);
  return `<span class="news-thumb news-thumb-empty tone-${tone}" data-news-thumb="${esc(record.id)}" aria-hidden="true">${esc(initial)}</span>`;
}

function newsCardCover(record) {
  const detail = record.detail || {};
  return record.cover || detail.cover || detail.image || detail.imageUrl || '';
}

/* 资讯列表二次排序：有封面图的靠前，无图的靠后；组内保持后端返回的时间序。 */
function newsSortByCover(results) {
  const withCover = [];
  const without = [];
  results.forEach(record => (newsCardCover(record) ? withCover : without).push(record));
  return [...withCover, ...without];
}

function newsRow(record, query = '') {
  const cover = newsCardCover(record);
  const date = newsDateLabel(record.date);
  const summary = String(record.summary || '').trim();
  const hasSummary = Boolean(summary) && summary !== '暂无摘要';
  const summaryLine = hasSummary ? `<p>${summaryHighlight(summary, record.title, query)}</p>` : '';
  // 纯标题快讯没有正文也没有配图，收紧留白，避免整列出现大片空洞。
  const state = cover ? 'has-cover' : hasSummary ? 'no-cover' : 'no-cover is-brief';
  return `<li class="result news-card"><article class="${state}">${newsThumb(record, cover)}<div class="news-card-copy"><h3><a href="${detailHash(record)}">${highlight(record.title, query)}</a></h3>${summaryLine}<div class="news-card-foot">${newsSourceBadge(record.source)}<span class="news-source-name">${esc(record.source || 'AI资讯')}</span>${date ? `<time>${esc(date)}</time>` : ''}<span class="news-card-actions">${favoriteButton(record)}<a class="open" href="${detailHash(record)}">查看详情</a></span></div></div></article></li>`;
}

function jobRow(record, query) {
  const detail = record.detail || {};
  const salary = jobSalary(detail.salary || record.meta);
  return `<li class="result job-card"><article><span class="kind">JOB / 岗位</span><div class="job-title-line"><h3><a class="row-title" href="${detailHash(record)}">${highlight(record.title, query)}</a></h3><strong class="job-salary">${esc(salary)}</strong></div><div class="job-company">${esc(record.company || '未注明公司')}</div><div class="job-meta">${jobMeta('来源', record.source)}${jobMeta('城市', record.city)}${jobMeta('经验', detail.experience)}${jobMeta('学历', detail.education)}${jobMeta('类型', detail.jobType)}</div><p>${summaryHighlight(record.summary || '暂无摘要', record.title, query)}</p><div class="tags">${(record.tags || []).slice(0, 6).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div></article><div class="actions">${favoriteButton(record)}<a class="open" href="${detailHash(record)}">查看详情</a>${external(record.url, '投递')}</div></li>`;
}

function companyLogo(record) {
  const logo = record.detail && record.detail.logo;
  const name = String(record.title || '').trim();
  if (logo) return `<img class="company-logo" src="${esc(assetUrl(logo))}" alt="" loading="lazy">`;
  return `<span class="company-logo company-logo-fallback" aria-hidden="true">${esc(name.slice(0, 1) || '企')}</span>`;
}

function companyRow(record, query) {
  return `<li class="result company-card"><article class="company-card-main">${companyLogo(record)}<div><span class="kind">COMPANY / 公司</span><h3><a class="row-title" href="${detailHash(record)}">${highlight(record.title, query)}</a></h3><p>${summaryHighlight(record.summary || '暂无简介', record.title, query)}</p></div></article><a class="company-arrow" href="${detailHash(record)}" aria-label="查看 ${esc(record.title)} 详情">→</a></li>`;
}

function row(record, query = '') {
  if (record.type === 'job') return jobRow(record, query);
  if (record.type === 'company') return companyRow(record, query);
  if (record.type === 'news') return newsRow(record, query);
  return `<li class="result"><article><span class="kind">${labels[record.type].toUpperCase()}</span><h3><a class="row-title" href="${detailHash(record)}">${highlight(record.title, query)}</a></h3><div class="meta"><span>${esc(record.company || record.source || '')}</span>${record.city ? `<span>${esc(record.city)}</span>` : ''}<span>${esc(record.category || '')}</span>${record.date ? `<span>${esc(record.date)}</span>` : ''}</div><p>${summaryHighlight(record.summary || '暂无摘要', record.title, query)}</p><div class="tags">${(record.tags || []).slice(0, 5).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div></article><div class="actions">${favoriteButton(record)}<a class="open" href="${detailHash(record)}">查看详情</a></div></li>`;
}

/* 所有结果入口（分类页、综合检索、离线预览）共用这一个列表生成器。
   分组接口的记录会补齐所属 type，避免后端精简字段后退回到通用卡片。 */
function resultList(type, records, query = '', emptyHtml = '') {
  const typed = (records || []).map(record => record && ({ ...record, ...(type === 'mixed' ? {} : { type }) })).filter(Boolean);
  const items = type === 'news' ? newsSortByCover(typed) : typed;
  const content = items.length ? items.map(record => row(record, query)).join('') : emptyHtml;
  return `<ul class="result-list result-list-${esc(type)}">${content}</ul>`;
}

function hydrateNewsThumbnails(records, renderId) {
  records.forEach(record => {
    if (newsCardCover(record)) return;
    api(`/api/detail/news/${encodeURIComponent(record.id)}`).then(response => {
      if (renderId !== state.renderId) return;
      const article = response && response.data && response.data.article;
      const cover = pickNewsCover(article && article.images);
      if (!cover) return;
      const target = [...document.querySelectorAll('[data-news-thumb]')].find(node => node.dataset.newsThumb === String(record.id));
      if (!target) return;
      // 先在内存中完整预加载；图片失败时保持来源封面，避免图位闪烁或出现裂图。
      const image = new Image();
      image.decoding = 'async';
      image.alt = '';
      image.onload = () => {
        if (renderId !== state.renderId || !target.isConnected) return;
        const card = target.closest('article');
        image.className = 'news-thumb';
        image.loading = 'lazy';
        target.replaceWith(image);
        if (card) { card.classList.remove('no-cover'); card.classList.add('has-cover'); }
      };
      image.src = assetUrl(cover);
    }).catch(() => {});
  });
}

function selected(value, expected) {
  return value === expected ? 'selected' : '';
}

function optionsFor(items, value, label) {
  return (items || []).map(item => {
    const option = typeof item === 'string' ? { value:item, count:0 } : item;
    return `<option value="${esc(option.value)}" ${selected(value, option.value)}>${esc(label ? label(option.value) : option.value)}${option.count ? ` (${option.count.toLocaleString()})` : ''}</option>`;
  }).join('');
}

/* 自定义下拉：选项始终向下展开，避免原生 select 在空间不足时向上弹出。 */
function customSelectHtml(name, label, options, current, format, extra = {}) {
  const all = extra.noAll ? [] : [{ value:'all', text:`${label}：不限`, count:0 }];
  (options || []).forEach(item => {
    const opt = typeof item === 'string' ? { value:item, count:0 } : item;
    all.push({ value:opt.value, text: opt.text || (format ? format(opt.value) : opt.value), count: opt.count || 0 });
  });
  const active = all.find(item => item.value === current) || all[0];
  const isPicked = typeof extra.picked === 'boolean' ? extra.picked : active.value !== 'all';
  const optionsHtml = all.map(item => `<button type="button" role="option" aria-selected="${item.value === active.value}" class="cs-option${item.value === active.value ? ' is-active' : ''}" data-cs-name="${esc(name)}" data-cs-value="${esc(item.value)}">${esc(item.text)}${item.count ? ` <span class="cs-count">${item.count.toLocaleString()}</span>` : ''}</button>`).join('');
  return `<div class="cs${isPicked ? ' is-picked' : ''}" data-cs="${esc(name)}"><button type="button" class="cs-trigger" data-cs-trigger="${esc(name)}" aria-haspopup="listbox" aria-expanded="false">${esc(active.text)}<i class="cs-arrow">▾</i></button><div class="cs-panel" data-cs-panel="${esc(name)}" role="listbox">${optionsHtml}</div></div>`;
}

function scopeControl(type, params) {
  const scope = params.get('scope') || 'all';
  const scopes = type === 'job' ? [['all', '全部字段'], ['title', '岗位名'], ['company', '公司'], ['skills', '技能'], ['city', '城市']]
    : type === 'news' ? [['all', '标题和正文'], ['title', '标题'], ['content', '正文']]
      : type === 'paper' ? [['all', '全部字段'], ['title', '标题'], ['author', '作者'], ['abstract', '摘要'], ['keyword', '关键词'], ['fulltext', '全文']]
        : type === 'model' ? [['all', '全部字段'], ['title', '模型名称'], ['description', '描述'], ['task', '任务'], ['framework', '框架'], ['source', '来源'], ['tag', '标签']]
          : [];
  return scopes.length ? `<select name="scope"${scope !== 'all' ? ' class="filter-picked"' : ''} aria-label="搜索范围">${scopes.map(([value, text]) => `<option value="${value}" ${selected(scope, value)}>${text}</option>`).join('')}</select>` : '';
}

const PAPER_SCOPES = [['all', '全部字段'], ['title', '标题'], ['author', '作者'], ['abstract', '摘要'], ['keyword', '关键词'], ['fulltext', '全文']];
const MODEL_SCOPES = [['all', '全部字段'], ['title', '模型名称'], ['description', '描述'], ['task', '任务'], ['framework', '框架'], ['source', '来源'], ['tag', '标签']];
const NEWS_SCOPES = [['all', '标题和正文'], ['title', '标题'], ['content', '正文']];
const PAPER_OPERATORS = [['and', '必须包含'], ['or', '任一包含'], ['not', '排除']];

function advancedConfig(type) {
  return type === 'model'
    ? { scopes:MODEL_SCOPES, label:'模型', placeholder:'如 text-generation、transformers' }
    : { scopes:PAPER_SCOPES, label:'论文', placeholder:'输入检索词或布尔表达式' };
}

function structuredAdvancedClauses(params, type) {
  const validScopes = new Set(advancedConfig(type).scopes.map(([value]) => value));
  const validOperators = new Set(PAPER_OPERATORS.map(([value]) => value));
  const normalize = value => ({
    operator:validOperators.has(value && value.operator) ? value.operator : 'and',
    scope:validScopes.has(value && value.scope) ? value.scope : (params.get('scope') || 'all'),
    query:String(value && value.query || '').trim()
  });
  const encoded = params.get('advanced');
  if (encoded) {
    try {
      const clauses = JSON.parse(encoded);
      if (Array.isArray(clauses)) return clauses.slice(0, 12).map(normalize);
    } catch {}
  }
  return [['and', 'and_scope'], ['or', 'or_scope'], ['not', 'not_scope']]
    .map(([operator, scope]) => normalize({ operator, scope:params.get(scope), query:params.get(operator) }))
    .filter(clause => clause.query);
}

function structuredAdvancedRow(type, clause = {}) {
  const config = advancedConfig(type);
  const operator = PAPER_OPERATORS.some(([value]) => value === clause.operator) ? clause.operator : 'and';
  const scope = config.scopes.some(([value]) => value === clause.scope) ? clause.scope : 'all';
  return `<div class="paper-advanced-row" data-advanced-clause><select name="advanced_operator"${operator !== 'and' ? ' class="filter-picked"' : ''} aria-label="逻辑关系">${PAPER_OPERATORS.map(([value, text]) => `<option value="${value}" ${selected(operator, value)}>${text}</option>`).join('')}</select><select name="advanced_scope"${scope !== 'all' ? ' class="filter-picked"' : ''} aria-label="检索字段">${config.scopes.map(([value, text]) => `<option value="${value}" ${selected(scope, value)}>${text}</option>`).join('')}</select><input name="advanced_query" value="${esc(clause.query || '')}" aria-label="检索词" placeholder="${config.placeholder}"><button type="button" class="paper-advanced-remove" data-remove-advanced-clause aria-label="删除条件" title="删除条件">×</button></div>`;
}

function advancedSearch(type, params) {
  if (!['paper', 'model', 'news'].includes(type)) return '';
  if (type === 'paper' || type === 'model') {
    const config = advancedConfig(type);
    const clauses = structuredAdvancedClauses(params, type);
    const rows = (clauses.length ? clauses : [{ scope:params.get('scope') || 'all' }]).map(clause => structuredAdvancedRow(type, clause)).join('');
    return `<details class="advanced-search paper-advanced-search" data-advanced-type="${type}"><summary>高级检索</summary><div class="paper-advanced-panel"><div class="paper-advanced-rows" data-advanced-rows>${rows}</div><button type="button" class="secondary paper-advanced-add" data-add-advanced-clause>添加条件</button><small class="advanced-search-hint">可组合多个${config.label}字段，支持“必须包含、任一包含、排除”。</small></div></details>`;
  }
  const term = (name, label, placeholder) => {
    const field = params.get(`${name}_scope`) || params.get('scope') || 'all';
    return `<label class="news-advanced-row"><span>${label}</span><select name="${name}_scope"${field !== 'all' ? ' class="filter-picked"' : ''} aria-label="${label}字段范围">${NEWS_SCOPES.map(([value, text]) => `<option value="${value}" ${selected(field, value)}>${text}</option>`).join('')}</select><input name="${name}" value="${esc(params.get(name) || '')}" placeholder="${placeholder}"></label>`;
  };
  return `<details class="advanced-search news-advanced-search"><summary>高级检索</summary><div class="advanced-grid">${term('and', '必须包含', 'RAG AND multimodal')}${term('or', '任一包含', 'Agent OR assistant')}${term('not', '排除', 'survey NOT benchmark')}</div></details>`;
}

function searchForm(path, config, params) {
  const type = config && Object.keys(TYPE).find(key => TYPE[key] === config);
  const advanced = type ? advancedSearch(type, params) : '';
  const scope = type ? scopeControl(type, params) : '';
  const tools = scope || advanced ? `<div class="search-tools">${scope}${advanced}</div>` : '';
  // 统一检索页把当前类型写进表单，重新搜索时不会丢掉已选的类型。
  const hidden = path === '/search' ? `<input type="hidden" name="type" value="${esc(params.get('type') || 'all')}">` : '';
  return `<form class="search-form search-stack" data-path="${path}" data-type="${type || ''}"><div class="search-row"><span class="glass" aria-hidden="true">⌕</span><input name="q" value="${esc(params.get('q') || '')}" aria-label="搜索${config ? config.label : '全部内容'}" placeholder="${config ? config.placeholder : '搜索岗位、公司、AI论文、模型、资讯'}"><button>搜索</button></div>${hidden}${tools}</form>`;
}

function sourceLabel(value) {
  return ({ boss:'BOSS直聘', bonjour:'Bonjour / 找工地图', '51job':'51job', official:'官方直招' })[value] || value;
}

function directionLabel(value) {
  return value === '其他' ? '其他 AI 相关岗位' : value;
}

function sourceOptions(options = []) {
  const priority = ['51job', 'boss', 'bonjour', 'official'];
  const byValue = new Map(options.map(option => [option.value, option]));
  return [...priority.filter(value => byValue.has(value)).map(value => byValue.get(value)), ...options.filter(option => !priority.includes(option.value))];
}

function sortOptions(type) {
  if (type === 'job') return [{ value:'relevance', text:'按 AI 相关度排序' }, { value:'title', text:'按标题排序' }, { value:'source', text:'按来源排序' }, { value:'time', text:'按时间排序' }];
  if (type === 'company') return [{ value:'activity', text:'按招聘活跃度排序' }, { value:'salary', text:'按薪资中位数排序' }, { value:'name', text:'按名称排序' }];
  if (type === 'news') return [{ value:'time_desc', text:'按发布时间：最新优先' }, { value:'relevance', text:'按相关度排序' }, { value:'time_asc', text:'按发布时间：最早优先' }];
  if (type === 'model') return [{ value:'relevance', text:'按相关度排序' }, { value:'title', text:'按名称排序' }, { value:'time', text:'按更新时间排序' }];
  return [];
}

function resultSort(type, params) {
  const options = sortOptions(type);
  if (!options.length) return '';
  const requested = params.get('sort') || options[0].value;
  // URL 里可能带进非法排序值（例如把资讯的 time_desc 用到岗位上），先归一到合法选项，
  // 否则会出现「灰底却显示默认排序」的错位状态。
  const current = options.some(o => o.value === requested) ? requested : options[0].value;
  // 排序也算一种筛选：默认排序保持白底，切到非默认排序时才给灰底，用户一眼看得出当前排序方式。
  return `<label class="result-sort">排序${customSelectHtml('sort', '排序', options.map(o => ({ value:o.value, text:o.text, count:0 })), current, null, { noAll:true, picked: current !== options[0].value })}</label>`;
}

function listingHeroIcon(type) {
  const icons = {
    job: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>',
    company: '<svg viewBox="0 0 24 24"><path d="M4 20V7l7-3v16M11 20V10l9-3v13M7 10h1M7 14h1M14 12h1M17 12h1M14 16h1M17 16h1"/></svg>',
    paper: '<svg viewBox="0 0 24 24"><path d="M7 3h8l3 3v15H7zM15 3v4h4M10 11h5M10 14h5M10 17h3"/></svg>',
    model: '<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
    news: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/><path d="M3 7V3h4"/></svg>'
  };
  return icons[type] || icons.job;
}

function filterSelect(name, label, options, params, format) {
  const value = params.get(name) || 'all';
  return customSelectHtml(name, label, options, value, format);
}

function filterRow(type, params, facets = {}) {
  if (type === 'job') {
    const experience = [['campus', '应届/在校'], ['under_1', '1 年以内'], ['one_to_three', '1–3 年'], ['three_to_five', '3–5 年'], ['five_to_ten', '5–10 年'], ['unrestricted', '经验不限'], ['unspecified', '未注明']].map(([value, text]) => ({ value, text }));
    const education = [['college', '大专'], ['bachelor', '本科'], ['master', '硕士'], ['doctor', '博士'], ['unrestricted', '学历不限'], ['unspecified', '未注明']].map(([value, text]) => ({ value, text }));
    return `<div class="filter-row">${filterSelect('direction', '方向分类', facets.directions, params, directionLabel)}${filterSelect('source', '来源', sourceOptions(facets.sources), params, sourceLabel)}${filterSelect('city', '工作城市', facets.cities, params)}${filterSelect('experience', '经验要求', experience, params, value => experience.find(item => item.value === value).text)}${filterSelect('education', '学历要求', education, params, value => education.find(item => item.value === value).text)}${filterSelect('job_type', '招聘类型', facets.jobTypes, params)}<button type="button" class="secondary" data-clear-filters>重置筛选</button></div>`;
  }
  if (type === 'company') {
    return `<div class="filter-row">${filterSelect('direction', '招聘方向', facets.directions, params, directionLabel)}${filterSelect('city', '所在城市', facets.cities, params)}${filterSelect('size', '团队规模', facets.sizes, params)}${filterSelect('stage', '发展阶段', facets.stages, params)}<button type="button" class="secondary" data-clear-filters>重置筛选</button></div>`;
  }
  if (type === 'news') {
    return `<div class="filter-row">${filterSelect('category', '内容分类', facets.categories, params)}${filterSelect('source', '来源', facets.sources, params)}${filterSelect('topic', '技术主题', facets.topics, params)}<label class="date-filter${params.get('published_from') ? ' is-picked' : ''}"><input type="date" data-filter="published_from" aria-label="发布时间起"${params.get('published_from') ? ' class="filter-picked"' : ''} value="${esc(params.get('published_from') || '')}"></label><label class="date-filter${params.get('published_to') ? ' is-picked' : ''}"><input type="date" data-filter="published_to" aria-label="发布时间止"${params.get('published_to') ? ' class="filter-picked"' : ''} value="${esc(params.get('published_to') || '')}"></label>${customSelectHtml('published', '时间', [{ value:'unspecified', text:'时间未注明', count:0 }], params.get('published') || 'all')}<button type="button" class="secondary" data-clear-filters>重置筛选</button></div>`;
  }
  return '';
}

function loadFacetFilters(type, params, renderId) {
  const target = $('#facetFilters');
  if (!target) return;
  const draw = facets => { if (renderId === state.renderId && $('#facetFilters')) $('#facetFilters').innerHTML = filterRow(type, params, facets); };
  if (state.facets[type]) return draw(state.facets[type]);
  draw({});
  api(`/api/facets?type=${encodeURIComponent(type)}`).then(data => {
    state.facets[type] = data;
    draw(data);
  }).catch(() => draw({}));
}

function home() {
  const records = type => (DATA.records || []).filter(item => item.type === type);
  const take = (type, count) => records(type).slice(0, count);
  const job = item => `<a class="applied-job" href="#/detail/${item.type}/${item.id}"><span>${esc(item.category || 'AI岗位')}</span><h3 title="${esc(item.title)}">${esc(item.title)}</h3><p>${esc(item.company || '公司未注明')} · ${esc(item.city || '地点未注明')}</p><strong>${esc((item.detail && item.detail.salary) || item.meta || '薪资面议')}</strong></a>`;
  const company = item => {
    const logo = item.detail && item.detail.logo;
    const initial = esc(String(item.title || '企').slice(0, 1));
    // 首页公司卡优先显示真实 logo；首字母色块一直在 DOM 里，logo 缺失或加载失败时自动露出来。
    return `<a class="applied-company" href="#/detail/${item.type}/${item.id}"><b${logo ? ' class="has-logo"' : ''}>${logo ? `<img src="${esc(assetUrl(logo))}" alt="" loading="lazy" decoding="async">` : ''}<span aria-hidden="true">${initial}</span></b><h3>${esc(item.title)}</h3><p>${esc(item.city || '城市未注明')}</p></a>`;
  };
  const news = item => {
    const { initial, tone } = newsSourceMeta(item.source);
    return `<a class="applied-news" href="#/detail/${item.type}/${item.id}"><div class="applied-news-image tone-${tone}" data-home-thumb="${esc(item.id)}" aria-hidden="true">${esc(initial)}</div><h3>${esc(item.title)}</h3><p>${esc(item.summary || '查看最新 AI 行业动态与产品信息。')}</p><small>${esc(item.source || 'AI资讯')} · ${esc(item.date || '')}</small></a>`;
  };
  const research = (type, title) => `<section class="applied-research-column research-${type}"><header><h3>${title}</h3></header>${take(type, 3).map(item => `<a href="#/detail/${item.type}/${item.id}"><b></b><span>${esc(item.title)}</span><i aria-hidden="true">→</i></a>`).join('')}</section>`;
  const catalog = [['job','岗位','/jobs','比较职责与技能要求'],['company','公司','/companies','了解团队与招聘方向'],['paper','论文','/knowledge','查阅研究与技术背景'],['model','模型','/models','探索模型能力与应用'],['news','资讯','/news','补充行业与产品信息']];
  const sectionHead = (title, description, url, action) => `<header><div><h2>${title}</h2><span>${description}</span></div>${url ? `<a href="#${url}">${action}</a>` : ''}</header>`;
  $('#main').innerHTML = `${soyuHero(catalog)}<p class="snapshot-note">数据为历史快照，招聘状态请以来源为准。</p><section class="applied-section applied-jobs" data-topic="job">${sectionHead('发现机会','下一站，去哪儿？','/jobs','浏览全部岗位')}<div class="applied-jobs-grid">${take('job', 5).map(job).join('')}</div></section><section class="applied-section" data-topic="company">${sectionHead('认识团队','看看谁在做有趣的事','/companies','浏览全部公司')}<div class="applied-company-grid">${take('company', 8).map(company).join('')}</div></section><section class="applied-section" data-topic="news">${sectionHead('读点新鲜的','AI 世界里的新动向','/news','浏览全部资讯')}${postAccordion(take('news', 5))}</section><section class="applied-section applied-research">${sectionHead('再往深处看看','论文与模型，一起探索')}<div class="applied-research-grid">${research('paper', '研究论文')}${research('model', '模型资料')}</div><div class="research-links"><a href="#/knowledge">浏览全部论文</a><a href="#/models">浏览全部模型</a></div></section>`;
  mountSiteFooter();
  mountPostAccordion();
  mountSoyuHome(catalog);
  mountHomeFlow();
  hydrateHomeThumbnails(take('news', 5), state.renderId);
}

/* ---- 统一检索页：类型切换条，标签上的数字即该类型的命中条数 ---- */
function unifiedType(params) {
  const requested = params.get('type') || 'all';
  return TYPE[requested] ? requested : 'all';
}

/* 切换类型只改 type 参数，关键词、排序等其余条件原样保留。 */
function unifiedHash(type) {
  const { params } = routeInfo();
  const next = new URLSearchParams(params);
  if (!type || type === 'all') next.delete('type'); else next.set('type', type);
  next.delete('page');
  const query = next.toString();
  return `#/search${query ? `?${query}` : ''}`;
}

function typeSwitch(active, counts) {
  const tab = (key, label) => {
    const isActive = key === active;
    const known = Boolean(counts) && counts[key] !== undefined;
    const total = known ? Number(counts[key]) || 0 : 0;
    const badge = known
      ? `<b class="tab-count">${total.toLocaleString()}</b>`
      : '<b class="tab-count is-loading">···</b>';
    const empty = known && !total;
    return `<a class="type-tab${isActive ? ' is-active' : ''}${empty ? ' is-empty' : ''}" href="${esc(unifiedHash(key))}"${isActive ? ' aria-current="true"' : ''}>${esc(label)}${badge}</a>`;
  };
  return `<nav class="type-switch" aria-label="资源类型切换">${tab('all', '全部')}${Object.entries(TYPE).map(([type, config]) => tab(type, config.label)).join('')}</nav>`;
}

function paintTypeCounts(counts, renderId) {
  const host = $('#typeSwitch');
  if (host && renderId === state.renderId) host.innerHTML = typeSwitch(unifiedType(routeInfo().params), counts);
}

const countsOf = groups => Object.fromEntries(Object.entries(groups).map(([type, group]) => [type, group.total]));

function globalSearch(params, renderId) {
  const query = params.get('q') || '';
  const scoped = unifiedType(params);
  // 选中单一类型时，顶部搜索框带上该类型的检索范围/高级检索，与分类页保持一致。
  const config = scoped === 'all' ? null : TYPE[scoped];
  const embedded = { host: '#globalResults', hero: false, search: false };
  $('#main').innerHTML = `<div class="page-head"><div><h1>综合检索</h1><p>在岗位、公司、论文、模型与资讯之间查找相关资料</p></div></div>${searchForm('/search', config, params)}<div id="typeSwitch">${typeSwitch(scoped, null)}</div><div id="globalResults"></div>`;
  const totalCounts = () => Object.fromEntries(Object.keys(TYPE).map(type => [type, typeTotal(type)]));
  /* 选中单一类型：结果区直接复用分类页骨架（卡片 / 筛选器 / 排序 / 分页同源），
     标签计数仍走 group=1 请求，拿到真实命中数后覆盖入库总量。 */
  if (scoped !== 'all') {
    paintTypeCounts(totalCounts(), renderId);
    listingPage(scoped, params, renderId, embedded);
    if (!query || !isServer()) return;
    api(`/api/search?group=1&q=${encodeURIComponent(query)}`).then(data => {
      if (renderId !== state.renderId) return;
      paintTypeCounts(countsOf(data.groups), renderId);
    }).catch(() => {});
    return;
  }
  if (!query) {
    $('#globalResults').innerHTML = `<div class="search-intro"><strong>从一个关键词开始。</strong><br>先选类型再搜索就只在这一类资源里找；标签上的数字是各类型当前的命中条数。</div>`;
    // 未检索时先给出各类型的入库总量，让用户知道每类大概有多少可检索内容。
    paintTypeCounts(totalCounts(), renderId);
    return;
  }
  $('#globalResults').innerHTML = '<div class="loading">正在检索五类内容…</div>';
  const fallback = groupedFallback(query);
  const paintFallback = () => {
    paintTypeCounts(countsOf(fallback), renderId);
    renderGrouped(query, fallback, renderId);
  };
  if (!isServer()) return paintFallback();
  api(`/api/search?group=1&q=${encodeURIComponent(query)}`).then(data => {
    if (renderId !== state.renderId) return;
    Object.values(data.groups).forEach(group => remember(group.results));
    paintTypeCounts(countsOf(data.groups), renderId);
    renderGrouped(query, data.groups, renderId, data.total);
  }).catch(paintFallback);
}

function groupedFallback(query) {
  return Object.fromEntries(Object.keys(TYPE).map(type => {
    const results = fallbackSearch(type, new URLSearchParams({ q: query }));
    return [type, { total: results.length, results: results.slice(0, 4) }];
  }));
}

/* 分组视图直接调用分类页也在使用的 resultList：岗位薪资、公司 logo、
   资讯封面/来源/日期，以及论文和模型的字段不会因为综合检索而改变。 */
function renderGrouped(query, groups, renderId, total) {
  if (renderId !== state.renderId) return;
  const clusters = Object.entries(TYPE).map(([type, config]) => {
    const group = groups[type] || { total: 0, results: [] };
    if (!group.total) return '';
    return `<section class="search-cluster listing-page theme-${type}" data-result-type="${type}"><div class="cluster-head"><div><h2>${config.label}</h2><span>${group.total.toLocaleString()} 条匹配记录</span></div><a href="#/${config.route}?q=${encodeURIComponent(query)}">在${config.label}中继续查看 →</a></div><div class="listing-results">${resultList(type, group.results, query)}</div></section>`;
  }).join('');
  $('#globalResults').innerHTML = `<div class="result-meta"><span>“${esc(query)}”${total !== undefined ? ` · 共 ${total.toLocaleString()} 条匹配记录` : ''}</span></div>${clusters || '<div class="empty"><strong>没有找到匹配内容</strong>试试使用更短的关键词。</div>'}`;
  const newsItems = groups.news ? newsSortByCover(groups.news.results || []) : [];
  if (newsItems.length) hydrateNewsThumbnails(newsItems, renderId);
}

const PAGE_SIZE = 15;

/* 分页器：窗口页码 + 省略号 + 前后翻页；href 直接写 hash，复用已有的 hashchange 滚动置顶。 */
function pagerHtml(total, page, params) {
  const count = Number(total) || 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages <= 1) return '';
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const { path } = routeInfo();
  const href = target => {
    const next = new URLSearchParams(params);
    if (target <= 1) next.delete('page'); else next.set('page', String(target));
    const query = next.toString();
    return `#${path}${query ? `?${query}` : ''}`;
  };
  const numbers = [...new Set([1, current - 2, current - 1, current, current + 1, current + 2, pages]
    .filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const cells = [];
  let last = 0;
  numbers.forEach(n => {
    if (n - last > 1) cells.push('<span class="pager-gap" aria-hidden="true">…</span>');
    cells.push(n === current
      ? `<span class="pager-btn is-current" aria-current="page">${n}</span>`
      : `<a class="pager-btn" href="${href(n)}" aria-label="第 ${n} 页">${n}</a>`);
    last = n;
  });
  const arrow = (target, label, glyph) => (target >= 1 && target <= pages && target !== current)
    ? `<a class="pager-btn pager-nav" href="${href(target)}" aria-label="${label}">${glyph}</a>`
    : `<span class="pager-btn is-disabled" aria-hidden="true">${glyph}</span>`;
  return `<nav class="pager" aria-label="分页导航">${arrow(current - 1, '上一页', '←')}${cells.join('')}${arrow(current + 1, '下一页', '→')}<span class="pager-info">第 ${current} / ${pages} 页 · 共 ${count.toLocaleString()} 条</span></nav>`;
}

/* 分类页骨架。统一检索页选中单一类型时会复用它（host 指向结果容器、去掉重复的
   hero 与搜索框），保证两处的结果卡片、筛选器、排序和分页完全同源。 */
function listingPage(type, params, renderId, options = {}) {
  const config = TYPE[type];
  const host = options.host || '#main';
  const mount = () => $(host) || $('#main');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const supportsFilters = ['job', 'company', 'news'].includes(type);
  const hero = options.hero === false ? '' : `<section class="listing-hero listing-hero-unified"><div class="listing-hero-copy"><div class="listing-hero-icon icon-${type}" aria-hidden="true">${listingHeroIcon(type)}</div><h1>${config.label}</h1><p>${config.intro}</p></div></section>`;
  const search = options.search === false ? '' : searchForm(`/${config.route}`, config, params);
  const filters = supportsFilters ? `<div class="listing-filters"><div class="filter-title"><strong>筛选条件</strong><button type="button" data-clear-filters>全部重置</button></div><div id="facetFilters">${filterRow(type, params, state.facets[type])}</div></div>` : '';
  const emptyResult = '<li class="empty"><strong>没有找到匹配内容</strong>清除筛选或尝试其他关键词。</li>';
  const highlightQuery = resultHighlightQuery(params, type);
  const pageShell = records => `<div class="listing-page theme-${type}">${hero}${search}<div class="listing-layout">${filters}<section class="listing-results"><div class="result-meta result-toolbar"><span>${params.get('q') ? `“${esc(params.get('q'))}” · ` : ''}共找到 <b>${records.total.toLocaleString()}</b> 条内容</span><div>${resultSort(type, params)}</div></div>${resultList(type, records.items, highlightQuery, emptyResult)}${pagerHtml(records.total, page, params)}</section></div></div>`;
  const previewAll = fallbackSearch(type, params);
  const preview = previewAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  mount().innerHTML = pageShell({ items: preview, total: previewAll.length, live: false });
  loadFacetFilters(type, params, renderId);
  if (!isServer()) return;
  const query = new URLSearchParams(params);
  query.set('type', type);
  query.set('page_size', String(PAGE_SIZE));
  query.set('page', String(page));
  if (type === 'news' && !query.has('sort')) query.set('sort', 'time_desc');
  api(`/api/search?${query}`).then(data => {
    if (renderId !== state.renderId || !mount()) return;
    remember(data.results);
    // 资讯：有封面的靠前，无封面的靠后，组内保持原有时间序
    const items = type === 'news' ? newsSortByCover(data.results) : data.results;
    mount().innerHTML = pageShell({ items, total: data.total, live: true });
    loadFacetFilters(type, params, renderId);
    if (type === 'news') hydrateNewsThumbnails(items, renderId);
  }).catch(() => {});
}

function fact(label, value) {
  return value ? `<div class="job-fact"><b>${label}</b><span>${esc(value)}</span></div>` : '';
}

function external(url, label) {
  const href = externalUrl(url);
  return href ? `<a class="secondary" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : '';
}

function detailJob(record, data) {
  const detail = record.detail || {};
  const company = data.company;
  return `<div class="detail-wrap"><a class="back" href="#/jobs">← 返回岗位</a><header class="detail-hero"><span class="kind">JOB / 职位详情</span><h1>${esc(record.title)}</h1><div class="detail-sub">${esc(record.company || '')} · ${esc(record.city || '')} · ${esc(record.date || '')}</div><div class="detail-actions"><button class="primary" data-favorite="${esc(record.id)}">${state.favorites.has(record.id) ? '取消收藏' : '收藏岗位'}</button>${external(detail.applyUrl || record.url, '查看投递入口')}</div></header><div class="detail-grid"><div class="detail-main"><section class="job-facts">${fact('薪资', detail.salary)}${fact('经验', detail.experience)}${fact('学历', detail.education)}${fact('类型', detail.jobType)}${fact('地点', detail.location || record.city)}</section><section><h2>职位描述</h2><p>${esc(detail.description || record.summary)}</p></section>${detail.responsibilities ? `<section><h2>工作职责</h2><p>${esc(detail.responsibilities)}</p></section>` : ''}${detail.requirements ? `<section><h2>任职要求</h2><p>${esc(detail.requirements)}</p></section>` : ''}${detail.benefits && detail.benefits.length ? `<section><h2>福利与关键词</h2><div class="tags">${detail.benefits.map(item => `<span class="tag">${esc(item)}</span>`).join('')}${(record.tags || []).map(item => `<span class="tag">${esc(item)}</span>`).join('')}</div></section>` : ''}</div><aside class="detail-side"><h2>职位信息</h2><dl><dt>所属方向</dt><dd>${esc(record.category)}</dd><dt>发布来源</dt><dd>${esc(record.source)}</dd></dl>${company ? `<a class="company-link" href="${detailHash(company)}"><span>关联公司</span><strong>${esc(company.title)}</strong><small>${esc(company.summary)}</small></a>` : `<div class="company-link"><span>招聘公司</span><strong>${esc(record.company || '未标注')}</strong></div>`}</aside></div></div>`;
}

function detailCompany(record, data) {
  const detail = record.detail || {};
  const jobs = data.relatedJobs || [];
  const insights = data.companyInsights || {};
  const directions = insights.directions || [];
  const skills = insights.skills || [];
  const salarySamples = Number(insights.salarySamples || 0);
  const salary = (insights.salaryMedian && salarySamples !== 1)
    ? `${Math.round(insights.salaryMedian).toLocaleString()} 元/月`
    : (insights.salaryMedian || salarySamples >= 1) ? '暂无足够薪资样本' : '未注明';
  const companyIdentity = `<div class="company-detail-title">${companyLogo(record)}<div><span class="kind">COMPANY / 公司详情</span><h1>${esc(record.title)}</h1></div></div>`;
  const directionSection = directions.length ? `<section><h2>招聘方向分布</h2><div class="company-breakdown">${directions.map(item => `<div><span>${esc(item.value)}</span><b>${item.count.toLocaleString()}</b></div>`).join('')}</div></section>` : '';
  const aggregateSection = `<section><h2>薪资与技能聚合</h2><div class="company-aggregate"><div><b>岗位月薪中位数</b><strong>${salary}</strong></div><div><b>在招岗位</b><strong>${Number(insights.total || detail.openJobs || 0).toLocaleString()} 个</strong></div></div>${skills.length ? `<div class="tags">${skills.slice(0, 24).map(item => `<span class="tag">${esc(item.value)}${item.count ? ` · ${item.count}` : ''}</span>`).join('')}</div>` : ''}</section>`;
  return `<div class="detail-wrap company-detail-wrap"><a class="back" href="#/companies">← 返回公司</a><header class="detail-hero">${companyIdentity}<div class="detail-sub">${esc(detail.location || record.city)} · ${esc(record.category)} · ${esc(record.source)}</div><div class="detail-actions"><button class="primary" data-favorite="${esc(record.id)}">${state.favorites.has(record.id) ? '取消收藏' : '收藏公司'}</button>${external(detail.website || record.url, '访问官网')}${external(detail.jobWebsite, '外部招聘入口')}</div></header><div class="detail-grid"><div class="detail-main"><section><h2>公司介绍</h2><p>${esc(detail.description || record.summary)}</p></section><section><h2>技术与业务方向</h2><div class="tags">${(detail.techStack || record.tags || []).map(item => `<span class="tag">${esc(item)}</span>`).join('') || '<span class="tag">暂无标注</span>'}</div></section>${directionSection}${aggregateSection}<section><h2>岗位列表 ${insights.total ? `(${Number(insights.total).toLocaleString()})` : jobs.length ? `(${jobs.length})` : ''}</h2>${jobs.length ? `<ul class="related-list">${jobs.map(job => `<li><div><a href="${detailHash(job)}"><h3>${esc(job.title)}</h3></a><p>${esc(job.city)} · ${esc(job.detail && job.detail.salary || job.meta || job.category)}</p></div><a class="open" href="${detailHash(job)}">查看职位</a></li>`).join('')}</ul>` : '<p>暂未找到能够稳定关联的开放岗位。</p>'}</section></div><aside class="detail-side"><h2>基础资料</h2><dl><dt>规模</dt><dd>${esc(detail.size || '未标注')}</dd><dt>发展阶段</dt><dd>${esc(detail.stage || '未标注')}</dd><dt>融资</dt><dd>${esc(detail.funding || '未标注')}</dd><dt>总部/覆盖城市</dt><dd>${esc(detail.location || record.city || '未标注')}</dd><dt>开放岗位</dt><dd>${esc(detail.openJobs || 0)} 个</dd></dl></aside></div></div>`;
}

function paperMetric(label, value) {
  return value ? `<div class="metric"><b>${esc(label)}</b><span>${esc(value)}</span></div>` : '';
}

function detailPaper(record, data) {
  const detail = record.detail || {};
  const paper = data.paper || {};
  const authors = paper.authors && paper.authors.length ? paper.authors : (detail.authors || []).map(name => ({ name, affiliation:'' }));
  const categories = paper.categories && paper.categories.length ? paper.categories : (detail.categories || record.tags || []);
  const abstract = paper.abstract || detail.abstract || record.summary;
  const sections = paper.sections || [];
  const topicTags = [...(paper.keywords || []), ...(paper.methods || []), ...(paper.datasets || [])].filter(Boolean);
  const authorsSection = authors.length ? `<section><h2>作者</h2><ol class="paper-authors">${authors.map(author => `<li><strong>${esc(author.name)}</strong>${author.affiliation ? `<span>${esc(author.affiliation)}</span>` : ''}</li>`).join('')}</ol></section>` : '';
  const resourcesSection = paper.codeLinks && paper.codeLinks.length ? `<section><h2>开源资源</h2><ul class="paper-resource-list">${paper.codeLinks.map(link => `<li><span>${esc(link.platform)}</span><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.url)}</a></li>`).join('')}</ul></section>` : '';
  const fullReading = sections.length ? `<section class="paper-full-reading"><div class="paper-reading-head"><div><div class="news-section-label">原始全文</div><h2>完整论文内容</h2></div><span>${sections.length} 个章节</span></div><div class="paper-sections">${sections.map(section => `<section class="paper-section level-${Math.min(3, Math.max(1, Number(section.level) || 1))}">${section.title ? `<h3>${esc(section.title)}</h3>` : ''}${paragraphs(section.content)}</section>`).join('')}</div></section>` : paper.fullText ? `<section class="paper-full-reading"><div class="paper-reading-head"><div><div class="news-section-label">原始全文</div><h2>完整论文内容</h2></div></div><div class="paper-fulltext">${paragraphs(paper.fullText)}</div></section>` : '';
  const metrics = [
    paperMetric('全文词数', paper.wordCount ? Number(paper.wordCount).toLocaleString() : ''),
    paperMetric('章节', sections.length || ''),
    paperMetric('图表', paper.figures || paper.tables ? `${paper.figures || 0} 图 / ${paper.tables || 0} 表` : ''),
    paperMetric('参考文献', paper.references ? Number(paper.references).toLocaleString() : '')
  ].join('');
  const sideInfo = [
    ['来源', record.source],
    ['文献编号', paper.sourceId],
    ['发表时间', paper.publishedAt || record.date],
    ['更新日期', paper.updatedAt],
    ['研究方向', paper.subfield || detail.task],
    ['语言', paper.language],
    ['DOI', paper.doi],
    ['版本', paper.version ? `v${paper.version}` : ''],
    ['获取方式', paper.openAccess ? '开放获取' : '']
  ].filter(([, value]) => value).map(([label, value]) => `<dt>${esc(label)}</dt><dd>${label === 'DOI' ? esc(value) : esc(value)}</dd>`).join('');
  return `<div class="detail-wrap paper-detail-wrap"><a class="back" href="#/knowledge">← 返回论文知识</a><article class="paper-detail-shell"><header class="detail-hero"><span class="kind">PAPER / 论文详情</span><h1>${esc(record.title)}</h1><div class="detail-sub">${esc(authors.slice(0, 8).map(author => author.name).join(', ') || record.meta)}${record.date ? ` · ${esc(record.date)}` : ''}</div><div class="detail-actions"><button class="primary" data-favorite="${esc(record.id)}">${state.favorites.has(record.id) ? '取消收藏' : '收藏论文'}</button>${external(paper.pdfUrl || detail.pdfUrl, '打开 PDF')}${external(paper.htmlUrl || detail.htmlUrl || record.url, '阅读原文')}</div></header><div class="paper-detail-grid"><main class="paper-reading"><section><div class="news-section-label">摘要</div><div class="paper-abstract">${esc(abstract)}</div></section>${metrics ? `<section class="metrics">${metrics}</section>` : ''}<section><h2>研究领域</h2><div class="tags">${categories.map(item => `<span class="tag">${esc(item)}</span>`).join('')}${topicTags.map(item => `<span class="tag">${esc(item)}</span>`).join('')}</div></section>${paper.comment ? `<section class="paper-note"><h2>作者备注</h2><p>${esc(paper.comment)}</p></section>` : ''}${authorsSection}${resourcesSection}${fullReading}</main><aside class="detail-side paper-side"><h2>论文信息</h2><dl>${sideInfo}</dl></aside></div></article></div>`;
}

function detailModel(record) {
  const detail = record.detail || {};
  return `<div class="detail-wrap"><a class="back" href="#/models">← 返回模型</a><header class="detail-hero"><span class="kind">MODEL / 模型详情</span><h1>${esc(record.title)}</h1><div class="detail-sub">${esc(record.source)} · ${esc(detail.task || record.category)} · ${esc(record.date || '')}</div><div class="detail-actions"><button class="primary" data-favorite="${esc(record.id)}">${state.favorites.has(record.id) ? '取消收藏' : '收藏模型'}</button>${external(record.url, '打开模型主页')}</div></header><div class="detail-grid"><div class="detail-main"><section class="metrics"><div class="metric"><b>下载量</b><span>${detail.downloads ? Number(detail.downloads).toLocaleString() : '未标注'}</span></div><div class="metric"><b>收藏量</b><span>${detail.likes ? Number(detail.likes).toLocaleString() : '未标注'}</span></div><div class="metric"><b>框架</b><span>${esc(detail.framework || '未标注')}</span></div><div class="metric"><b>基础模型</b><span>${esc(detail.baseModel || '未标注')}</span></div></section><section><h2>模型说明</h2><p>${esc(detail.description || detail.abstract || record.summary)}</p></section><section><h2>能力标签</h2><div class="tags">${(record.tags || []).map(item => `<span class="tag">${esc(item)}</span>`).join('')}</div></section></div><aside class="detail-side"><h2>模型信息</h2><dl><dt>语言</dt><dd>${esc(detail.language || '未标注')}</dd><dt>许可证</dt><dd>${esc(detail.license || '未标注')}</dd><dt>来源</dt><dd>${esc(record.source)}</dd></dl></aside></div></div>`;
}

function paragraphs(content) {
  const pieces = String(content || '').split(/\n+/).map(item => item.trim()).filter(Boolean);
  return pieces.map(piece => `<p>${esc(piece)}</p>`).join('');
}

function sanitizeNewsHtml(html) {
  const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
  document.querySelectorAll('script, style, iframe, form, object, embed, base, link, meta').forEach(node => node.remove());
  document.querySelectorAll('*').forEach(node => {
    node.removeAttribute('style');
    node.removeAttribute('class');
    node.removeAttribute('id');
    node.removeAttribute('hidden');
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && !/^(https?:|\/|#)/.test(value))) node.removeAttribute(attribute.name);
    });
  });
  document.querySelectorAll('p').forEach(node => {
    if (!node.textContent.trim() && !node.querySelector('img,video,audio,svg')) node.remove();
  });
  return document.body.innerHTML;
}

// 资讯发布时间：优先取完整时间戳，否则沿用数据里已有的短格式（如「8月7·周五」）
function newsTimeLabel(article, record) {
  const raw = String(article.publishedAt || record.date || '').trim();
  const full = raw.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日T ]*(?:(\d{1,2}):(\d{2}))?/);
  if (full) {
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${full[1]}-${pad(full[2])}-${pad(full[3])}`;
    return full[4] ? `${stamp} ${pad(full[4])}:${full[5]}` : stamp;
  }
  return raw || '时间未标注';
}

// 正文：直接渲染原文 HTML（含配图），拿不到才退回纯文本。
// 列表补取的首图只用于卡片缩略图，详情不额外插入同一张封面。
function newsReading(article, record) {
  const coverFigure = '';
  const html = String(article.contentHtml || '').trim();
  if (html) {
    const clean = sanitizeNewsHtml(html);
    if (/<(p|section|div|img|h[1-6]|ul|ol|table|blockquote)[\s>/]/i.test(clean)) {
      const content = new DOMParser().parseFromString(clean, 'text/html');
      // 懒加载图片：把 data-src / data-original 等回填到 src，确保能正常加载。
      content.querySelectorAll('img[data-src], img[data-original]').forEach(image => {
        if (!image.getAttribute('src') || image.getAttribute('src').startsWith('data:')) {
          const lazySrc = image.getAttribute('data-src') || image.getAttribute('data-original');
          if (lazySrc) image.setAttribute('src', lazySrc);
        }
      });
      content.querySelectorAll('img[src]').forEach(image => {
        const proxied = assetUrl(image.getAttribute('src'));
        if (proxied) image.setAttribute('src', proxied);
      });
      return `${coverFigure}<div class="np-rich">${content.body.innerHTML}</div>`;
    }
  }
  if (article.content) return `${coverFigure}<div class="np-rich np-plain">${paragraphs(article.content)}</div>`;
  return `${coverFigure}<div class="np-rich np-plain"><p>${esc(record.summary || '这条资讯没有留下正文，可通过上方的「阅读原文」查看完整内容。')}</p></div>`;
}

function detailNews(record, data) {
  const article = data.article || {};
  const source = article.sourceName || record.source || '未标注';
  const category = article.category || record.category || '行业动态';
  const origin = externalUrl(article.sourceUrl || record.url);
  const tags = [...new Set([...(article.tags || []), ...(record.tags || [])])].slice(0, 12);
  const entities = [
    ...(article.companies || []).map(item => `公司 · ${item}`),
    ...(article.models || []).map(item => `模型 · ${item}`),
    ...(article.technologies || []).map(item => `技术 · ${item}`)
  ].filter(Boolean).slice(0, 12);
  const chips = [...tags, ...entities];
  return `<div class="np">
    <a class="np-back" href="#/news"><span aria-hidden="true">←</span>返回AI资讯</a>
    <article class="np-article">
      <header class="np-head">
        <div class="np-cat"><i aria-hidden="true"></i>${esc(category)}</div>
        <h1>${esc(record.title)}</h1>
      <div class="np-meta"><b>${esc(source)}</b><span class="np-dot" aria-hidden="true">·</span><time>${esc(newsTimeLabel(article, record))}</time>${origin ? `<a class="np-origin" href="${esc(origin)}" target="_blank" rel="noopener noreferrer">阅读原文 <span aria-hidden="true">↗</span></a>` : ''}</div>
      </header>
      <div class="np-body">${newsReading(article, record)}</div>
    </article>
  </div>`;
}

function fallbackDetail(type, id) {
  const record = state.known.get(id) || previewRecords.find(item => item.type === type && String(item.id) === String(id));
  return record ? { record, relatedJobs: [], company: null, article: null } : null;
}

function relatedContentPanel(items) {
  if (!items || !items.length) return '<section class="related-content"><h2>继续探索</h2><p>当前条目尚无足够依据建立直接关联。可通过下方主题入口继续检索。</p></section>';
  return `<section class="related-content" aria-label="关联内容"><h2>继续探索</h2><p>依据已有数据连接内容；共同主题仅表示标签交集。</p><div class="relation-grid">${items.map(item => `<a class="relation-card" href="#/detail/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}"><small>${esc(TYPE[item.type]?.label || item.type)} · ${esc(item.relation)}</small><h3>${esc(item.title)}</h3><span>关联依据：${item.evidence.map(esc).join('、')}</span></a>`).join('')}</div></section>`;
}

function detailPage(type, id, renderId) {
  $('#main').innerHTML = '<div class="loading">正在读取详情…</div>';
  const draw = data => {
    if (renderId !== state.renderId) return;
    if (!data) { $('#main').innerHTML = '<div class="empty"><strong>找不到该记录</strong><a href="#/search">返回全局搜索</a></div>'; return; }
    const record = data.record;
    remember([record, ...(data.relatedJobs || []), ...(data.company ? [data.company] : [])]);
    const templates = { job: detailJob, company: detailCompany, paper: detailPaper, model: detailModel, news: detailNews };
    const topics = [...new Set((record.tags || []).filter(Boolean))].slice(0, 8);
    const reading = type === 'news' ? (data.article?.contentHtml || data.article?.content) : type === 'paper' ? (data.paper?.fullText || data.paper?.sections?.length) : record.detail?.description;
    const notice = `<div class="content-status">已有数据快照 · ${reading ? '展示本地保存的内容，时效与完整性以来源为准。' : '本地未保存完整正文，以下为摘要或已有资料，可通过来源入口查看。'}</div>`;
    const explore = `<nav class="topic-explore" aria-label="主题探索"><h2>按主题探索五类内容</h2><p>主题搜索用于继续发现内容，不代表已经确认的实体关系。</p><div>${topics.map(t => `<a class="tag" href="#/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('') || `<a class="tag" href="#/search?q=${encodeURIComponent(record.title)}">搜索这个标题</a>`}</div></nav>`;
    $('#main').innerHTML = notice + templates[type](record, data) + relatedContentPanel(data.relatedContent) + explore;
  };
  if (!isServer()) return draw(fallbackDetail(type, id));
  api(`/api/detail/${encodeURIComponent(type)}/${encodeURIComponent(id)}`).then(response => draw(response.data)).catch(() => draw(fallbackDetail(type, id)));
}

function opCount(value) {
  return Number(value || 0).toLocaleString();
}

function opBuckets(items, limit=8) {
  return (Array.isArray(items) ? items : []).filter(item => item && item.value && Number(item.count) > 0).slice(0, limit);
}

function opBarList(items, accent='teal', limit=7) {
  const values = opBuckets(items, limit);
  const max = Math.max(...values.map(item => Number(item.count) || 0), 1);
  return values.length ? `<div class="ops-bars">${values.map(item => `<div class="ops-bar"><div class="ops-bar-label"><span>${esc(item.value)}</span><b>${opCount(item.count)}</b></div><div class="ops-bar-track"><i class="ops-bar-fill ${accent}" style="width:${Math.max(4, Math.round(Number(item.count) / max * 100))}%"></i></div></div>`).join('')}</div>` : '<div class="ops-empty">暂无可聚合字段</div>';
}

function opTrendChart(news, papers) {
  const map = new Map();
  [['资讯', news, '#4f609f'], ['论文', papers, '#a47722']].forEach(([label, list, color]) => (list || []).forEach(item => {
    const month = String(item.value || '');
    if (!month) return;
    if (!map.has(month)) map.set(month, { month, values:{} });
    map.get(month).values[label] = Number(item.count) || 0;
  }));
  const points = [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  if (!points.length) return '<div class="ops-empty">暂无完整日期，无法绘制趋势</div>';
  const width = 760, height = 242, left = 42, right = 18, top = 24, bottom = 42;
  const max = Math.max(...points.flatMap(point => Object.values(point.values)), 1);
  const x = index => left + (points.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (points.length - 1));
  const y = value => top + (height - top - bottom) * (1 - value / max);
  const line = label => points.map((point, index) => `${x(index).toFixed(1)},${y(point.values[label] || 0).toFixed(1)}`).join(' ');
  const grid = [0, .5, 1].map(ratio => { const value = Math.round(max * ratio); const py = y(value); return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}" class="ops-grid-line"/><text x="${left - 9}" y="${py + 4}" text-anchor="end" class="ops-axis">${opCount(value)}</text>`; }).join('');
  const labels = points.map((point, index) => `<text x="${x(index)}" y="${height - 15}" text-anchor="middle" class="ops-axis">${esc(point.month.slice(2))}</text>`).join('');
  const dots = label => points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.values[label] || 0)}" r="3.5" class="ops-dot ${label === '资讯' ? 'news' : 'paper'}"><title>${esc(point.month)} ${label} ${opCount(point.values[label] || 0)}</title></circle>`).join('');
  return `<div class="ops-chart-wrap"><svg class="ops-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="资讯与论文月度趋势">${grid}<polyline points="${line('资讯')}" class="ops-line news"/><polyline points="${line('论文')}" class="ops-line paper"/>${dots('资讯')}${dots('论文')}${labels}</svg><div class="ops-legend"><span><i class="news"></i>资讯</span><span><i class="paper"></i>论文</span><em>近 ${points.length} 个月</em></div></div>`;
}

function opDonut(totals) {
  const entries = [['岗位', totals.jobs, '#087b6e'], ['公司', totals.companies, '#2d61b8'], ['论文', totals.papers, '#a47722'], ['模型', totals.models, '#b76043'], ['资讯', totals.news, '#586397']];
  const total = Math.max(1, Number(totals.indexedRecords) || entries.reduce((sum, [, value]) => sum + Number(value || 0), 0));
  let cursor = 0;
  const stops = entries.map(([, value, color]) => { const start = cursor / total * 360; cursor += Number(value || 0); return `${color} ${start.toFixed(1)}deg ${(cursor / total * 360).toFixed(1)}deg`; }).join(', ');
  return `<div class="ops-donut-row"><div class="ops-donut" style="background:conic-gradient(${stops})"><div><strong>${opCount(total)}</strong><span>条索引</span></div></div><div class="ops-donut-legend">${entries.map(([label, value, color]) => `<div><i style="background:${color}"></i><span>${label}</span><b>${opCount(value)}</b><small>${(Number(value || 0) / total * 100).toFixed(1)}%</small></div>`).join('')}</div></div>`;
}

function operationsFallback() {
  const groups = Object.fromEntries(Object.keys(TYPE).map(type => [type, previewRecords.filter(record => record.type === type)]));
  const bucket = (items, getter) => { const counts = new Map(); items.forEach(item => { const value = getter(item); (Array.isArray(value) ? value : [value]).forEach(raw => { const text = String(raw || '').trim(); if (text) counts.set(text, (counts.get(text) || 0) + 1); }); }); return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count); };
  const month = items => bucket(items, item => String(item.date || '').match(/\d{4}-\d{2}/)?.[0] || '').sort((a, b) => a.value.localeCompare(b.value));
  return { backend:'local', generatedAt:new Date().toISOString(), totals:Object.fromEntries([['indexedRecords', previewRecords.length], ...Object.entries(groups).map(([type, rows]) => [type === 'paper' ? 'papers' : type === 'news' ? 'news' : `${type}s`, rows.length])]), jobs:{ directions:bucket(groups.job, item => item.category), cities:bucket(groups.job, item => item.city), sources:bucket(groups.job, item => item.source), jobTypes:bucket(groups.job, item => item.detail && item.detail.jobType), trend:month(groups.job) }, companies:{ stages:bucket(groups.company, item => item.detail && item.detail.stage), sizes:bucket(groups.company, item => item.detail && item.detail.size), cities:bucket(groups.company, item => item.city) }, papers:{ categories:bucket(groups.paper, item => item.category), trend:month(groups.paper) }, news:{ categories:bucket(groups.news, item => item.category), sources:bucket(groups.news, item => item.source), topics:bucket(groups.news, item => item.tags || []), trend:month(groups.news) }, models:{ categories:bucket(groups.model, item => item.category), sources:bucket(groups.model, item => item.source) } };
}

function operationInsights(data) {
  const totals = data.totals || {};
  const topDirection = opBuckets(data.jobs && data.jobs.directions, 1)[0];
  const topCity = opBuckets(data.jobs && data.jobs.cities, 1)[0];
  const topNewsSource = opBuckets(data.news && data.news.sources, 1)[0];
  const totalJobs = Number(totals.jobs) || 1;
  const totalNews = Number(totals.news) || 1;
  return [
    topDirection ? `岗位需求集中在「${topDirection.value}」，占岗位索引 ${(topDirection.count / totalJobs * 100).toFixed(1)}%。` : '岗位方向字段仍在持续补充。',
    topCity ? `「${topCity.value}」是当前岗位最密集城市，共 ${opCount(topCity.count)} 条，占比 ${(topCity.count / totalJobs * 100).toFixed(1)}%。` : '岗位城市分布暂未形成明显集中。',
    topNewsSource ? `资讯来源中「${topNewsSource.value}」贡献 ${opCount(topNewsSource.count)} 条，占资讯索引 ${(topNewsSource.count / totalNews * 100).toFixed(1)}%。` : '资讯来源字段仍在持续补充。'
  ];
}

function operationsPage(renderId) {
  $('#main').innerHTML = '<div class="loading">正在汇总实时索引…</div>';
  const draw = data => {
    if (renderId !== state.renderId) return;
    const totals = data.totals || {};
    const live = data.backend === 'elasticsearch';
    const insights = operationInsights(data);
    const sourceRows = opBuckets(data.jobs && data.jobs.sources, 5);
    const newsSourceRows = opBuckets(data.news && data.news.sources, 5);
    $('#main').innerHTML = `<div class="ops-page"><header class="ops-head"><div><div class="eyebrow"><b></b>OPERATIONS / INDEX INTELLIGENCE</div><h1>运营概览</h1><p>把五类 AI 数据转成可行动的供给、内容与研究信号。指标来自当前索引聚合，${live ? '实时同步 Elasticsearch' : '当前为本地预览'}。</p></div><div class="ops-head-meta"><span class="ops-live-dot ${live ? 'on' : ''}"></span><span>${live ? '实时索引' : '预览数据'}</span><small>${data.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN', { hour12:false }) : ''}</small></div></header><section class="ops-kpis"><div class="ops-kpi primary"><span>索引总量</span><strong>${opCount(totals.indexedRecords)}</strong><small>五类内容合计</small></div><div class="ops-kpi"><span>岗位</span><strong>${opCount(totals.jobs)}</strong><small>人才需求信号</small></div><div class="ops-kpi"><span>资讯</span><strong>${opCount(totals.news)}</strong><small>行业信息流</small></div><div class="ops-kpi"><span>论文</span><strong>${opCount(totals.papers)}</strong><small>研究知识库</small></div><div class="ops-kpi"><span>模型</span><strong>${opCount(totals.models)}</strong><small>模型与能力条目</small></div></section><div class="ops-grid ops-grid-wide"><section class="ops-panel ops-structure"><div class="ops-panel-head"><div><span class="ops-kicker">CONTENT MIX</span><h2>内容结构</h2></div><span>占比</span></div>${opDonut(totals)}</section><section class="ops-panel ops-trend-panel"><div class="ops-panel-head"><div><span class="ops-kicker">INFORMATION FLOW</span><h2>信息流趋势</h2></div><span>按月聚合</span></div>${opTrendChart(data.news && data.news.trend, data.papers && data.papers.trend)}</section></div><div class="ops-grid"><section class="ops-panel"><div class="ops-panel-head"><div><span class="ops-kicker">TALENT SUPPLY</span><h2>岗位方向</h2></div><a href="#/jobs">查看岗位 →</a></div>${opBarList(data.jobs && data.jobs.directions, 'teal', 8)}</section><section class="ops-panel"><div class="ops-panel-head"><div><span class="ops-kicker">GEOGRAPHY</span><h2>人才供给城市</h2></div><span>岗位数量</span></div>${opBarList(data.jobs && data.jobs.cities, 'blue', 8)}</section><section class="ops-panel"><div class="ops-panel-head"><div><span class="ops-kicker">RESEARCH MAP</span><h2>论文主题</h2></div><a href="#/knowledge">进入论文 →</a></div>${opBarList((data.papers && (data.papers.subfields || data.papers.categories)), 'gold', 7)}</section></div><div class="ops-grid"><section class="ops-panel"><div class="ops-panel-head"><div><span class="ops-kicker">CHANNEL QUALITY</span><h2>岗位来源</h2></div><a href="#/jobs">筛选来源 →</a></div>${opBarList(sourceRows, 'teal', 6)}</section><section class="ops-panel"><div class="ops-panel-head"><div><span class="ops-kicker">EDITORIAL CHANNELS</span><h2>资讯来源</h2></div><a href="#/news">浏览资讯 →</a></div>${opBarList(newsSourceRows, 'indigo', 6)}</section><section class="ops-panel ops-insights"><div class="ops-panel-head"><div><span class="ops-kicker">OBSERVATIONS</span><h2>运营观察</h2></div><span>数据推导</span></div><ul>${insights.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section></div></div>`;
  };
  if (!isServer()) return draw(operationsFallback());
  api('/api/overview').then(data => draw(data)).catch(() => draw(operationsFallback()));
}

function indexPage() {
  const total = Object.values(DATA.sources || {}).reduce((sum, source) => sum + source.count, 0);
  const isElastic = state.indexBackend === 'elasticsearch';
  const rows = Object.entries(TYPE).map(([type, config]) => `<li class="result"><article><span class="kind">${config.label.toUpperCase()}</span><h3>${esc(DATA.sources[type] && DATA.sources[type].file || '')}</h3><div class="meta"><span>${typeTotal(type).toLocaleString()} 条原始记录</span><span>摘要索引与详情适配已完成</span></div><p>列表搜索走全量摘要索引；详情页会按内容类型加载结构化字段，资讯会按需读取原始文章正文。</p></article><a class="open" href="#/${config.route}">进入${config.label}</a></li>`).join('');
  $('#main').innerHTML = `<div class="page-head"><div><h1>索引状态</h1><p>五类数据已完成字段规范化、全文检索与类型化详情适配</p></div><span class="page-total">${total.toLocaleString()} 条记录</span></div><section class="detail-hero"><span class="kind">INDEX / ${isElastic ? 'ELASTICSEARCH LIVE' : 'LOCAL FALLBACK'}</span><h1>${isElastic ? 'Elasticsearch 实时索引已连接' : '本地搜索索引已就绪'}</h1><div class="detail-sub">浏览器仅加载轻量预览；服务会按内容类型查询完整列表、公司职位关联、新闻正文与论文原文。</div></section><ul class="result-list">${rows}</ul>`;
}

function favoritesPage(params = new URLSearchParams()) {
  const results = [...state.favorites].map(id => state.known.get(id)).filter(Boolean);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(params.get('page')) || 1), pages);
  const items = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const emptyResult = '<li class="empty"><strong>还没有收藏内容</strong>在任何记录或详情页点击星标即可收藏。</li>';
  $('#main').innerHTML = `<div class="page-head"><div><h1>我的收藏</h1><p>收藏的记录保存在当前浏览器中</p></div><span class="page-total">${state.favorites.size} 条</span></div>${favoriteCarousel(items)}<section class="listing-page favorites-listing">${items.length ? '<h2>收藏清单</h2>' : ''}<div class="listing-results">${resultList('mixed', items, '', emptyResult)}${pagerHtml(results.length, current, params)}</div></section>`;
  mountFavoriteCarousel(items);
  hydrateHomeThumbnails(items.filter(record => record.type === 'news'), state.renderId);
  const newsItems = items.filter(record => record.type === 'news');
  if (newsItems.length) hydrateNewsThumbnails(newsItems, state.renderId);
}

function render() {
  disposeHomeFlow();
  const renderId = ++state.renderId;
  mountSiteFooter();
  const { path, params } = routeInfo();
  if (path.startsWith('/detail/')) {
    const [, , type, id] = path.split('/');
    activeRoute(TYPE[type] && TYPE[type].route);
    detailPage(type, decodeURIComponent(id || ''), renderId);
    return;
  }
  const route = path.slice(1) || 'home';
  activeRoute(route);
  if (route === 'home') return home();
  if (route === 'operations') return toHash('/');
  if (route === 'search') return globalSearch(params, renderId);
  if (route === 'index') return indexPage();
  if (route === 'favorites') return favoritesPage(params);
  const type = routeToType[route];
  if (type) return listingPage(type, params, renderId);
  home();
}

function updateFilter(filter, value) {
  const { path, params } = routeInfo();
  if (!value || value === 'all') params.delete(filter);
  else params.set(filter, value);
  if ((filter === 'published_from' || filter === 'published_to') && value) params.delete('published');
  params.delete('page');
  toHash(path, params);
}

document.addEventListener('submit', event => {
  const form = event.target.closest('.search-form');
  if (!form) return;
  event.preventDefault();
  const extras = {};
  const formData = new FormData(form);
  if (['paper', 'model'].includes(form.dataset.type)) {
    const clauses = formData.getAll('advanced_query').map((query, index) => ({
      operator:formData.getAll('advanced_operator')[index] || 'and',
      scope:formData.getAll('advanced_scope')[index] || 'all',
      query:String(query).trim()
    })).filter(clause => clause.query);
    if (clauses.length) extras.advanced = JSON.stringify(clauses);
  }
  formData.forEach((value, key) => {
    if (key !== 'q' && !key.startsWith('advanced_')) extras[key] = String(value);
  });
  setSearch(form.dataset.path, form.elements.q.value, extras);
});

document.addEventListener('change', event => {
  if (event.target.matches('[data-filter]')) updateFilter(event.target.dataset.filter, event.target.value);
});

/* 自定义下拉交互：点击 trigger 展开/收起，点击 option 选中并关闭，点击外部收起。 */
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-cs-trigger]');
  if (trigger) {
    const cs = trigger.closest('.cs');
    const wasOpen = cs.classList.contains('is-open');
    document.querySelectorAll('.cs.is-open').forEach(el => { el.classList.remove('is-open'); el.querySelector('.cs-trigger')?.setAttribute('aria-expanded', 'false'); });
    if (!wasOpen) { cs.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); }
    event.stopPropagation();
    return;
  }
  const option = event.target.closest('[data-cs-value]');
  if (option) {
    updateFilter(option.dataset.csName, option.dataset.csValue);
    return;
  }
  document.querySelectorAll('.cs.is-open').forEach(el => { el.classList.remove('is-open'); el.querySelector('.cs-trigger')?.setAttribute('aria-expanded', 'false'); });
});

/* 自定义下拉的键盘操作：↑↓ 展开并在选项间移动，Esc 收起并把焦点还给触发按钮。 */
function csClosePanel(cs, focusTrigger) {
  cs.classList.remove('is-open');
  const trigger = cs.querySelector('.cs-trigger');
  if (trigger) { trigger.setAttribute('aria-expanded', 'false'); if (focusTrigger) trigger.focus(); }
}
document.addEventListener('keydown', event => {
  const key = event.key;
  if (!['Escape', 'ArrowDown', 'ArrowUp'].includes(key)) return;
  const openPanel = document.querySelector('.cs.is-open');
  if (key === 'Escape' && openPanel) { event.preventDefault(); csClosePanel(openPanel, true); return; }
  const trigger = event.target.closest ? event.target.closest('[data-cs-trigger]') : null;
  if (trigger) {
    event.preventDefault();
    const cs = trigger.closest('.cs');
    if (!cs.classList.contains('is-open')) {
      document.querySelectorAll('.cs.is-open').forEach(el => csClosePanel(el, false));
      cs.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    const opts = [...cs.querySelectorAll('.cs-option')];
    (opts.find(o => o.classList.contains('is-active')) || opts[0])?.focus();
    return;
  }
  const option = event.target.closest ? event.target.closest('[data-cs-value]') : null;
  if (!option) return;
  if (key === 'Escape') { event.preventDefault(); csClosePanel(option.closest('.cs'), true); return; }
  event.preventDefault();
  const opts = [...option.closest('.cs-panel').querySelectorAll('.cs-option')];
  const i = opts.indexOf(option);
  opts[key === 'ArrowDown' ? (i + 1) % opts.length : (i - 1 + opts.length) % opts.length].focus();
});

document.addEventListener('click', event => {
  const addAdvancedClause = event.target.closest('[data-add-advanced-clause]');
  if (addAdvancedClause) {
    const search = addAdvancedClause.closest('.paper-advanced-search');
    const rows = search.querySelector('[data-advanced-rows]');
    if (rows.querySelectorAll('[data-advanced-clause]').length >= 12) {
      showToast('最多添加 12 条检索条件');
      return;
    }
    rows.insertAdjacentHTML('beforeend', structuredAdvancedRow(search.dataset.advancedType || 'paper'));
    return;
  }
  const removeAdvancedClause = event.target.closest('[data-remove-advanced-clause]');
  if (removeAdvancedClause) {
    const row = removeAdvancedClause.closest('[data-advanced-clause]');
    const rows = row.parentElement;
    if (rows.querySelectorAll('[data-advanced-clause]').length > 1) row.remove();
    else {
      row.querySelector('[name="advanced_operator"]').value = 'and';
      row.querySelector('[name="advanced_scope"]').value = 'all';
      row.querySelector('[name="advanced_query"]').value = '';
    }
    return;
  }
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) toggleFavorite(favorite.dataset.favorite);
  const quick = event.target.closest('[data-quick]');
  if (quick) setSearch('/jobs', quick.dataset.quick);
  if (event.target.closest('#favorites')) toHash('/favorites');
  if (event.target.closest('[data-clear-filters]')) {
    const { path, params } = routeInfo();
    const preserved = new URLSearchParams();
    ['q', 'scope', 'advanced', 'and', 'and_scope', 'or', 'or_scope', 'not', 'not_scope'].forEach(key => { if (params.get(key)) preserved.set(key, params.get(key)); });
    toHash(path, preserved);
  }
});

$('#headSearch').addEventListener('submit', event => {
  event.preventDefault();
  setSearch('/search', $('#headInput').value);
});

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

// 配图全部来自外链：取不到时按位置退回占位块，避免留下浏览器裂图图标
document.addEventListener('error', event => {
  const image = event.target;
  if (!image || image.tagName !== 'IMG') return;
  if (image.classList.contains('np-cover') || image.closest('.np-rich')) { image.classList.add('np-img-failed'); return; }
  if (image.classList.contains('news-thumb')) {
    const card = image.closest('article');
    const sourceEl = card && card.querySelector('.news-source-name');
    const { initial, tone } = newsSourceMeta(sourceEl ? sourceEl.textContent : '');
    const span = document.createElement('span');
    span.className = `news-thumb news-thumb-empty tone-${tone}`;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = initial;
    image.replaceWith(span);
    if (card) { card.classList.remove('has-cover'); card.classList.add('no-cover'); }
    return;
  }
  if (image.classList.contains('company-logo')) {
    const scope = image.closest('article, li, .company-detail-title, .detail-hero');
    const heading = scope && scope.querySelector('h1, h3');
    const span = document.createElement('span');
    span.className = 'company-logo company-logo-fallback';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = String((heading && heading.textContent) || '').trim().slice(0, 1) || '企';
    image.replaceWith(span);
    return;
  }
  const homeMark = image.closest('.applied-company b');
  if (homeMark) { homeMark.classList.remove('has-logo'); image.remove(); return; }
  const homeBox = image.closest('.applied-news-image');
  if (homeBox) {
    const card = homeBox.closest('.applied-news');
    const small = card && card.querySelector('small');
    const sourceText = small ? small.textContent.split('·')[0].trim() : '';
    const { initial, tone } = newsSourceMeta(sourceText);
    homeBox.classList.remove('has-img');
    homeBox.className = `applied-news-image tone-${tone}`;
    homeBox.textContent = initial;
  }
}, true);
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#headInput').focus(); }
  if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#headInput').focus(); }
});

function syncIndexStatus() {
  if (!isServer()) return;
  api('/api/index').then(payload => {
    if (!payload || !payload.sources) return;
    Object.entries(payload.sources).forEach(([type, source]) => {
      DATA.sources[type] = { ...(DATA.sources[type] || {}), ...source };
    });
    state.indexBackend = payload.backend || 'local';
    $('#indexStatus').textContent = state.indexBackend === 'elasticsearch' ? 'Elasticsearch · 已连接' : '本地索引 · 已就绪';
    const total = Object.values(payload.sources).reduce((sum, source) => sum + (Number(source.count) || 0), 0);
    $('#indexSummary').textContent = `五类内容 · ${total.toLocaleString()} 条${state.indexBackend === 'elasticsearch' ? '实时' : '摘要'}记录`;
    render();
  }).catch(() => { $('#indexStatus').textContent = '本地索引 · 已就绪'; });
}

/* ---- 首页页脚：挂在 body 层，才能真正左右铺满视口 ---- */
function siteFooterHtml() {
  const column = (title, links) => `<div class="footer-col"><h4>${title}</h4>${links.map(([text, href]) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`).join('')}</div>`;
  return `<footer class="applied-footer" id="siteFooter"><div><b><img src="assets/soyu-logo.svg" alt="" width="36" height="36">索yu</b><span>让好奇有个去处。</span></div><nav>${column('岗位来源', [['BOSS直聘', 'https://www.zhipin.com/'], ['前程无忧', 'https://www.51job.com/'], ['Bonjour 找工地图', 'https://bonjour.bio/jobs-mapping']])}${column('资讯来源', [['量子位', 'https://www.qbitai.com/'], ['智东西', 'https://zhidx.com/'], ['机器之心', 'https://www.jiqizhixin.com/'], ['AI工具集', 'https://ai-bot.cn/']])}${column('论文与模型', [['arXiv', 'https://arxiv.org/'], ['Hugging Face', 'https://huggingface.co/']])}</nav></footer>`;
}

function mountSiteFooter() {
  if (document.getElementById('siteFooter')) return;
  const holder = document.createElement('div');
  holder.innerHTML = siteFooterHtml();
  const footer = holder.firstElementChild;
  const layout = document.querySelector('.layout');
  if (layout) layout.after(footer);
  else document.body.appendChild(footer);
}

function unmountSiteFooter() {
  const footer = document.getElementById('siteFooter');
  if (footer) footer.remove();
}

/* ---- 首页资讯封面：预览数据没有 cover，逐条向详情接口要首图 ---- */
function pickNewsCover(images) {
  const list = (images || []).map(item => String(item || '').trim()).filter(url => url.indexOf('http') === 0 || url.indexOf('//') === 0);
  // 公众号头像（qlogo.cn）当封面会糊成一团色块，优先跳过。
  return list.filter(url => url.indexOf('qlogo.cn') === -1)[0] || list[0] || '';
}

function paintHomeThumb(node, cover, renderId) {
  const url = assetUrl(cover);
  if (!url) return;
  const image = new Image();
  image.decoding = 'async';
  image.alt = '';
  // 预加载成功再替换，失败就保留原来的 AI 渐变占位块。
  image.onload = () => {
    if (renderId !== state.renderId || !node.isConnected) return;
    node.textContent = '';
    node.classList.add('has-img');
    node.appendChild(image);
  };
  image.src = url;
}

function hydrateHomeThumbnails(records, renderId) {
  (records || []).forEach(record => {
    const node = document.querySelector('[data-home-thumb="' + record.id + '"]');
    if (!node) return;
    const inline = newsCardCover(record);
    if (inline) { paintHomeThumb(node, inline, renderId); return; }
    api('/api/detail/news/' + encodeURIComponent(record.id)).then(response => {
      if (renderId !== state.renderId) return;
      const article = response && response.data && response.data.article;
      const cover = pickNewsCover(article && article.images);
      if (cover) paintHomeThumb(node, cover, renderId);
    }).catch(() => {});
  });
}

render();
syncIndexStatus();
