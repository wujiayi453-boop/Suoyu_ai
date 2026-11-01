const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, 'docs', 'screenshots');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const shots = [
    { name: '01-homepage', url: `${BASE}/#/`, desc: '首页' },
    { name: '02-unified-search', url: `${BASE}/#/search?q=Transformer`, desc: '统一搜索 Transformer' },
    { name: '03-job-list', url: `${BASE}/#/jobs`, desc: '岗位列表页' },
    { name: '04-job-search', url: `${BASE}/#/jobs?q=大模型`, desc: '岗位搜索"大模型"' },
    { name: '05-job-filter', url: `${BASE}/#/jobs?q=&city=北京&direction=algorithm`, desc: '岗位筛选(北京+算法)' },
    { name: '06-company-list', url: `${BASE}/#/companies`, desc: '公司列表页' },
    { name: '07-news-list', url: `${BASE}/#/news`, desc: '资讯列表页' },
    { name: '08-paper-list', url: `${BASE}/#/papers?q=`, desc: '论文列表页' },
    { name: '09-model-list', url: `${BASE}/#/models?q=`, desc: '模型列表页' },
    { name: '10-favorites', url: `${BASE}/#/favorites`, desc: '收藏页' },
  ];

  for (const s of shots) {
    try {
      await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
      const file = path.join(OUT, `${s.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`OK  ${s.name}  ${s.desc}`);
    } catch (e) {
      console.log(`ERR ${s.name}  ${e.message}`);
    }
  }

  // 详情页截图（先从列表页取一个 ID）
  try {
    const resp = await fetch(`${BASE}/api/search?type=job&page=1&page_size=1`);
    const data = await resp.json();
    if (data.results && data.results[0]) {
      const id = data.results[0].id;
      await page.goto(`${BASE}/#/detail/job/${id}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(OUT, '11-job-detail.png'), fullPage: false });
      console.log('OK  11-job-detail  岗位详情页');
    }
  } catch (e) {
    console.log(`ERR 11-job-detail  ${e.message}`);
  }

  // 公司详情页
  try {
    const resp = await fetch(`${BASE}/api/search?type=company&page=1&page_size=1`);
    const data = await resp.json();
    if (data.results && data.results[0]) {
      const id = data.results[0].id;
      await page.goto(`${BASE}/#/detail/company/${id}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(OUT, '12-company-detail.png'), fullPage: false });
      console.log('OK  12-company-detail  公司详情页');
    }
  } catch (e) {
    console.log(`ERR 12-company-detail  ${e.message}`);
  }

  // 资讯详情页
  try {
    const resp = await fetch(`${BASE}/api/search?type=news&page=1&page_size=1`);
    const data = await resp.json();
    if (data.results && data.results[0]) {
      const id = data.results[0].id;
      await page.goto(`${BASE}/#/detail/news/${id}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(OUT, '13-news-detail.png'), fullPage: false });
      console.log('OK  13-news-detail  资讯详情页');
    }
  } catch (e) {
    console.log(`ERR 13-news-detail  ${e.message}`);
  }

  await browser.close();
  console.log('\n截图完成，输出目录:', OUT);
})();
