const fs = require('fs');
const path = require('path');
const { rawDir } = require('../../config/paths');
const cache = new Map();
const files = { job: ['jobs_clean.jsonl', 'job_id'], company: ['companies_clean.jsonl', 'company_id'], model: ['models_merged.jsonl', 'id'] };
function completeRecord(record) {
  const config = files[record.type];
  if (!config) return record;
  if (!cache.has(record.type)) {
    const file = path.join(rawDir, config[0]);
    const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
    cache.set(record.type, new Map(rows.map(row => [String(row[config[1]]), row])));
  }
  const raw = cache.get(record.type).get(String(record.id));
  if (!raw) return record;
  const detail = { ...record.detail };
  if (record.type === 'job') Object.assign(detail, { description: raw.jd || raw.summary || '', responsibilities: raw.responsibilities || '', requirements: raw.requirements || '' });
  if (record.type === 'company') detail.description = raw.description || raw.oneliner || '';
  if (record.type === 'model') Object.assign(detail, { description: raw.description || raw.abstract || '', abstract: raw.abstract || '' });
  return { ...record, detail };
}
module.exports = { completeRecord };
