/**
 * normalize.js - hit -> unified record normalisation.
 * Extracted verbatim from the legacy server.js lines L431-L475.
 */
const { idFields } = require('../../config/constants');
const { asList, asText, firstText, unique } = require('../../utils/text');
const { newsCover } = require('../../utils/news-cover');

function normalizeElasticHit(type, hit) {
  const source = hit._source || {};
  const extra = source.extra || {};
  const id = firstText(source[idFields[type]], source.id, hit._id);
  if (type === 'job') {
    const company = firstText(source.company_display, source.company);
    return {
      type, id, title:firstText(source.title, '未命名岗位'), summary:firstText(source.summary, source.jd, source.requirements), company,
      companyId:asText(source.company_id), sourceJobId:asText(source.source_job_id), city:firstText(source.city, source.location), category:firstText(source.direction_label, source.direction, source.job_type),
      tags:unique([...asList(source.skills), ...asList(source.welfare), asText(source.industry)]),
      source:asText(source.source), date:firstText(source.published_at, source.collected_at, source.updated_at), url:firstText(source.apply_url, source.job_link),
      meta:[asText(source.salary), asText(source.experience), asText(source.education)].filter(Boolean).join(' · '),
      detail:{ salary:asText(source.salary), experience:asText(source.experience), education:asText(source.education), jobType:asText(source.job_type), location:firstText(source.location, source.city), description:firstText(source.jd, source.summary), responsibilities:asText(source.responsibilities), requirements:asText(source.requirements), benefits:unique([...asList(source.benefits), ...asList(source.welfare)]), applyUrl:firstText(source.apply_url, source.job_link) }
    };
  }
  if (type === 'company') {
    return {
      type, id, title:firstText(source.name, source.name_legal, '未命名公司'), summary:firstText(source.oneliner, source.description), city:firstText(source.city_hq, source.city, source.location),
      category:firstText(source.industry, source.business_direction, source.company_type), tags:unique([...asList(source.tech_stack), ...asList(source.job_skills), ...asList(source.business_direction), asText(source.industry)]),
      source:asText(source.provenance), date:'', url:firstText(source.website, source.job_website), meta:[asText(source.company_size), asText(source.stage), asText(source.funding)].filter(Boolean).join(' · '),
      detail:{ location:firstText(source.location, source.city_hq, source.city), website:asText(source.website), jobWebsite:asText(source.job_website), logo:asText(source.logo), description:firstText(source.description, source.oneliner), techStack:unique([...asList(source.tech_stack), ...asList(source.business_direction), asText(source.industry)]), size:asText(source.company_size), stage:asText(source.stage), funding:asText(source.funding), openJobs:source.active_job_count || source.job_count || 0, jobIds:asList(source.job_ids), jobDirections:source.job_directions || {} }
    };
  }
  if (type === 'paper') {
    return {
      type, id, title:firstText(source.title, source.source_id, '未命名论文'), summary:firstText(source.abstract, source.description), city:'', company:'',
      category:firstText(extra.ai_subfield, asList(source.categories)[0]), tags:unique([...asList(source.categories), ...asList(source.tags), ...asList(extra.ai_keywords), ...asList(extra.ai_methods)]),
      source:firstText(source.source, 'arxiv'), date:firstText(source.published_date, source.created_date), url:firstText(source.html_url, source.url), meta:firstText(extra.ai_subfield),
      detail:{ abstract:firstText(source.abstract, source.description), authors:asList(source.authors), categories:asList(source.categories), pdfUrl:asText(source.pdf_url), htmlUrl:firstText(source.html_url, source.url), task:asText(extra.ai_subfield) }
    };
  }
  if (type === 'model') {
    return {
      type, id, title:firstText(source.title, source.source_id, '未命名模型'), summary:firstText(source.description, source.abstract, extra.model_card), city:'', company:'',
      category:firstText(extra.task_type, extra.pipeline_tag, extra.ai_subfield, asList(source.categories)[0]), tags:unique([...asList(source.categories), ...asList(source.tags), ...asList(extra.ai_keywords), ...asList(extra.ai_methods), asText(extra.framework)]),
      source:firstText(source.source, source.data_source), date:firstText(source.updated_date, source.published_date, source.created_date), url:firstText(source.html_url, source.url), meta:firstText(extra.framework, extra.pipeline_tag),
      detail:{ description:firstText(source.description, source.abstract, extra.model_card), abstract:asText(source.abstract), downloads:extra.downloads, likes:extra.likes, framework:firstText(extra.framework, extra.library_name), baseModel:asText(extra.base_model), task:firstText(extra.task_type, extra.pipeline_tag, extra.ai_subfield), language:asText(source.language), license:asText(source.license) }
    };
  }
  return {
    type, id, title:firstText(source.title, '未命名资讯'), summary:firstText(source.summary, source.content), city:'', company:asList(source.companies)[0] || '',
    category:asText(source.category), tags:unique([...asList(source.tags), ...asList(source.keywords), ...asList(source.ai_domains), ...asList(source.technologies)]),
    source:firstText(source.source_name, source.source, source.source_site), date:firstText(source.published_at, source.crawled_at), url:asText(source.source_url), meta:asText(source.category), cover:newsCover(source), detail:{}
  };
}

module.exports = { normalizeElasticHit };
