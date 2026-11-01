/**
 * paths.js - single source of truth for on-disk locations.
 * Extracted during the enterprise layout refactor; no behaviour change.
 */
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..', '..');
const publicDir = path.join(root, 'public');
const databaseDir = path.join(root, 'database');
const rawRootDir = path.join(databaseDir, 'raw');
// Older offline packages put the JSONL files directly in database/raw/, while
// the packaged dataset keeps them one level deeper at database/raw/raw/.
// Keep the layout detail here so callers always address the real source data.
const nestedRawDir = path.join(rawRootDir, 'raw');
const rawDir = fs.existsSync(path.join(rawRootDir, 'ai_news_merged.jsonl'))
  ? rawRootDir
  : nestedRawDir;
const generatedDir = path.join(databaseDir, 'generated');
const mappingDir = path.join(databaseDir, 'mapping');
const scriptsDir = path.join(root, 'scripts');
const docsDir = path.join(root, 'docs');
const logsDir = path.join(root, 'logs');
const envFile = path.join(root, '.env');
const dataFullFile = path.join(generatedDir, 'data-full.js');
const newsOffsetsFile = path.join(generatedDir, 'news-offsets.json');
const paperOffsetsFile = path.join(generatedDir, 'paper-offsets.json');

module.exports = {
  root, publicDir, databaseDir, rawDir, generatedDir, mappingDir,
  scriptsDir, docsDir, logsDir, envFile,
  dataFullFile, newsOffsetsFile, paperOffsetsFile
};
