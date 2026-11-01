/**
 * news-cover.js - news cover image extraction shared by list and detail responses.
 *
 * The upstream crawler often stores no `images` field, while the article body
 * (`content_html`) already contains the original pictures. Extract the first
 * real picture so list pages can render thumbnails without a second request.
 *
 * 另一个坑：微信公众号那批数据的 `images[0]` 存的是文章自身链接
 * （https://mp.weixin.qq.com/s/xxx），拿它当封面必然是一张裂图，
 * 所以候选要先按「像不像图片」排一次序，并且排除文章自身的 URL。
 */

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svgz?|tiff?)(?:[?#]|$)/i;
/* 这些域名的图片地址往往没有扩展名（/640?wx_fmt=png），只能按主机认。 */
const IMAGE_HOST_SUFFIXES = [
  '.qpic.cn', '.qlogo.cn', '.zhimg.com', '.toutiaoimg.com', '.toutiao.com',
  '.sinaimg.cn', '.126.net', '.ctfassets.net', '.cloudfront.net', '.csdnimg.cn',
  'cravatar.cn'
];

function decodeEntities(value) {
  return String(value || '').replace(/&(#?\w+);/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : match
  ));
}

/** 文章自身的链接：它们经常被爬虫塞进 images，当封面用一定是裂图。 */
function articleUrls(source) {
  return ['source_url', 'url', 'link', 'original_url', 'page_url']
    .map(field => String((source && source[field]) || '').trim())
    .filter(value => value);
}

/** 这个地址看起来是不是一张图片？（不联网，只做静态判断） */
function looksLikeImage(rawUrl, ownUrls) {
  const url = String(rawUrl || '').trim();
  if (!url || /^data:/i.test(url)) return false;
  if (!/^(https?:)?\/\//i.test(url)) return false;
  if (ownUrls.includes(url)) return false;
  let parsed;
  try {
    parsed = new URL(url, 'https://placeholder.local');
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (IMAGE_HOST_SUFFIXES.some(suffix => host === suffix.replace(/^\./, '') || host.endsWith(suffix))) return true;
  if (IMAGE_EXT.test(parsed.pathname)) return true;
  if (/[?&]wx_fmt=/.test(parsed.search)) return true;
  // cursor.com/_next/image?url=xxx.png 这种转发地址，扩展名藏在 query 里。
  if (IMAGE_EXT.test(decodeURIComponent(parsed.search))) return true;
  return false;
}

/**
 * First usable <img> source inside an HTML string.
 * Requires a leading whitespace before `src` so `this.src=` inside an inline
 * `onerror` handler and `data-src` (whose `src` follows a dash) are both skipped.
 */
function firstImageUrl(html) {
  const text = String(html || '');
  if (!text) return '';
  const match = text.match(/<img[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i) || text.match(/<img[^>]*?\sdata-src\s*=\s*["']([^"']+)["']/i);
  const url = decodeEntities(match ? match[1] : '').trim();
  if (!url || /^data:/i.test(url)) return '';
  return /^(https?:)?\/\//i.test(url) ? url : '';
}

/** 正文里的所有 <img>，按出现顺序。 */
function bodyImages(html, ownUrls) {
  const body = String(html || '');
  const found = [];
  if (!body) return found;
  const pattern = /<img[^>]*?(?:\ssrc|\sdata-src|\sdata-original)\s*=\s*["']([^"']+)["']/gi;
  let match = pattern.exec(body);
  while (match) {
    const url = decodeEntities(match[1]).trim();
    if (url && !/^data:/i.test(url) && /^(https?:)?\/\//i.test(url) && !ownUrls.includes(url) && !found.includes(url)) found.push(url);
    match = pattern.exec(body);
  }
  return found;
}

function collectImages(source) {
  const ownUrls = articleUrls(source);
  const list = source && Array.isArray(source.images) ? source.images : [];
  const declared = list.map(image => {
    if (typeof image === 'string') return decodeEntities(image).trim();
    if (image && typeof image === 'object') return decodeEntities(image.original_url || image.url || image.src || '').trim();
    return '';
  }).filter(url => url && !/^data:/i.test(url) && /^(https?:)?\/\//i.test(url) && !ownUrls.includes(url));
  return { declared, ownUrls };
}

/** 把候选排成「像图片的在前」，同组内保持原有顺序。 */
function rankByImageLikeness(urls, ownUrls) {
  const liked = [];
  const rest = [];
  [...new Set(urls)].forEach(url => (looksLikeImage(url, ownUrls) ? liked : rest).push(url));
  return [...liked, ...rest];
}

/** Cover URL for a news record, or '' when the article has no usable picture. */
function newsCover(source) {
  const { declared, ownUrls } = collectImages(source);
  const ranked = rankByImageLikeness([...declared, ...bodyImages(source && source.content_html, ownUrls)], ownUrls);
  return ranked[0] || '';
}

/** Full picture list: declared images first, then any picture found in the body. */
function newsImages(source) {
  const { declared, ownUrls } = collectImages(source);
  return rankByImageLikeness([...declared, ...bodyImages(source && source.content_html, ownUrls)], ownUrls);
}

module.exports = { decodeEntities, firstImageUrl, newsCover, newsImages, looksLikeImage, articleUrls };
