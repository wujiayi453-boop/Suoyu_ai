/* Native adapters for the supplied image accordion and polaroid carousel.
   Keep the existing no-build application and its real data / routes. */
function postArtwork(record) {
  const cover = record.type === 'news' ? newsCardCover(record) : record.detail?.logo;
  return `<div class="post-art" ${record.type === 'news' ? `data-home-thumb="${esc(record.id)}"` : ''}><span>${esc(TYPE[record.type]?.label || '资料')}</span>${cover ? `<img src="${esc(assetUrl(cover))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
}

function postAccordion(records) {
  if (!records.length) return '<p>暂无可展示的帖子。</p>';
  return `<div class="post-accordion" aria-label="首页资讯帖子">${records.map((r,i)=>`<article class="post-panel${i === 0 ? ' is-active' : ''}">
    ${postArtwork(r)}
    <button class="post-tab" type="button" aria-expanded="${i === 0}" aria-controls="post-info-${i}"><span>${esc(r.title)}</span></button>
    <div class="post-info" id="post-info-${i}" ${i ? 'hidden' : ''}><p class="post-source">${esc(r.source || '行业资讯')} ${esc(r.date || '')}</p><h3>${esc(r.title)}</h3><p class="post-summary">${esc(r.summary || '打开帖子，查看完整内容和相关资料。')}</p><div class="post-actions"><a href="${detailHash(r)}">阅读帖子</a><button type="button" data-favorite="${esc(r.id)}">${state.favorites.has(r.id) ? '取消收藏' : '收藏帖子'}</button></div></div>
  </article>`).join('')}</div>`;
}

function mountPostAccordion() {
  const root = document.querySelector('.post-accordion');
  if (!root) return;
  const panels = [...root.children];
  const activate = index => panels.forEach((panel,i)=>{
    panel.classList.toggle('is-active', i === index);
    panel.querySelector('.post-tab').setAttribute('aria-expanded', String(i === index));
    panel.querySelector('.post-info').hidden = i !== index;
  });
  panels.forEach((panel,i)=>{
    panel.addEventListener('pointerenter', e=>{ if(e.pointerType === 'mouse' && !root.contains(document.activeElement)) activate(i); });
    const tab = panel.querySelector('.post-tab');
    tab.addEventListener('click', ()=>activate(i));
    tab.addEventListener('focus', ()=>activate(i));
    tab.addEventListener('keydown', e=>{
      const step = ['ArrowRight','ArrowDown'].includes(e.key) ? 1 : ['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      panels[(i + step + panels.length) % panels.length].querySelector('.post-tab').focus();
    });
  });
}

function favoriteCarousel(records) {
  if (!records.length) return `<section class="favorite-empty"><h2>把值得再读的内容，留在这里。</h2><p>在帖子、岗位或详情页点击收藏，就能创建你的资料照片墙。</p><a class="primary" href="#/">去首页发现内容</a></section>`;
  return `<section class="polaroid-gallery" aria-label="收藏照片墙" aria-roledescription="轮播"><div class="polaroid-stage"><svg class="polaroid-string" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 Q500 140 1000 18" fill="none" stroke="currentColor" stroke-width="2"/></svg><div class="polaroid-track" tabindex="0" aria-label="收藏卡片，使用左右方向键切换">${records.map((r,i)=>`<button class="polaroid-card" type="button" data-slide="${i}" aria-label="选择收藏：${esc(r.title)}" aria-pressed="${i===0}"><span class="polaroid-peg" aria-hidden="true"></span><span class="polaroid-print">${postArtwork(r)}<span class="polaroid-note">${esc(r.title)}</span></span></button>`).join('')}</div></div><div class="polaroid-bar"><div class="polaroid-caption" aria-live="polite" aria-atomic="true"></div><div class="polaroid-controls"><span class="polaroid-count"></span><button type="button" data-gallery-step="-1" aria-label="上一条收藏">${galleryArrow(false)}</button><button type="button" data-gallery-step="1" aria-label="下一条收藏">${galleryArrow(true)}</button></div></div><div class="polaroid-links"></div></section>`;
}

function galleryArrow(next) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${next ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'}" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

function mountFavoriteCarousel(records) {
  const root = document.querySelector('.polaroid-gallery');
  if (!root) return;
  const track = root.querySelector('.polaroid-track');
  const cards = [...root.querySelectorAll('.polaroid-card')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0, drag = null, suppressClick = false;
  function paint(i) {
    active = Math.max(0, Math.min(records.length - 1, i));
    const record = records[active];
    cards.forEach((card,index)=>{card.classList.toggle('is-active',index===active);card.setAttribute('aria-pressed',String(index===active));});
    root.querySelector('.polaroid-caption').innerHTML = `<h2>${esc(record.title)}</h2><p>${esc(TYPE[record.type]?.label || '资料')} · ${esc(record.source || record.company || '已收藏资料')}</p>`;
    root.querySelector('.polaroid-count').textContent = `${active + 1} / ${records.length}`;
    root.querySelector('[data-gallery-step="-1"]').disabled = active === 0;
    root.querySelector('[data-gallery-step="1"]').disabled = active === records.length - 1;
    root.querySelector('.polaroid-links').innerHTML = `<a class="primary" href="${detailHash(record)}">打开这条收藏</a><button class="secondary" type="button" data-favorite="${esc(record.id)}">取消收藏</button>`;
  }
  function go(i) {
    paint(i);
    const card = cards[active];
    track.scrollTo({left:card.offsetLeft - track.offsetLeft - (track.clientWidth-card.clientWidth)/2,behavior:reduce.matches?'instant':'smooth'});
  }
  root.querySelectorAll('[data-gallery-step]').forEach(button=>button.addEventListener('click',()=>go(active+Number(button.dataset.galleryStep))));
  cards.forEach((card,i)=>card.addEventListener('click',e=>{if(suppressClick){e.preventDefault();return;}go(i);}));
  track.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();go(e.key==='Home'?0:e.key==='End'?records.length-1:active+(e.key==='ArrowRight'?1:-1));
  });
  track.addEventListener('scroll',()=>{
    const center=track.getBoundingClientRect().left+track.clientWidth/2;
    const distances=cards.map(c=>Math.abs(c.getBoundingClientRect().left+c.clientWidth/2-center));
    const i=distances.indexOf(Math.min(...distances));if(i!==active)paint(i);
  },{passive:true});
  // Touch uses native horizontal scrolling; mouse dragging has the same snap points.
  track.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,left:track.scrollLeft,moved:false};suppressClick=false;});
  track.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(Math.abs(e.clientX-drag.x)>6){drag.moved=true;track.setPointerCapture(e.pointerId);track.classList.add('is-dragging');}
    if(drag.moved)track.scrollLeft=drag.left-(e.clientX-drag.x);
  });
  const release=e=>{if(!drag)return;suppressClick=drag.moved;drag=null;track.classList.remove('is-dragging');if(track.hasPointerCapture(e.pointerId))track.releasePointerCapture(e.pointerId);if(suppressClick)go(active);setTimeout(()=>{suppressClick=false;},0);};
  track.addEventListener('pointerup',release);track.addEventListener('pointercancel',release);
  track.addEventListener('pointerleave',e=>{if(drag&&!drag.moved)release(e);});
  track.addEventListener('dragstart',e=>e.preventDefault());
  paint(0);
}
