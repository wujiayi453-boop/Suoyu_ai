const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
(async()=>{
  const browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const out=path.join(__dirname,'../logs/component-check');fs.mkdirSync(out,{recursive:true});
  const errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const width of (process.env.CHECK_WIDTH ? [Number(process.env.CHECK_WIDTH)] : [1440,768,390])){
      await page.setViewport({width,height:900});
      await page.goto('http://127.0.0.1:4173/#/',{waitUntil:'networkidle2'});
      await page.evaluate(()=>{localStorage.removeItem('ai-search-favorites-v3');localStorage.removeItem('ai-search-favorite-records-v1');});
      await page.reload({waitUntil:'networkidle2'});
      assert.equal(await page.$$('.post-panel').then(a=>a.length),5);
      await page.focus('.post-panel:nth-child(2) .post-tab');await page.keyboard.press('Enter');
      assert.equal(await page.$eval('.post-panel:nth-child(2) .post-tab',e=>e.getAttribute('aria-expanded')),'true');
      await page.$eval('.post-accordion',e=>e.scrollIntoView({block:'center'}));
      await page.evaluate(()=>Promise.all(document.querySelector('.post-accordion').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
      await (await page.$('.post-accordion')).screenshot({path:path.join(out,`accordion-${width}.png`)});
      await page.locator('.post-panel.is-active [data-favorite]').click();
      await page.focus('.post-panel:nth-child(3) .post-tab');await page.keyboard.press('Enter');
      await page.locator('.post-panel.is-active [data-favorite]').click();
      await page.goto('http://127.0.0.1:4173/#/favorites',{waitUntil:'networkidle2'});
      await page.reload({waitUntil:'networkidle2'});
      assert.equal(await page.$$('.polaroid-card').then(a=>a.length),2);
      await page.locator('[data-gallery-step="1"]').click();
      await page.waitForFunction(()=>document.querySelector('.polaroid-count').textContent==='2 / 2');
      await page.focus('.polaroid-track');await page.keyboard.press('Home');
      await page.waitForFunction(()=>document.querySelector('.polaroid-count').textContent==='1 / 2');
      await (await page.$('.polaroid-gallery')).screenshot({path:path.join(out,`favorites-${width}.png`)});
      const box=await (await page.$('.polaroid-track')).boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+150);await page.mouse.down();await page.mouse.move(box.x+box.width/2-230,box.y+150,{steps:15});await page.mouse.up();
      await page.waitForFunction(()=>document.querySelector('.polaroid-count').textContent==='2 / 2');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
      await page.locator('.polaroid-links a').click();await page.waitForSelector('.topic-explore');
      await page.goto('http://127.0.0.1:4173/#/favorites',{waitUntil:'networkidle2'});
      await page.locator('.polaroid-links [data-favorite]').click();
      assert.equal(await page.$$('.polaroid-card').then(a=>a.length),1);
      assert.equal(await page.$eval('[data-gallery-step="1"]',e=>e.disabled),true);
      await page.locator('.polaroid-links [data-favorite]').click();
      await page.waitForSelector('.favorite-empty',{timeout:5000}).catch(async e=>{await page.screenshot({path:path.join(out,'failure.png')});console.log(await page.evaluate(()=>({url:location.href,saved:localStorage.getItem('ai-search-favorites-v3'),text:document.querySelector('main').innerText.slice(0,1800)})));throw e;});
      console.log(`${width}px: accordion, save/reload, carousel, keyboard, detail, removal, empty state passed`);
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({widths:[1440,768,390],errors,result:'passed'},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

