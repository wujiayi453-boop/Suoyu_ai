const puppeteer=require('puppeteer-core');
const assert=require('assert/strict');
const fs=require('fs');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 fs.mkdirSync('logs/soyu-check',{recursive:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,390]){
   await page.setViewport({width,height:1000});await page.goto('http://127.0.0.1:4173/#/',{waitUntil:'networkidle2'});
   await page.waitForFunction(()=>['.soyu-brand-icon','.soyu-hero-mark'].every(s=>{const e=document.querySelector(s);return e&&e.complete&&e.naturalWidth>0}));
   assert.equal(await page.$eval('.soyu-brand-icon',e=>e.complete&&e.naturalWidth>0),true);
   assert.equal(await page.$eval('.soyu-hero-mark',e=>e.complete&&e.naturalWidth>0),true);
   const sum=await page.$$eval('.soyu-stat-rows strong',els=>els.reduce((sum,e)=>sum+Number(e.textContent.replaceAll(',','')),0));assert.equal(sum,22144);
   await page.screenshot({path:`logs/soyu-check/home-${width}.png`});
   assert.equal(await page.$('[data-chart]'),null);
   await page.waitForFunction(()=>document.querySelector('.soyu-ring-label strong').textContent==='22,144');
   await page.hover('.soyu-stat-rows a');
   await page.waitForFunction(()=>document.querySelector('.soyu-ring-label strong').textContent==='6,017');
   await page.mouse.move(0,0);
   await page.waitForFunction(()=>document.querySelector('.soyu-ring-label strong').textContent==='22,144');
   const first=await page.$eval('.soyu-topics',e=>e.textContent);await page.click('.soyu-shuffle');assert.notEqual(await page.$eval('.soyu-topics',e=>e.textContent),first);
   await page.click('.soyu-stat-rows a');await page.waitForSelector('.listing-page');assert.ok(page.url().endsWith('#/jobs'));
   console.log(`${width}px: logo, totals, ring count animation, inspiration, category navigation passed`);
  }
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.goto('http://127.0.0.1:4173/#/',{waitUntil:'networkidle2'});await page.click('.soyu-shuffle');assert.equal(await page.$eval('.soyu-orbit',e=>getComputedStyle(e).transitionDuration),'0s');
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
