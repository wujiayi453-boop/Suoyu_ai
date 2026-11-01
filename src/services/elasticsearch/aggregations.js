/**
 * aggregations.js - aggregation helpers and builders.
 * Extracted verbatim from the legacy server.js lines L675-L683, L741-L758.
 */

function aggregationValues(response, name) {
  return ((response.aggregations && response.aggregations[name] && response.aggregations[name].buckets) || []).map(bucket => ({ value:String(bucket.key_as_string || bucket.key), count:bucket.doc_count })).filter(item => item.value);
}

function mergeFacetValues(...groups) {
  const merged = new Map();
  groups.flat().forEach(item => merged.set(item.value, { value:item.value, count:Math.max(merged.get(item.value) && merged.get(item.value).count || 0, item.count || 0) }));
  return [...merged.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN'));
}

function monthlyAggregation(field) {
  return {
    date_histogram: { field, calendar_interval: 'month', format: 'yyyy-MM', min_doc_count: 1, order: { _key: 'asc' } }
  };
}

function keywordMonthlyAggregation(field) {
  return {
    terms: {
      size: 24,
      order: { _key: 'asc' },
      script: {
        lang: 'painless',
        source: `if (doc['${field}'].size() == 0) return ''; String value = doc['${field}'].value; return value.length() >= 7 ? value.substring(0, 7) : '';`
      }
    }
  };
}

module.exports = { aggregationValues, mergeFacetValues, monthlyAggregation, keywordMonthlyAggregation };
