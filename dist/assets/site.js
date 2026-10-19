const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const $ = (s, r=document) => r.querySelector(s);
const filterButtons=$$('[data-filter]');
for(const button of filterButtons) button.addEventListener('click',()=>{
  const selected=button.dataset.filter;
  for(const b of filterButtons){const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
  let visible=0;
  for(const card of $$('.filter-grid .product-card')){card.hidden=!card.dataset.tags.split(' ').includes(selected);if(!card.hidden)visible++;}
  const empty=$('.filter-empty');if(empty)empty.hidden=visible>0;
});
const sort=$('#product-sort');
if(sort)sort.addEventListener('change',()=>{
 const grid=$('.sortable-grid');if(!grid)return;
 const cards=$$('.product-card',grid);
 cards.forEach((c,i)=>{if(!c.dataset.order)c.dataset.order=String(i+1);});
 cards.sort((a,b)=>sort.value==='price-low'?Number(a.dataset.price)-Number(b.dataset.price):sort.value==='price-high'?Number(b.dataset.price)-Number(a.dataset.price):Number(a.dataset.order)-Number(b.dataset.order));
 grid.append(...cards);
});
for(const dialog of $$('dialog')){
 for(const close of $$('.dialog-close',dialog))close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',evt=>{if(evt.target!==dialog)return;const r=dialog.getBoundingClientRect();if(evt.clientX<r.left||evt.clientX>r.right||evt.clientY<r.top||evt.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{document.body.style.overflow='';if(dialog.id==='menu-dialog')$('.mobile-menu')?.setAttribute('aria-expanded','false');});
}
const menu=$('#menu-dialog');
$('.mobile-menu')?.addEventListener('click',()=>{menu.showModal();document.body.style.overflow='hidden';$('.mobile-menu').setAttribute('aria-expanded','true');});
let catalogPromise;
function catalog(){return catalogPromise ||= fetch('/assets/catalog.json').then(r=>{if(!r.ok)throw new Error('catalog unavailable');return r.json();});}
let searchVersion=0;
async function searchProducts(){
 const version=++searchVersion;
 const query=$('#search-input').value.trim().toLowerCase();
 const results=$('#search-results');
 try{
  const items=await catalog();if(version!==searchVersion)return;
  const terms=query.split(/\s+/).filter(Boolean);
  const matched=items.filter(p=>terms.every(t=>(p.name+' '+p.category+' '+p.quantity).toLowerCase().includes(t))).slice(0,query?16:4);
  results.replaceChildren();
  if(!matched.length){const p=document.createElement('p');p.className='search-no-results';p.textContent='검색 결과가 없습니다. 꽁치, 청어, 야채, 진공 등으로 검색해보세요.';results.append(p);return;}
  for(const p of matched){
   const a=document.createElement('a');a.className='search-result';a.href=p.path;
   const img=document.createElement('img');img.src=p.image;img.width=60;img.height=60;img.alt=p.name;
   const content=document.createElement('span');const title=document.createElement('strong');title.textContent=p.name;const price=document.createElement('small');price.textContent=Number(p.price).toLocaleString('ko-KR')+'원';content.append(title,price);a.append(img,content);results.append(a);
  }
 }catch{results.textContent='상품 목록을 불러오지 못했습니다. 잠시 후 다시 검색하거나 전체 상품 메뉴를 이용해주세요.';}
}
for(const open of $$('.search-open'))open.addEventListener('click',()=>{$('#search-dialog').showModal();document.body.style.overflow='hidden';$('#search-input').focus();searchProducts();});
$('#search-input')?.addEventListener('input',searchProducts);
$('#search-form')?.addEventListener('submit',evt=>{evt.preventDefault();searchProducts();});
const hero=$('.hero');
if(hero){
 const slides=[
 {image:'/assets/hero-food.webp',alt:'비타민고향촌과메기의 과메기와 야채 상차림',eyebrow:'포항 구룡포에서 전하는 정성',heading:'포항의 바람을 담아,\n과메기의 맛을 전합니다.',description:'차가운 바닷바람과 기다림으로 깊어진 맛.\n비타민고향촌과메기로 겨울 식탁을 채워보세요.',cta:'과메기 야채세트 만나보기',href:'/shop/vegetable-set/'},
 {image:'/assets/hero-meal.webp',alt:'완전손질 과메기와 야채풀세트 실제 구성',eyebrow:'차곡차곡 준비한 한 상의 즐거움',heading:'정성껏 손질한 과메기,\n풍성한 야채와 함께.',description:'혼자 먹는 한 끼부터 온 가족의 한 상까지.\n마리 수와 구성을 비교해 알맞게 골라보세요.',cta:'야채풀세트 구성 살펴보기',href:'/shop/vegetable-set/'},
 {image:'/assets/hero-food.webp',alt:'청어와 꽁치, 취향에 따라 고르는 과메기',eyebrow:'꽁치도 청어도, 우리 식탁의 취향대로',heading:'나누어 먹는 즐거움,\n함께하는 겨울의 맛.',description:'꽁치와 청어를 함께 즐기는 반반세트.\n과메기 한 상에 서로의 취향을 담아보세요.',cta:'청어·꽁치 반반세트 보기',href:'/shop/mixed/'}
 ];
 let index=0,timer=null;
 function multiline(el,text){el.replaceChildren(...text.split('\n').flatMap((s,i)=>i?[document.createElement('br'),document.createTextNode(s)]:[document.createTextNode(s)]));}
 function change(delta){index=(index+delta+slides.length)%slides.length;const s=slides[index];$('.hero-image').src=s.image;$('.hero-image').alt=s.alt;$('.hero-eyebrow').textContent=s.eyebrow;multiline($('#hero-title'),s.heading);multiline($('.hero-description'),s.description);const a=$('.hero-copy>.button');a.firstChild.textContent=s.cta+' ';a.href=s.href;$('.hero-bottom b').textContent='0'+(index+1);}
 $('.hero-prev').addEventListener('click',()=>change(-1));
 $('.hero-next').addEventListener('click',()=>change(1));
 const play=$('.hero-pause');
 function pause(){clearInterval(timer);timer=null;play.textContent='▶';play.setAttribute('aria-label','배너 자동 전환 시작');}
 play.addEventListener('click',()=>{if(timer){pause();return;}timer=setInterval(()=>change(1),6500);play.textContent='Ⅱ';play.setAttribute('aria-label','배너 자동 전환 멈춤');});
 hero.addEventListener('focusin',evt=>{if(timer && evt.target!==play)pause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
}
