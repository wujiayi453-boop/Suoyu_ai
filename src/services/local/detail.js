/**
 * detail.js (local) - local record detail assembly.
 * Extracted verbatim from the legacy server.js lines L158-L172.
 */
const { loadNewsArticle, loadPaperArticle } = require('../fulltext/offset-reader');
const { byTypeAndId, companyLogos, records, slim } = require('./data-index');
const { parseSalary } = require('./search');
const { completeRecord } = require('../fulltext/record-reader');

/**
 * 本地后端过去只把 30 条相关岗位丢给前端，companyInsights 一直是 null，
 * 于是公司详情页的「岗位月薪中位数」永远显示「未注明」——哪怕它明明有几十条带薪资的岗位。
 * 这里按 ES 版 relatedElasticJobs() 的返回结构补齐：directions / skills / salaryMedian / total。
 */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function jobsOfCompany(record) {
  return records.filter(job => job.type === 'job' && (job.companyId === record.id || (!job.companyId && job.company === record.title)));
}

function countPairs(map) {
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), 'zh-CN'));
}

function companyInsightsFor(record) {
  const jobs = jobsOfCompany(record);
  const directions = new Map();
  const skills = new Map();
  const salaries = [];
  jobs.forEach(job => {
    const direction = String(job.category || '').trim();
    if (direction) directions.set(direction, (directions.get(direction) || 0) + 1);
    (Array.isArray(job.tags) ? job.tags : []).forEach(tag => {
      const value = String(tag || '').trim();
      if (value) skills.set(value, (skills.get(value) || 0) + 1);
    });
    const monthly = parseSalary(job.detail && job.detail.salary);
    if (monthly) salaries.push(monthly);
  });
  return {
    directions: countPairs(directions).slice(0, 20),
    skills: countPairs(skills).slice(0, 30),
    salaryMedian: median(salaries),
    // 样本量交给前端判断：只有 1 条时中位数就是那一条，说出来反而误导。
    salarySamples: salaries.length,
    total: jobs.length
  };
}

function localDetail(type, id) {
  const indexed = byTypeAndId.get(`${type}:${id}`);
  if (!indexed) return null;
  const record = completeRecord(indexed);
  const data = { record, relatedJobs:[], company:null, article:null, paper:null, companyInsights:null };
  if (type === 'company') {
    // 摘要索引里没存 logo，详情页得单独从 companies_clean.jsonl 的映射里补回来，
    // 否则公司详情头部只有首字母色块。
    const logo = (record.detail && record.detail.logo) || companyLogos.get(String(record.id));
    if (logo) data.record = { ...record, detail: { ...(record.detail || {}), logo } };
    data.relatedJobs = jobsOfCompany(record).slice(0, 30).map(slim);
    data.companyInsights = companyInsightsFor(record);
  }
  if (type === 'job' && record.companyId) {
    const company = byTypeAndId.get(`company:${record.companyId}`);
    if (company) data.company = slim(company);
  }
  if (type === 'news') data.article = loadNewsArticle(id);
  if (type === 'paper') data.paper = loadPaperArticle(id);
  return data;
}

module.exports = { localDetail, companyInsightsFor, jobsOfCompany };
