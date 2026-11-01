/**
 * constants.js - field maps, facet option lists, sort weights.
 * Extracted verbatim from the legacy server.js lines L174-L210.
 */

const idFields = { paper:'id', company:'company_id', job:'job_id', model:'id', news:'news_id' };
const sourceFields = { paper:'source', company:'sources', job:'source', model:'source', news:'source' };
const searchFields = {
  paper: ['title^5', 'abstract^3', 'description^2', 'authors^2', 'authors.name^2', 'tags^2', 'keywords^2', 'extra.ai_keywords^2', 'extra.ai_methods', 'extra.full_text'],
  company: ['name^5', 'oneliner^3', 'description^2', 'tech_stack^2', 'job_skills', 'industry', 'business_direction'],
  job: ['title^5', 'company^3', 'company_display^3', 'skills^3', 'summary^2', 'jd', 'requirements', 'responsibilities', 'direction_label'],
  model: ['title^5', 'abstract^3', 'description^2', 'authors.name^2', 'tags^2', 'extra.ai_keywords^2', 'extra.ai_methods'],
  news: ['title^5', 'summary^3', 'content^2', 'tags^2', 'keywords^2', 'companies^2', 'models^2', 'technologies^2']
};
const jobDirections = ['底层核心研发', '工程落地运维', 'AI产品与解决方案', '行业垂直AI应用', 'AIGC内容创意', '零基础入门岗', '商务与配套职能', '其他'];
const companyDirectionCodes = {
  '底层核心研发':'core_research', '工程落地运维':'engineering_ops', 'AI产品与解决方案':'product_solution', '行业垂直AI应用':'vertical_industry', 'AIGC内容创意':'aigc_creative', '零基础入门岗':'entry_level', '商务与配套职能':'business_support', '其他':'other'
};
const jobExperienceOptions = {
  campus:['应届生', '应届', '在校', '校招', '毕业生'],
  under_1:['1年以内', '一年以内', '1年以下'],
  one_to_three:['1-3年', '1~3年', '1至3年'],
  three_to_five:['3-5年', '3~5年', '3至5年'],
  five_to_ten:['5-10年', '5~10年', '5至10年'],
  unrestricted:['经验不限', '不限'],
  unspecified:[]
};
const jobEducationOptions = {
  college:['大专'], bachelor:['本科'], master:['硕士'], doctor:['博士'], unrestricted:['学历不限', '不限'], unspecified:[]
};
const newsCategories = ['行业动态', '技术进展', '应用落地', '工具与生态', '学习资源', '观点与访谈', '风险与合规', '人才与招聘', '每日AI资讯', 'AI百科', 'AI专栏', 'AI问答'];
const newsTopics = ['多模态', '生成式AI', '机器学习', '深度学习', 'RAG'];
/**
 * AI 相关度分级：数值越大代表「这个岗位越真的是 AI 岗位」。
 * 数据里 6017 条岗位全部 is_ai_relevant=true，所以真正能区分强弱的是
 * ai_evidence_level：strong 是标题+JD 双命中，adjacent_* 只是方向/标题擦边。
 * 离线索引与 ES 的 painless 脚本共用同一套分值，避免两个后端排序不一致。
 */
const aiEvidenceRank = {
  strong: 4,
  weak_title_and_jd: 3,
  weak_multi: 3,
  title_role: 2,
  curated_company_technical: 2,
  adjacent_title: 1,
  adjacent_direction: 1
};

const evidenceSort = {
  _script:{
    type:'number',
    order:'desc',
    script:{
      lang:'painless',
      source:"if (doc['ai_evidence_level'].size() == 0) return 0; def level = doc['ai_evidence_level'].value; if (level == 'strong') return 4; if (level == 'weak_title_and_jd' || level == 'weak_multi') return 3; if (level == 'title_role' || level == 'curated_company_technical') return 2; if (level == 'adjacent_title' || level == 'adjacent_direction') return 1; return 0;"
    }
  }
};

module.exports = { idFields, sourceFields, searchFields, jobDirections, companyDirectionCodes, jobExperienceOptions, jobEducationOptions, newsCategories, newsTopics, aiEvidenceRank, evidenceSort };
