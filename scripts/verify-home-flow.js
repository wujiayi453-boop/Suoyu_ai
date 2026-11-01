const puppeteer=require('puppeteer-core'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 fs.mkdirSync('logs/home-flow',{recursive:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,390]){
   await page.setViewport({width,height:900});await page.goto('http://127.0.0.1:4173/#/',{waitUntil:'networkidle2'});
   await page.evaluate(()=>{const e=document.querySelector('.home-chapter');window.scrollTo({top:e.getBoundingClientRect().top+scrollY-innerHeight+50,behavior:'instant'});});
   await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.home-chapter')).opacity)<.9);
   for(let i=0;i<4;i++){
    await page.click(`[data-flow-index="${i}"]`);
    await page.waitForFunction(index=>document.querySelector(`[data-flow-index="${index}"]`).hasAttribute('aria-current'),{},i);
    await page.waitForFunction(index=>{
      const header=document.querySelector(`#home-chapter-${index}>header`).getBoundingClientRect();
      const nav=document.querySelector('.topbar').getBoundingClientRect();
      return header.top>=nav.bottom-1&&header.top<nav.bottom+220;
    },{},i);
    if(i===1||i===3)await page.screenshot({path:`logs/home-flow/chapter-${i}-${width}.png`});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   assert.equal(await page.evaluate(()=>document.querySelector('.home-flow-nav').getBoundingClientRect().right < document.querySelector('.home-chapter').getBoundingClientRect().left),true);
   assert.equal(await page.$eval('.home-chapter>header',e=>getComputedStyle(e).borderTopWidth),'0px');
   await page.goto('http://127.0.0.1:4173/#/jobs',{waitUntil:'networkidle2'});assert.equal(await page.$('.home-flow-nav'),null);
   await page.goto('http://127.0.0.1:4173/#/',{waitUntil:'networkidle2'});assert.equal((await page.$$('.home-flow-nav')).length,1);
   console.log(`${width}px: section navigation, header visibility, cleanup, overflow passed`);
  }
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.click('[data-flow-index="2"]');
  assert.equal(await page.$eval('.home-chapter',e=>getComputedStyle(e).opacity),'1');
  assert.equal(await page.$eval('.home-flow-marker',e=>getComputedStyle(e).transitionDuration),'0s');
  assert.equal(await page.$eval('#home-chapter-2>header',e=>getComputedStyle(e,'::before').transform),'none');
  await page.screenshot({path:'logs/home-flow/reduced-motion.png'});
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
