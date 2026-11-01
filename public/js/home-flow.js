/* A single reading path. Native scrolling, no scroll capture or hidden content. */
let disposeHomeFlow = () => {};
function mountHomeFlow() {
  disposeHomeFlow();
  const main=document.querySelector('#main');
  const sections=[...main.querySelectorAll(':scope > .applied-section')];
  if(!sections.length)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const controller=new AbortController(),signal=controller.signal;
  const nav=document.createElement('nav');
  nav.className='home-flow-nav';nav.setAttribute('aria-label','首页板块导航');
  const names=['机会','团队','资讯','研究'];
  nav.innerHTML=`<div class="home-flow-links">${sections.map((section,i)=>`<button type="button" data-flow-index="${i}" aria-controls="home-chapter-${i}">${names[i]}</button>`).join('')}<span class="home-flow-marker" aria-hidden="true"></span></div><span class="home-flow-progress" aria-hidden="true"></span>`;
  sections[0].before(nav);
  const buttons=[...nav.querySelectorAll('button')];
  let raf=0,active=-1;
  const marker=nav.querySelector('.home-flow-marker');
  sections.forEach((section,i)=>{
    section.id=`home-chapter-${i}`;
    section.classList.add('home-chapter');
    const title=section.querySelector('h2');title.tabIndex=-1;
    buttons[i].addEventListener('click',()=>{
      const top=section.getBoundingClientRect().top+scrollY;
      const header=document.querySelector('.topbar').getBoundingClientRect().height;
      window.scrollTo({top:top-header-20,behavior:reduce.matches?'instant':'smooth'});
      title.focus({preventScroll:true});
    },{signal});
  });
  function update(){
    raf=0;if(!nav.isConnected)return;
    const headerHeight=document.querySelector('.topbar').getBoundingClientRect().height;
    nav.style.setProperty('--flow-top',`${headerHeight}px`);
    const anchor=headerHeight+100;
    const rects=sections.map(s=>s.getBoundingClientRect());
    let next=0;
    rects.forEach((r,i)=>{if(r.top<=anchor)next=i;});
    const range=rects.at(-1).top-rects[0].top;
    const progress=Math.max(0,Math.min(1,(anchor-rects[0].top)/Math.max(1,range)));
    nav.style.setProperty('--flow-progress',progress);
    if(next!==active){
      active=next;
      buttons.forEach((button,i)=>{if(i===active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');});
      sections.forEach((section,i)=>section.classList.toggle('is-current',i===active));
      nav.style.setProperty('--flow-accent',getComputedStyle(sections[active]).getPropertyValue('--section-ink').trim()||'#70518e');
    }
    const current=buttons[active];
    marker.style.width=`${current.offsetWidth}px`;
    marker.style.height=`${current.offsetHeight}px`;
    marker.style.transform=`translateY(${current.offsetTop}px)`;
    rects.forEach((r,i)=>{
      const enter=Math.max(0,Math.min(1,(innerHeight-r.top)/180));
      const leave=Math.max(0,Math.min(1,(r.bottom-headerHeight-24)/140));
      const visibility=reduce.matches?1:Math.min(enter,leave);
      sections[i].style.setProperty('--chapter-opacity',String(.18+.82*visibility));
      sections[i].style.setProperty('--chapter-offset',`${reduce.matches?0:(1-enter)*18-(1-leave)*8}px`);
      const travel=reduce.matches?0:Math.max(-12,Math.min(12,(r.top-innerHeight*.45)*.025));
      sections[i].style.setProperty('--chapter-drift',`${travel}px`);
      const fill=Math.max(0,Math.min(1,(innerHeight*.8-r.top)/100));
      sections[i].style.setProperty('--chapter-link',fill);
    });
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(update);}
  window.addEventListener('scroll',schedule,{passive:true,signal});
  window.addEventListener('resize',schedule,{passive:true,signal});
  reduce.addEventListener('change',schedule,{signal});
  const observer=new ResizeObserver(schedule);observer.observe(main);observer.observe(document.querySelector('.topbar'));
  update();
  disposeHomeFlow=()=>{controller.abort();observer.disconnect();cancelAnimationFrame(raf);nav.remove();disposeHomeFlow=()=>{};};
}
