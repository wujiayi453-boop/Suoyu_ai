const https = require('https');

/*
 * image-proxy.js - 外链图片统一走本地代理。
 *
 * 三个现实约束：
 * 1. 图床基本都有防盗链，浏览器直连拿不到图，需要服务端带对 Referer 转发；
 * 2. 数据里出现的图床非常多（量子位 i.qbitai.com 一家就有 4 万+ 处引用），
 *    而且同一图床的子域名会不断变体（p3-sign / p26 / pic1 …），
 *    所以白名单同时支持「完整主机名」和「CDN 后缀」两种匹配；
 * 3. 图床对请求头很挑：BOSS直聘看到 Accept 里有 webp 就回一张 312 字节占位图，
 *    机器之心不带 Referer 直接 403。所以失败时要换一组请求头再试一次。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEADLINE_MS = 6000;
const RETRY_DEADLINE_MS = 4000;
const MAX_BYTES = 10 * 1024 * 1024;
/* 冷却从 4 分钟收到 90 秒，而且要连吃两次失败才生效：
   否则一个签名过期的 toutiao 图片超时一次，整页缩略图全跟着变 404。 */
const COOLDOWN_MS = 90 * 1000;
const FAIL_THRESHOLD = 2;
const NEGATIVE_TTL_MS = 20 * 1000;
const POSITIVE_TTL_MS = 30 * 60 * 1000;
const CACHE_ENTRIES = 500;
const CACHE_BYTES = 64 * 1024 * 1024;
/* 不声明 webp/avif 偏好，对所有图床都更稳。 */
const ACCEPT = 'image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5';

const allowedHosts = new Set([
  'mmbiz.qpic.cn', 'mmecoa.qpic.cn', 'mmbiz.qlogo.cn', 'wx.qlogo.cn', 'res.wx.qq.com',
  'img.bosszhipin.com', 'img01.51jobcdn.com', 'img04.51jobcdn.com', 'api.fancyjobs.cn',
  'img.ithome.com', 'cravatar.cn', 'images.ctfassets.net', 'd3phaj0sisr2ct.cloudfront.net',
  'framerusercontent.com', 'bookface-images.s3.us-west-2.amazonaws.com', 'www.google.com',
  'ai-bot.cn', 'files.vipcheap.com', 'assets.inkore.net', '26349372.s21i.faiusr.com',
  'i.qbitai.com', 'oss.zhidx.com', 'image.jiqizhixin.com', 'shizi.qq.com',
  'nimg.ws.126.net', 'i-blog.csdnimg.cn', 'oss.cyzone.cn', 'n.sinaimg.cn',
  'devin.ai', 'microsoft.ai', 'we0.ai', 'www.virse.ai', 'www.apple.com.cn', 'i.loli.net',
  'assets.aisaskills.com', 'junior.so', 'www.plaud.ai', 'pettichat.com', 'rheofit.com.cn', 'kokoniworld.com'
]);

const allowedSuffixes = [
  '.qpic.cn', '.qlogo.cn', '.qq.com', '.toutiaoimg.com', '.toutiao.com', '.zhimg.com',
  '.51jobcdn.com', '.bosszhipin.com', '.fancyjobs.cn', '.qbitai.com', '.zhidx.com',
  '.jiqizhixin.com', '.cyzone.cn', '.csdnimg.cn', '.sinaimg.cn', '.126.net',
  '.ithome.com', '.ctfassets.net', '.cloudfront.net', '.framerusercontent.com',
  '.vercel-storage.com', '.loli.net', '.hf.co', '.huggingface.co', '.githubusercontent.com',
  '.gstatic.com'
];

/* 有些图床（如 mp.toutiao.com）返回的是图片本体却标成 text/plain，
   只看 Content-Type 会误杀，这里再按文件头兜一次。 */
function sniffImageType(body) {
  const b = body;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 4 && b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return 'image/avif';
  if (b.length >= 2 && b.toString('latin1', 0, 2) === 'BM') return 'image/bmp';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  const head = b.toString('utf8', 0, Math.min(b.length, 512)).trim();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  return '';
}

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host.length > 253) return false;
  if (allowedHosts.has(host)) return true;
  return allowedSuffixes.some(suffix => host.endsWith(suffix));
}

/* 微信图床只认 mp.weixin 的 Referer；给别的站点带错 Referer 反而会被拒。 */
function refererFor(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.endsWith('.qpic.cn') || host.endsWith('.qlogo.cn') || host.endsWith('.qq.com')) return 'https://mp.weixin.qq.com/';
  if (host.endsWith('.toutiaoimg.com') || host.endsWith('.toutiao.com')) return 'https://www.toutiao.com/';
  if (host.endsWith('.zhimg.com')) return 'https://www.zhihu.com/';
  if (host.endsWith('.qbitai.com')) return 'https://www.qbitai.com/';
  if (host.endsWith('.zhidx.com')) return 'https://zhidx.com/';
  if (host.endsWith('.jiqizhixin.com')) return 'https://www.jiqizhixin.com/';
  if (host.endsWith('.csdnimg.cn')) return 'https://blog.csdn.net/';
  if (host.endsWith('.126.net')) return 'https://www.163.com/';
  if (host.endsWith('.sinaimg.cn')) return 'https://www.sina.com.cn/';
  if (host.endsWith('.cyzone.cn')) return 'https://www.cyzone.cn/';
  return '';
}

/**
 * 归一化图片地址。
 * Google 的 /s2/favicons 会 301 跳到 t0.gstatic.com，跳转链上一旦被白名单拦下就整批 404，
 * 这里直接改写成终地址，省一次跳转。
 */
function normalizeTarget(rawUrl) {
  let target;
  try {
    target = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return null;
  if (target.hostname === 'www.google.com' && target.pathname.replace(/\/+$/, '') === '/s2/favicons') {
    const domain = target.searchParams.get('domain');
    if (domain) {
      const size = target.searchParams.get('sz') || '128';
      try {
        return new URL(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`http://${domain}`)}&size=${encodeURIComponent(size)}`);
      } catch {
        return null;
      }
    }
  }
  target.protocol = 'https:';
  return target;
}

/* 某个图床连不上就先冷却一会儿：否则整页缩略图每张都要干等到超时。 */
const hostState = new Map();

function hostBlocked(hostname) {
  const entry = hostState.get(hostname);
  return Boolean(entry && entry.until && entry.until > Date.now());
}

function noteOk(hostname) {
  hostState.delete(hostname);
}

function noteFailure(hostname) {
  const now = Date.now();
  const entry = hostState.get(hostname);
  if (!entry || (entry.until && entry.until <= now)) {
    hostState.set(hostname, { fails: 1, until: 0 });
    return;
  }
  entry.fails += 1;
  if (entry.fails >= FAIL_THRESHOLD) {
    entry.until = now + COOLDOWN_MS;
    entry.fails = 0;
  }
}

/* 成功结果进内存 LRU：列表翻页会反复请求同一批缩略图，不该每张都打一次外网。 */
const imageCache = new Map();
const negativeCache = new Map();
let cacheBytes = 0;

function cacheGet(key) {
  const entry = imageCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    imageCache.delete(key);
    cacheBytes -= entry.body.length;
    return null;
  }
  imageCache.delete(key);
  imageCache.set(key, entry);
  return entry;
}

function cacheSet(key, image) {
  if (image.body.length > CACHE_BYTES / 4) return;
  while (imageCache.size >= CACHE_ENTRIES || cacheBytes + image.body.length > CACHE_BYTES) {
    const oldest = imageCache.keys().next();
    if (oldest.done) break;
    cacheBytes -= imageCache.get(oldest.value).body.length;
    imageCache.delete(oldest.value);
  }
  cacheBytes += image.body.length;
  imageCache.set(key, { type: image.type, body: image.body, expires: Date.now() + POSITIVE_TTL_MS });
}

function negativeGet(key) {
  const until = negativeCache.get(key);
  if (!until) return false;
  if (until <= Date.now()) { negativeCache.delete(key); return false; }
  return true;
}

function negativeSet(key) {
  if (negativeCache.size > 2000) negativeCache.clear();
  negativeCache.set(key, Date.now() + NEGATIVE_TTL_MS);
}

function fetchOnce(target, headers, deadlineMs, redirects = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    // request.setTimeout 只在 socket 连上之后才武装；DNS/TCP 阶段卡死时永远不触发，
    // 所以自己兜一个覆盖全过程的总时限，超时后让浏览器立刻走占位图兜底。
    const deadline = setTimeout(() => finish(reject, new Error('Image request timed out'), { timeout: true, destroy: true }), deadlineMs);

    function finish(fn, arg, opts = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (opts.destroy && request) { try { request.destroy(); } catch {} }
      fn(arg);
    }

    request = https.get(target, { headers }, response => {
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirects < 3) {
        response.resume();
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        let next;
        try {
          next = new URL(response.headers.location, target);
        } catch {
          return reject(new Error('Malformed redirect location'));
        }
        if (!hostAllowed(next.hostname)) return reject(new Error('Unsupported image host'));
        next.protocol = 'https:';
        resolve(fetchOnce(next, headers, deadlineMs, redirects + 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        return finish(reject, new Error(`Image request failed with ${status}`));
      }
      const declared = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy();
          finish(reject, new Error('Image exceeds size limit'), { destroy: true });
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const type = declared.startsWith('image/') ? declared : sniffImageType(body);
        if (!type) return finish(reject, new Error(`Response is not an image (${declared || 'no content-type'})`));
        finish(resolve, { type, body });
      });
      response.on('error', err => finish(reject, err, { timeout: true, destroy: true }));
    });
    request.on('timeout', () => finish(reject, new Error('Image socket timed out'), { timeout: true, destroy: true }));
    request.on('error', err => finish(reject, err, { timeout: true, destroy: true }));
  });
}

/** 同一张图换不同请求头再试：先带站点 Referer，再裸请求。 */
async function fetchImage(rawUrl) {
  const target = normalizeTarget(rawUrl);
  if (!target) throw new Error('Malformed image url');
  if (!hostAllowed(target.hostname)) throw new Error('Unsupported image host');
  if (hostBlocked(target.hostname)) throw new Error('Image host cooling down');

  const referer = refererFor(target.hostname);
  const attempts = [{ 'User-Agent': UA, Accept: ACCEPT }];
  if (referer) attempts[0].Referer = referer;
  if (referer) attempts.push({ 'User-Agent': UA, Accept: ACCEPT });

  let lastError = new Error('Image request failed');
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const image = await fetchOnce(target, attempts[index], index ? RETRY_DEADLINE_MS : DEADLINE_MS);
      noteOk(target.hostname);
      return image;
    } catch (error) {
      lastError = error;
      // 超时/连不上说明主机本身有问题，换请求头没意义，直接收手。
      if (error.timeout) break;
      if (!hostAllowed(target.hostname)) break;
    }
  }
  noteFailure(target.hostname);
  throw lastError;
}

async function imageProxy(req, res, rawUrl) {
  if (!rawUrl) {
    res.writeHead(400, { 'Cache-Control': 'no-store' });
    return res.end();
  }
  const key = String(rawUrl);
  const cached = cacheGet(key);
  if (cached) {
    res.writeHead(200, { 'Content-Type': cached.type, 'Cache-Control': 'public, max-age=86400', 'X-Image-Cache': 'hit' });
    return res.end(cached.body);
  }
  if (negativeGet(key)) {
    res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Image-Error': 'recently-failed' });
    return res.end();
  }
  try {
    const image = await fetchImage(key);
    cacheSet(key, image);
    res.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=86400' });
    res.end(image.body);
  } catch (error) {
    negativeSet(key);
    // 失败原因写进响应头，排查「为什么这张图是空的」时不用再去翻服务端日志。
    res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Image-Error': String(error && error.message || 'unknown').slice(0, 120) });
    res.end();
  }
}

module.exports = { imageProxy, hostAllowed, refererFor, normalizeTarget };
