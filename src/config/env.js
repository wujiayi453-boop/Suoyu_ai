/**
 * env.js - run env: .env parsing + runtime configuration.
 * Extracted verbatim from the legacy server.js lines L9-L18, L20-L34.
 */
const fs = require('fs');
const { envFile } = require('./paths');

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((values, line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith('#')) return values;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2');
    return values;
  }, {});
}

const fileEnv = readEnv(envFile);
const env = { ...fileEnv, ...process.env };
const esUrl = String(env.ES_URL || '').replace(/\/+$/, '');
const esApiKey = String(env.ES_API_KEY || '');
const esCaCert = String(env.ES_CA_CERT || '');
const esCa = esCaCert && fs.existsSync(esCaCert) ? fs.readFileSync(esCaCert) : undefined;
const serverPort = Math.max(1, Number(env.PORT) || 4173);
const esIndices = {
  paper: env.ES_ARTICLES_INDEX || 'articles_v2',
  company: env.ES_COMPANIES_INDEX || 'companies_v2',
  job: env.ES_JOBS_INDEX || 'jobs_v2',
  model: env.ES_MODELS_INDEX || 'models_v2',
  news: env.ES_NEWS_INDEX || 'news_v2'
};
const esEnabled = Boolean(esUrl && esApiKey);

module.exports = { readEnv, fileEnv, env, esUrl, esApiKey, esCaCert, esCa, serverPort, esIndices, esEnabled };
