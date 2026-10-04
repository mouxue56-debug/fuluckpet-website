import {regions,sample,needed,fastMove,frameTime} from './ambient-timeline.mjs?v=20261004b';
import {createMotionPreference} from './ambient-preferences.mjs?v=20261004a';
import {mountMotionControl} from './ambient-controls.mjs?v=20261004a';
import {media} from './ambient-media.mjs?v=20261004b';
import {ambientPage,contentAnchors} from './ambient-pages.mjs?v=20261004a';
const config=ambientPage(location.pathname),main=document.querySelector('main,[role="main"]');
if(config&&main)startAmbient();
function startAmbient(){
const {page,clips}=config;
const scene=document.createElement('div');scene.className='ambient-scene';scene.setAttribute('aria-hidden','true');
const poster=new Image();poster.alt='';poster.src=media[clips[0]].poster;scene.append(poster);
const canvas=document.createElement('canvas');scene.append(canvas);document.body.prepend(scene);
const ctx=canvas.getContext('2d',{alpha:false}),reduce=matchMedia('(prefers-reduced-motion: reduce)'),players=new Map();
document.body.classList.add('ambient-enabled');document.body.dataset.ambientPage=page;
const serviceGlass='.service-price-card,.service-info-card,.service-table-wrap,.service-care-details,.service-legal,.booking-form-card,.booking-sidebar .info-card,.booking-sidebar .line-card,.blog-card,.blog-cat-nav,.blog-bottom-cta,.guide-card,.guide-quick-start,.guide-figure figcaption,.guide-cta,.rel-card,.experience-card,.experience-steps>li,.experience-template,.experience-context,.experience-photo figcaption';
const serviceCopy='.experience-hero>div,.service-hero-inner>div:not(.service-hero-media),.service-heading,.service-final-cta,.booking-hero .container,.blog-hero,.blog-cat-heading,.guide-hub-header,.guide-category-title';
const glassSelectors='.hero-content,.hero-award-proof,.page-hero,.sec-header,.choice-block,.about-card,.kitten-card,.parent-card,.review-card,.faq-item,.visit-card,.line-cta-card,.award-period,.awards-proof-note,.kit-filters,.filter-bar,.sort-controls,.kitten-filter-tabs,.kitten-sort-row,.sec-cta,.jisseki-obi,.kittens-toolbar';
function glassify(){
 document.querySelectorAll(glassSelectors+','+serviceGlass).forEach(e=>{e.classList.add('ambient-glass')});
 document.querySelectorAll(serviceCopy).forEach(e=>e.classList.add('ambient-glass','ambient-glass-copy'));
 document.querySelectorAll('main .container>p,main .container>h2,main .container>div').forEach(e=>{
  if(e.parentElement.closest('.ambient-glass'))return;
  if(e.matches('.ambient-glass,.kittens-grid,.parents-grid,.about-grid,.reviews-grid,.gallery-grid,.visit-grid,.sns-grid,.awards-timeline,.parallax-bg'))return;
  if(e.matches('p,h2')||e.querySelector(':scope > .sec-title')||e.querySelector(':scope > div[style*="background:"]'))e.classList.add('ambient-glass');
 });
 document.querySelectorAll('.sec-header,.choice-block,.sec-cta,.kit-filters,.filter-bar,.sort-controls,main .container>p,main .container>h2').forEach(e=>{if(e.classList.contains('ambient-glass'))e.classList.add('ambient-glass-copy')});
 main.querySelectorAll('h1,h2,h3,p,li,label').forEach(e=>{if(!e.closest('.ambient-glass,button,.btn,[aria-hidden="true"]'))e.classList.add('ambient-glass','ambient-glass-copy')});
}
glassify();
const contentObserver=new MutationObserver(()=>glassify());contentObserver.observe(main,{childList:true,subtree:true});
let bounds=[0,1,2,3],w=innerWidth,h=innerHeight,off=new URLSearchParams(location.search).get('motion')==='off',lastY=scrollY,direction=1,queued=false,dirty=true,current=[],lastTick=performance.now(),fastUntil=0,settleTimer;
const preference=createMotionPreference();
const control=off?null:mountMotionControl(()=>{preference.toggle();sync()});
function top(el){return el.getBoundingClientRect().top+scrollY}
function measure(){
 const end=Math.max(1,document.documentElement.scrollHeight-innerHeight);let anchors=[];
 if(page==='home'){const a=document.querySelector('#kittens'),b=document.querySelector('#about');if(a&&b)anchors=[top(a)-h*.4,top(b)-h*.4]}
 else if(page==='about'){const a=document.querySelector('#registration'),ss=[...document.querySelectorAll('main>section')];if(a&&ss[4])anchors=[top(a)-h*.4,top(ss[4])-h*.4]}
 else if(config.sections){const cards=[...main.querySelectorAll(config.sections)].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none');anchors=contentAnchors(cards.map(top),h)}
 bounds=regions(end,anchors);canvas.dataset.bounds=JSON.stringify(bounds.map(Math.round));dirty=false;
}
function snapshot(p){if(p.disposed||p.video.readyState<2||p.video.seeking)return;const v=p.video;if(p.image.width!==v.videoWidth||p.image.height!==v.videoHeight){p.image.width=v.videoWidth;p.image.height=v.videoHeight}p.image.getContext('2d').drawImage(v,0,0);p.time=v.currentTime;p.ready=true;schedule()}
function ensure(index){
 if(players.has(index))return players.get(index);
 const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('playsinline','');
 const p={disposed:false,video,image:document.createElement('canvas'),time:0,ready:false,progress:0};players.set(index,p);
 video.addEventListener('loadeddata',()=>{if(Math.abs(video.currentTime-frameTime(p.progress,video.duration))<.1)snapshot(p);seek(p)});
 video.addEventListener('seeked',()=>{snapshot(p);seek(p)});
 video.addEventListener('error',()=>{if(!p.disposed)canvas.dataset.mediaError=clips[index];});
 // Let the browser decode arriving bytes and request only the ranges needed for seeking.
 video.src=media[clips[index]].video;video.load();return p;
}
function seek(p){const v=p.video,t=frameTime(p.progress,v.duration);if(p.disposed||v.readyState<2||v.seeking||t===null)return;if(Math.abs(v.currentTime-t)>1/48)v.currentTime=t;}
function release(index){const p=players.get(index);p.disposed=true;p.video.pause();p.video.removeAttribute('src');p.video.load();p.image.width=0;p.image.height=0;players.delete(index)}
function paint(p,progress,alpha){const image=p.image;const scale=Math.max(w/image.width,h/image.height)*(1.02+progress*(['home','about','kittens'].includes(page)?.10:.04));const dw=image.width*scale,dh=image.height*scale;ctx.globalAlpha=alpha;ctx.drawImage(image,(w-dw)*(.40+progress*.14),(h-dh)*(.48+progress*.10),dw,dh)}
function render(){
 queued=false;const editing=!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');canvas.dataset.paused=String(editing||preference.paused);if(editing||preference.paused)return;if(dirty)measure();if(off||reduce.matches||navigator.connection?.saveData||document.hidden)return;
 const y=scrollY,now=performance.now(),delta=y-lastY;if(Math.abs(delta)>1)direction=delta>0?1:-1;
 if(fastMove(delta,now-lastTick,h))fastUntil=now+110;
 lastY=y;lastTick=now;
 const deferMedia=now<fastUntil;if(deferMedia){clearTimeout(settleTimer);settleTimer=setTimeout(schedule,120);}
 current=sample(y,bounds,Math.min(360,h*.4),['blog','guide'].includes(page)?h*6:Infinity);
 const active=current.map(s=>s.index);const load=[...new Set([...active,...needed(y,bounds,h,direction)])].slice(0,2);
 for(const index of [...players.keys()])if(!deferMedia&&!load.includes(index))release(index);
 for(const index of load){if(deferMedia&&!players.has(index))continue;const p=ensure(index);const s=current.find(s=>s.index===index);p.progress=s?s.progress:index<active[0]?1:0;seek(p)}
 const ready=current.filter(s=>players.get(s.index)?.ready);if(ready.length){ctx.globalAlpha=1;const first=ready[0];paint(players.get(first.index),first.progress,1);if(ready.length>1)paint(players.get(ready[1].index),ready[1].progress,ready[1].weight);ctx.globalAlpha=1;canvas.classList.add('ready');canvas.dataset.display=ready.map(s=>`${clips[s.index]}:${players.get(s.index).time.toFixed(2)}`).join('+')}
 canvas.dataset.active=active.map(i=>clips[i]).join('+');canvas.dataset.loaded=[...players.keys()].map(i=>clips[i]).join(',');canvas.dataset.progress=current.map(s=>s.progress.toFixed(3)).join(',');

}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render)}}
function resize(){
 // The large viewport stays stable while Safari's browser bars or keyboard move.
 w=scene.clientWidth||innerWidth;h=scene.clientHeight||innerHeight;
 const d=Math.min(devicePixelRatio||1,1.5),cw=Math.round(w*d),ch=Math.round(h*d);
 if(canvas.width!==cw||canvas.height!==ch){canvas.classList.remove('ready');canvas.width=cw;canvas.height=ch;ctx.setTransform(d,0,0,d,0,0)}
 dirty=true;schedule();
}
function sync(){const locked=reduce.matches||navigator.connection?.saveData;control?.update(preference.paused,!!locked);document.body.classList.toggle('ambient-off',off);if(off||locked||preference.paused||document.hidden){for(const i of [...players.keys()])release(i);canvas.dataset.loaded='';if(reduce.matches)canvas.classList.remove('ready')}schedule()}
new ResizeObserver(()=>{dirty=true;schedule()}).observe(main);
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',sync);document.addEventListener('focusin',schedule);document.addEventListener('focusout',()=>{dirty=true;schedule()});reduce.addEventListener('change',sync);addEventListener('langChanged',sync);addEventListener('pagehide',()=>{for(const i of [...players.keys()])release(i)});addEventListener('pageshow',sync);resize();sync();
}
