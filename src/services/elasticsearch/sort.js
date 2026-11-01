/**
 * sort.js - sort clause builders.
 * Extracted verbatim from the legacy server.js lines L477-L522.
 */
const { evidenceSort } = require('../../config/constants');

function publishedDateSort(order) {
  const missing = order === 'asc' ? 99999999 : 0;
  return {
    _script:{
      type:'number',
      order,
      script:{
        lang:'painless',
        params:{ missing },
        source:"if (doc['published_at'].size() == 0) return params.missing; String value = doc['published_at'].value; if (value.length() < 10 || value.substring(4,5) != '-' || value.substring(7,8) != '-') return params.missing; return Long.parseLong(value.substring(0,4) + value.substring(5,7) + value.substring(8,10));"
      }
    }
  };
}

function elasticSort(type, requested) {
  const sort = requested || 'relevance';
  if (type === 'job') {
    const title = { 'title.keyword':{ order:'asc', missing:'_last' } };
    const update = { updated_at:{ order:'desc', missing:'_last' } };
    const salary = { salary_monthly_avg:{ order:'desc', missing:'_last' } };
    const status = { status:{ order:'desc', missing:'_last' } };
    if (sort === 'title') return [evidenceSort, title, status, update, salary];
    if (sort === 'source') return [evidenceSort, { source:{ order:'asc', missing:'_last' } }, status, update, title];
    if (sort === 'time') return [evidenceSort, update, salary, title];
    return [evidenceSort, { _score:{ order:'desc' } }, status, update, salary, title];
  }
  if (type === 'company') {
    const active = { active_job_count:{ order:'desc', missing:'_last' } };
    if (sort === 'salary') return [{ salary_p50:{ order:'desc', missing:'_last' } }, active, { 'name.keyword':{ order:'asc', missing:'_last' } }];
    if (sort === 'name') return [{ 'name.keyword':{ order:'asc', missing:'_last' } }];
    return [active, { featured:{ order:'desc', missing:'_last' } }, { _score:{ order:'desc' } }, { 'name.keyword':{ order:'asc', missing:'_last' } }];
  }
  if (type === 'news') {
    if (sort === 'time_asc') return [publishedDateSort('asc'), { _score:{ order:'desc' } }, { 'title.keyword':{ order:'asc', missing:'_last' } }];
    if (sort === 'time_desc') return [publishedDateSort('desc'), { _score:{ order:'desc' } }, { 'title.keyword':{ order:'asc', missing:'_last' } }];
    return [{ _score:{ order:'desc' } }, publishedDateSort('desc'), { 'title.keyword':{ order:'asc', missing:'_last' } }];
  }
  if (type === 'model') {
    const title = { 'title.keyword':{ order:'asc', missing:'_last' } };
    if (sort === 'title') return [title];
    if (sort === 'time') return [{ updated_date:{ order:'desc', missing:'_last' } }, { published_date:{ order:'desc', missing:'_last' } }, title];
    return [{ _score:{ order:'desc' } }, { updated_date:{ order:'desc', missing:'_last' } }, title];
  }
  return [{ _score:{ order:'desc' } }, { 'title.keyword':{ order:'asc', missing:'_last' } }];
}

module.exports = { publishedDateSort, elasticSort };
