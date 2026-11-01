const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { records } = require('../src/services/local/data-index');
const out = path.join(__dirname, '../logs/product-check');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const report = [];
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const checks = [{name:'home',hash:'/'}];
    for(const route of ['jobs','companies','knowledge','models','news','favorites','search?q=大模型']) checks.push({name:route.split('?')[0]+'-list',hash:'/'+route});
    for (const type of ['job','company','paper','model','news']) {
      const r=records.find(r=>r.type===type);
      checks.push({name:type,hash:`/detail/${type}/${encodeURIComponent(r.id)}`});
    }
    const issues = JSON.parse(fs.readFileSync(path.join(__dirname,'../database/quality/content-report.json'))).issues;
    if (issues.length) checks.push({name:'missing-body',hash:`/detail/${issues[0].type}/${issues[0].id}`});
    for (const width of [1440,768,390]) {
      await page.setViewport({width,height:900});
      for (const check of checks) {
        await page.goto('http://127.0.0.1:4173/#'+check.hash,{waitUntil:'domcontentloaded'});
        await page.waitForSelector(check.name==='home'?'.applied-hero':check.name.endsWith('-list')?'main h1':'.topic-explore',{timeout:60000});
        const data=await page.evaluate(()=>({title:document.querySelector('main h1')?.textContent, text:document.querySelector('main')?.innerText.length, overflow:document.documentElement.scrollWidth>innerWidth+2, relations:document.querySelectorAll('.relation-card').length}));
        await page.screenshot({path:path.join(out,`${check.name}-${width}.png`)});
        report.push({name:check.name,width,...data});
      }
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({report,errors},null,2));
    console.log(JSON.stringify({report,errors},null,2));
    if(errors.length || report.some(r=>!r.title||!r.text||r.overflow))process.exitCode=1;
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
