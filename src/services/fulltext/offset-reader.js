/**
 * offset-reader.js - byte-offset readers for news / paper full text JSONL.
 * Extracted verbatim from the legacy server.js lines L50-L52, L86-L156.
 */
const fs = require('fs');
const path = require('path');
const { root, rawDir } = require('../../config/paths');
const { newsOffsets, paperOffsets } = require('../local/data-index');
const { newsImages } = require('../../utils/news-cover');

function sourcePath(value) {
  const requested = path.isAbsolute(value || '') ? value : path.join(root, value || '');
  if (fs.existsSync(requested)) return requested;
  // Offset manifests created before the package layout changed still record
  // "database/raw/<file>". Resolve that legacy reference to the discovered
  // source-data directory instead of silently returning an empty detail page.
  return path.join(rawDir, path.basename(value || ''));
}

function loadNewsArticle(id) {
  const entry = newsOffsets.offsets[id];
  const file = sourcePath(newsOffsets.source);
  if (!entry || !fs.existsSync(file)) return null;
  const [offset, length] = entry;
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, offset);
  fs.closeSync(fd);
  const article = JSON.parse(buffer.toString('utf8').replace(/\r$/, ''));
  return {
    content: article.content || '',
    contentHtml: article.content_html || '',
    sourceUrl: article.source_url || '',
    sourceName: article.source_name || article.source || '',
    category: article.category || '',
    publishedAt: article.published_at || '',
    crawledAt: article.crawled_at || '',
    tags: [...(article.tags || []), ...(article.ai_domains || []), ...(article.technologies || [])].filter(Boolean).slice(0, 20),
    companies: article.companies || [],
    models: article.models || [],
    technologies: article.technologies || [],
    images: (() => {
      const declared = (article.images || []).map(image => ((image && image.original_url) || (typeof image === 'string' ? image : ''))).filter(Boolean);
      const list = declared.length ? declared : newsImages(article);
      return [...new Set(list)].filter(url => url && url !== article.source_url && !/^https?:\/\/mp\.weixin\.qq\.com\/s[\/?#]/i.test(url));
    })()
  };
}

function readOffsetRecord(indexFile, id) {
  const entry = indexFile.offsets[id];
  const file = sourcePath(indexFile.source);
  if (!entry || !fs.existsSync(file)) return null;
  const [offset, length] = entry;
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, offset);
  fs.closeSync(fd);
  return JSON.parse(buffer.toString('utf8').replace(/\r$/, ''));
}

function loadPaperArticle(id) {
  const paper = readOffsetRecord(paperOffsets, id);
  if (!paper) return null;
  const extra = paper.extra || {};
  const sections = (extra.sections || []).filter(section => section && section.content).map(section => ({ title:section.title || '', content:section.content || '', level:section.level || 1, id:section.section_id || '' }));
  return {
    abstract: paper.abstract || paper.description || '',
    fullText: sections.length ? '' : extra.full_text || '',
    sections,
    authors: (paper.authors || []).map(author => ({ name:typeof author === 'string' ? author : author.name || '', affiliation:typeof author === 'object' ? author.affiliation || '' : '' })).filter(author => author.name),
    categories: paper.categories || [],
    sourceId: paper.source_id || '',
    sourceUrl: paper.url || paper.html_url || '',
    pdfUrl: paper.pdf_url || '',
    htmlUrl: paper.html_url || '',
    doi: extra.doi || paper.external_ids && paper.external_ids.doi || '',
    language: paper.language || '',
    publishedAt: paper.published_date || '',
    updatedAt: paper.updated_date || '',
    comment: extra.comment || '',
    subfield: extra.ai_subfield || '',
    keywords: extra.ai_keywords || [],
    methods: extra.ai_methods || [],
    datasets: extra.ai_datasets || [],
    codeLinks: (extra.code_links || []).filter(link => link && link.url).map(link => ({ url:link.url, platform:link.platform || '代码仓库' })),
    openAccess: Boolean(extra.is_open_access),
    version: extra.version || '',
    figures: extra.figures_count || 0,
    tables: extra.tables_count || 0,
    wordCount: extra.word_count || 0,
    references: extra.reference_list_count || 0
  };
}

module.exports = { sourcePath, loadNewsArticle, readOffsetRecord, loadPaperArticle };
