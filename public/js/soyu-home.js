function soyuHero(catalog) {
  const colors=['#52786b','#667da7','#9070b4','#b38543','#b77781'];
  const total=catalog.reduce((n,[type])=>n+typeTotal(type),0);
  let offset=0;
  const arcs=catalog.map(([type,label,url],i)=>{
    const count=typeTotal(type),length=total?count/total*528:0;
    const html=`<a href="#${url}" aria-label="${label} ${count.toLocaleString()} 条"><circle class="soyu-arc" data-stat="${i}" cx="110" cy="110" r="84" fill="none" stroke="${colors[i]}" stroke-width="19" stroke-dasharray="${Math.max(0,length-2)} ${528-Math.max(0,length-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${label}：${count.toLocaleString()} 条</title></circle></a>`;
    offset+=length;return html;
  }).join('');
  return `<section class="applied-hero soyu-hero"><div class="soyu-playground" aria-hidden="true"><i class="soyu-orbit orbit-one"></i><i class="soyu-orbit orbit-two"></i><span class="soyu-satellite satellite-one"></span><span class="soyu-satellite satellite-two"></span><span class="soyu-satellite satellite-three"></span></div><div class="applied-hero-copy"><img class="soyu-hero-mark" src="assets/soyu-logo.svg" alt="" width="68" height="68"><h1>有点好奇，<br>就来索yu。</h1><p>找机会，读新知。让好奇有个去处。</p><form class="large-search search-form" data-path="/search"><input name="q" aria-label="搜索索yu资料" placeholder="想了解什么？"><button type="submit">搜一下</button></form><div class="soyu-inspiration"><div class="soyu-topics">${soyuTopicLinks(0)}</div><button type="button" class="soyu-shuffle" aria-label="换一组探索关键词"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-2l2 6M4 12l2 6a8 8 0 0 0 13-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>换个灵感</button></div></div><aside class="soyu-stats" aria-label="资料数据统计"><header><h2>这里，装着你的好奇</h2></header><div class="soyu-ring"><svg viewBox="0 0 220 220" aria-label="五类资料数量占比">${arcs}</svg><div class="soyu-ring-label" role="img" aria-label="${total.toLocaleString()} 条内容"><strong aria-hidden="true">${total.toLocaleString()}</strong><span>条内容，等你发现</span></div></div><nav class="soyu-stat-rows" aria-label="资料分类">${catalog.map(([type,label,url],i)=>`<a href="#${url}" data-stat="${i}" style="--stat-color:${colors[i]}"><span class="soyu-stat-name"><i></i>${label}</span><strong>${typeTotal(type).toLocaleString()}</strong><small>${total?(typeTotal(type)/total*100).toFixed(1):'0.0'}%</small></a>`).join('')}</nav><p class="soyu-stat-note">已有数据快照 · 点击分类继续探索</p></aside></section>`;
}

function soyuTopicLinks(index) {
  const sets=[['大模型','计算机视觉','自然语言处理'],['AI Agent','多模态','机器学习'],['深度学习','机器人','推荐算法']];
  return sets[index%sets.length].map(q=>`<a href="#/search?q=${encodeURIComponent(q)}">${q}</a>`).join('');
}

function mountSoyuHome(catalog) {
  const hero=document.querySelector('.soyu-hero');if(!hero)return;
  let inspiration=0;
  hero.querySelector('.soyu-shuffle').addEventListener('click',()=>{
    hero.querySelector('.soyu-topics').innerHTML=soyuTopicLinks(++inspiration);
    hero.dataset.scene=String(inspiration%3);
  });
  const stats=hero.querySelector('.soyu-stats');
  const total=catalog.reduce((n,[type])=>n+typeTotal(type),0);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const center=stats.querySelector('.soyu-ring-label');
  const number=center.querySelector('strong');
  let frame=0, displayed=0, selected=-2;
  function animateNumber(target,duration=650){
    cancelAnimationFrame(frame);
    if(reduce.matches){displayed=target;number.textContent=target.toLocaleString();return;}
    const start=performance.now(),from=displayed;
    const tick=now=>{
      if(!number.isConnected)return;
      const progress=reduce.matches?1:Math.min(1,(now-start)/duration);
      displayed=Math.round(from+(target-from)*(1-Math.pow(1-progress,3)));
      number.textContent=displayed.toLocaleString();
      if(progress<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
  }
  function select(index){
    if(selected===index)return;selected=index;
    const item=catalog[index],count=item?typeTotal(item[0]):total;
    const caption=item?`${item[1]} · ${(count/Math.max(1,total)*100).toFixed(1)}%`:'条内容，等你发现';
    center.querySelector('span').textContent=caption;
    center.setAttribute('aria-label',`${count.toLocaleString()} ${caption}`);
    animateNumber(count,index===-1?850:450);
    stats.querySelectorAll('.soyu-arc').forEach((arc,i)=>arc.classList.toggle('is-muted',Boolean(item)&&i!==index));
  }
  select(-1);
  stats.querySelectorAll('[data-stat]').forEach(el=>{
    el.addEventListener('pointerenter',()=>select(Number(el.dataset.stat)));
    el.addEventListener('pointerleave',()=>select(-1));
    el.addEventListener('focus',()=>select(Number(el.dataset.stat)));
    el.addEventListener('blur',()=>select(-1));
  });
  hero.addEventListener('pointermove',e=>{
    if(reduce.matches||e.pointerType!=='mouse')return;
    const r=hero.getBoundingClientRect();
    hero.style.setProperty('--play-x',`${(e.clientX-r.left-r.width/2)*.018}px`);
    hero.style.setProperty('--play-y',`${(e.clientY-r.top-r.height/2)*.018}px`);
  });
  hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--play-x','0px');hero.style.setProperty('--play-y','0px');});
}
