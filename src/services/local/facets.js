/**
 * facets.js (local) - facet options computed from the in-memory index so the
 * filter dropdowns are fully populated without Elasticsearch.
 */
const { companyDirectionCodes, jobDirections, newsCategories, newsTopics } = require('../../config/constants');
const { records } = require('./data-index');

const cache = new Map();

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function counter() {
  return new Map();
}

function bump(map, value, amount = 1) {
  const key = String(value || '').trim();
  if (key) map.set(key, (map.get(key) || 0) + amount);
}

function topValues(map, limit) {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN'))
    .slice(0, limit);
}

function orderedValues(map, order) {
  return order.map(value => ({ value, count: map.get(value) || 0 }));
}

function cityTokens(record) {
  const detail = record.detail || {};
  return new Set([record.city, ...asList(detail.jobCities), ...String(detail.location || '').split(/[\/、]/)]
    .map(item => String(item || '').trim()).filter(item => item && item.length <= 12));
}

function compute(type) {
  if (type === 'job') {
    const directions = counter(); const sources = counter(); const cities = counter(); const jobTypes = counter();
    records.forEach(record => {
      if (record.type !== 'job') return;
      bump(directions, record.category);
      bump(sources, record.source);
      bump(cities, record.city);
      bump(jobTypes, record.detail && record.detail.jobType);
    });
    return {
      directions: orderedValues(directions, jobDirections),
      sources: topValues(sources, 20),
      cities: topValues(cities, 50),
      jobTypes: topValues(jobTypes, 20),
      sizes: [], stages: [], categories: [], topics: []
    };
  }
  if (type === 'company') {
    const directions = counter(); const cities = counter(); const sizes = counter(); const stages = counter();
    records.forEach(record => {
      if (record.type !== 'company') return;
      const detail = record.detail || {};
      Object.entries(companyDirectionCodes).forEach(([label, code]) => {
        const counts = detail.directions;
        if (counts && typeof counts === 'object' && Number(counts[code]) > 0) bump(directions, label);
      });
      cityTokens(record).forEach(city => bump(cities, city));
      bump(sizes, detail.size);
      bump(stages, detail.stage);
    });
    return {
      directions: orderedValues(directions, jobDirections),
      sources: [],
      cities: topValues(cities, 50),
      jobTypes: [],
      sizes: topValues(sizes, 20),
      stages: topValues(stages, 20),
      categories: [], topics: []
    };
  }
  if (type === 'news') {
    const categories = counter(); const sources = counter(); const topics = counter();
    records.forEach(record => {
      if (record.type !== 'news') return;
      const detail = record.detail || {};
      bump(categories, record.category);
      bump(sources, record.source);
      const haystack = [record.tags, detail.technologies, detail.keywords, detail.models].flatMap(asList);
      newsTopics.forEach(topic => { if (haystack.some(item => String(item).includes(topic))) bump(topics, topic); });
    });
    return {
      directions: [], sources: topValues(sources, 30), cities: [], jobTypes: [], sizes: [], stages: [],
      categories: orderedValues(categories, newsCategories),
      topics: orderedValues(topics, newsTopics)
    };
  }
  return { directions: [], sources: [], cities: [], jobTypes: [], sizes: [], stages: [], categories: [], topics: [] };
}

function localFacets(type) {
  if (!cache.has(type)) cache.set(type, compute(type));
  return cache.get(type);
}

module.exports = { localFacets };
