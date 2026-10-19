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
const catalogGrid=$('.sortable-grid');
if(catalogGrid){
 const cards=$$('.product-card',catalogGrid);
 cards.forEach((card,index)=>card.dataset.order=String(index));
 let renderedOrder=[...cards];
 const sourceOrders=new Map(cards.map(card=>[card,JSON.parse(card.dataset.sourceOrder||'{}')]));
 const stockFilter=$('#available-only');
 const sourceCategory=$('#source-category');
 const more=$('#catalog-more');
 const moreBox=$('.catalog-load-more');
 let limit=24;
 function renderCatalog(){
  const available=cards.filter(c=>(!stockFilter?.checked||c.dataset.status==='available')&&(!sourceCategory?.value||c.dataset.sourceCategories.split(' ').includes(sourceCategory.value)));
  const mode=sort?.value||'recommended';
  cards.sort((a,b)=>{
   if(mode==='recommended'){
    if(sourceCategory?.value){const sourceId=sourceCategory.value;const left=sourceOrders.get(a)[sourceId];const right=sourceOrders.get(b)[sourceId];if(left!==undefined||right!==undefined)return (left??Number.MAX_SAFE_INTEGER)-(right??Number.MAX_SAFE_INTEGER);}
    return Number(a.dataset.order)-Number(b.dataset.order);
   }
   if(!a.dataset.price&&!b.dataset.price)return Number(a.dataset.order)-Number(b.dataset.order);
   if(!a.dataset.price)return 1;if(!b.dataset.price)return -1;
   return (Number(a.dataset.price)-Number(b.dataset.price))*(mode==='price-high'?-1:1);
  });
  if(cards.some((card,index)=>card!==renderedOrder[index])){catalogGrid.append(...cards);renderedOrder=[...cards];}
  const includedCards=new Set(available);
  let shown=0;
  for(const card of cards){const included=includedCards.has(card);card.hidden=!included||shown>=limit;if(included&&!card.hidden)shown++;}
  if(moreBox)moreBox.hidden=available.length<=24;
  if(more){more.hidden=shown>=available.length;more.disabled=shown>=available.length;}
  const counter=$('.catalog-shown-count');if(counter)counter.textContent=String(shown);
  for(const total of $$('.catalog-total-count,.catalog-result-total'))total.textContent=String(available.length);
  const empty=$('.catalog-empty');if(empty)empty.hidden=available.length>0;
 }
 sort?.addEventListener('change',()=>{limit=24;renderCatalog();});
 stockFilter?.addEventListener('change',()=>{limit=24;renderCatalog();});
 sourceCategory?.addEventListener('change',()=>{limit=24;renderCatalog();});
 more?.addEventListener('click',()=>{const previousVisible=new Set(cards.filter(card=>!card.hidden));limit+=24;renderCatalog();if(more.hidden){cards.find(card=>!card.hidden&&!previousVisible.has(card))?.querySelector('a')?.focus({preventScroll:true});}});
 renderCatalog();
}
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
  const matched=items.filter(p=>terms.every(t=>(p.name+' '+p.category+' '+p.quantity+' '+(p.keywords||'')).toLowerCase().includes(t))).slice(0,query?30:4);
  results.replaceChildren();
  if(!matched.length){const p=document.createElement('p');p.className='search-no-results';p.textContent='검색 결과가 없습니다. 꽁치, 청어, 야채, 진공 등으로 검색해보세요.';results.append(p);return;}
  for(const p of matched){
   const a=document.createElement('a');a.className='search-result';a.href=p.path;
   const img=document.createElement('img');img.src=p.image;img.width=60;img.height=60;img.alt=p.name;
   const content=document.createElement('span');const title=document.createElement('strong');title.textContent=p.name;const price=document.createElement('small');price.textContent=typeof p.price==='number'?Number(p.price).toLocaleString('ko-KR')+'원':p.priceText;content.append(title,price);a.append(img,content);results.append(a);
  }
 }catch{results.textContent='상품 목록을 불러오지 못했습니다. 잠시 후 다시 검색하거나 전체 상품 메뉴를 이용해주세요.';}
}
for(const open of $$('.search-open'))open.addEventListener('click',()=>{$('#search-dialog').showModal();document.body.style.overflow='hidden';$('#search-input').focus();searchProducts();});
$('#search-input')?.addEventListener('input',searchProducts);
$('#search-form')?.addEventListener('submit',evt=>{evt.preventDefault();searchProducts();});
for(const thumbnail of $$('[data-gallery-src]'))thumbnail.addEventListener('click',()=>{
 const main=$('#product-main-photo');if(!main)return;
 main.removeAttribute('srcset');main.removeAttribute('sizes');main.src=thumbnail.dataset.gallerySrc;
 for(const item of $$('[data-gallery-src]')){const active=item===thumbnail;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));}
});
for(const select of $$('[data-product-option]'))select.addEventListener('change',()=>{
 const choices=$$('[data-product-option]').filter(s=>s.value).map(s=>s.dataset.optionName+': '+s.selectedOptions[0].textContent);
 const target=$('.option-selection');if(target)target.textContent=choices.length?choices.join(' / ')+'. 구매 시 공식몰에서 동일 옵션을 선택해주세요.':'구매 시 공식몰에서 옵션을 선택해주세요.';
});
const hero=$('.hero');
if(hero){
 const slides=[
 {image:'/assets/hero-food.webp',alt:'비타민고향촌과메기의 과메기와 야채 상차림',eyebrow:'포항 구룡포에서 전하는 정성',heading:'포항의 바람을 담아,\n과메기의 맛을 전합니다.',description:'차가운 바닷바람과 기다림으로 깊어진 맛.\n비타민고향촌과메기로 겨울 식탁을 채워보세요.',cta:'과메기 야채세트 만나보기',href:'/shop/vegetable-set/'},
 {image:'/assets/hero-meal.webp',alt:'완전손질 과메기와 야채풀세트 실제 구성',eyebrow:'차곡차곡 준비한 한 상의 즐거움',heading:'정성껏 손질한 과메기,\n풍성한 야채와 함께.',description:'혼자 먹는 한 끼부터 온 가족의 한 상까지.\n마리 수와 구성을 비교해 알맞게 골라보세요.',cta:'야채풀세트 구성 살펴보기',href:'/shop/vegetable-set/'},
 {image:'/assets/hero-food.webp',alt:'청어와 꽁치, 취향에 따라 고르는 과메기',eyebrow:'꽁치도 청어도, 우리 식탁의 취향대로',heading:'나누어 먹는 즐거움,\n함께하는 겨울의 맛.',description:'꽁치와 청어를 함께 즐기는 반반세트.\n과메기 한 상에 서로의 취향을 담아보세요.',cta:'청어·꽁치 반반세트 보기',href:'/shop/mixed/'}
 ];
 let index=0,timer=null;
 function multiline(el,text){el.replaceChildren(...text.split('\n').flatMap((s,i)=>i?[document.createElement('br'),document.createTextNode(s)]:[document.createTextNode(s)]));}
 function change(delta){$('.hero-image').closest('picture')?.querySelectorAll('source').forEach(source=>source.remove());index=(index+delta+slides.length)%slides.length;const s=slides[index];$('.hero-image').removeAttribute('srcset');$('.hero-image').removeAttribute('sizes');$('.hero-image').src=s.image;$('.hero-image').alt=s.alt;$('.hero-eyebrow').textContent=s.eyebrow;multiline($('#hero-title'),s.heading);multiline($('.hero-description'),s.description);const a=$('.hero-copy>.button');a.firstChild.textContent=s.cta+' ';a.href=s.href;$('.hero-bottom b').textContent='0'+(index+1);}
 $('.hero-prev').addEventListener('click',()=>change(-1));
 $('.hero-next').addEventListener('click',()=>change(1));
 const play=$('.hero-pause');
 function pause(){clearInterval(timer);timer=null;play.textContent='▶';play.setAttribute('aria-label','배너 자동 전환 시작');}
 play.addEventListener('click',()=>{if(timer){pause();return;}timer=setInterval(()=>change(1),6500);play.textContent='Ⅱ';play.setAttribute('aria-label','배너 자동 전환 멈춤');});
 hero.addEventListener('focusin',evt=>{if(timer && evt.target!==play)pause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
}
