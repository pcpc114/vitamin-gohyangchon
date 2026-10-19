import {responsiveAttrs,cardImageSizes} from './responsive-images.mjs';
export function productCard(p,{e,icon},rank){
 const numeric=typeof p.price==='number'&&p.price>0;
 const stock={soldout:'품절',preparing:'준비중',inquiry:'가격문의'}[p.status]||'';
 const badges=[p.quantity,p.flags?.vegetable?'야채세트':p.flags?.half?'반손질':p.flags?.vacuum?'진공포장':p.flags?.whole?'통과메기':''].filter(Boolean);
 return `<article class="product-card" data-tags="${p.tags.join(' ')}" data-name="${e(p.name)}" data-price="${numeric?p.price:''}" data-status="${e(p.status)}" data-source-categories="${p.sourceCategories.map(c=>c.id).join(' ')}" data-source-order="${e(JSON.stringify(p.sourceOrder))}"><a class="product-photo" href="${p.path}"><img src="${e(p.localImage)}"${responsiveAttrs(p.localImage,cardImageSizes)} width="${p.imageWidth}" height="${p.imageHeight}" alt="${e(p.imageAlt||p.name)}" loading="lazy" decoding="async">${rank?`<span class="rank">0${rank}</span>`:''}${stock?`<span class="product-stock status-${p.status}">${stock}</span>`:''}<span class="photo-arrow">${icon('arrow')}</span></a><div class="product-info"><p class="product-type">${e(p.category)}</p><h3><a href="${p.path}">${e(p.name)}</a></h3>${p.summary?`<p class="product-sub">${e(p.summary)}</p>`:''}<div class="price ${numeric?'':'price-message'}">${numeric?`${p.price.toLocaleString('ko-KR')}<span>원</span>`:e(p.priceText)}</div>${badges.length?`<div class="product-tags">${badges.slice(0,2).map(x=>`<span>${e(x)}</span>`).join('')}</div>`:''}</div></article>`;
}

function categoryAnswers(cat,selected,categories,cfg,e){
 const countFlag=flag=>selected.filter(p=>p.flags?.[flag]).length;
 const available=selected.filter(p=>p.status==='available').length;
 const statuses=[['available','판매중'],['soldout','품절'],['preparing','준비중'],['inquiry','가격문의'],['unknown','판매 조건 확인']].map(([status,label])=>({label,count:selected.filter(p=>p.status===status).length})).filter(item=>item.count);
 const statusText=statuses.map(item=>`${item.label} ${item.count}개`).join(' · ')||'등록된 상품 없음';
 const quantities=[...new Set(selected.map(p=>String(p.quantity||'').trim()).filter(Boolean))].slice(0,3);
 const quantityExamples=quantities.length?`${quantities.join(', ')} 등 상품별 수량 표시를 확인할 수 있습니다.`:'수량과 중량은 각 상품명과 상세 구성에서 확인해주세요.';
 const quantityAnswer=`${quantityExamples} 마리 수·쪽 수·중량·팩 수는 서로 다른 표시이므로 상품명 전체와 옵션을 함께 확인해 비교하세요.`;
 const species=[['saury','꽁치과메기'],['herring','청어과메기'],['mixed','청어·꽁치 반반세트']].map(([flag,label])=>({label,count:countFlag(flag)})).filter(item=>item.count);
 const speciesAnswer=species.length?`이 분류에는 ${species.map(item=>`${item.label} ${item.count}개`).join(', ')}가 등록되어 있습니다. 어종별 수량과 야채 포함 여부는 개별 상품에서 확인하세요.`:'상품명에 표시된 어종과 상세 구성을 확인해주세요.';
 const packageLabels=[
  [selected.some(p=>p.flags?.vacuum),'진공포장'],
  [selected.some(p=>/위생도시락/.test(p.name)),'위생도시락'],
  [selected.some(p=>/위생지/.test(p.name)),'위생지'],
  [selected.some(p=>p.flags?.vegetable),'야채세트'],
 ].filter(([included])=>included).map(([,label])=>label);
 const processing=[['trimmed','완전손질'],['half','반손질'],['vacuum','진공포장']].filter(([flag])=>countFlag(flag)).map(([,label])=>label);
 const processingAnswer=processing.length?`이 분류에서는 ${processing.join('·')} 표시 상품을 비교할 수 있습니다. 손질 상태와 포장 방식은 별도 정보이므로 상품명에 표시된 두 가지를 함께 확인하세요.`:'손질 상태와 포장 방식은 상품명, 상세 사진과 주문 옵션에서 확인해주세요.';
 const availabilityAnswer=`${cfg.sourceCheckedDate} 확인 자료 기준으로 ${statusText}입니다. 판매중 표시 상품은 '구매 가능 상품만'으로 모아볼 수 있으며, 최종 주문 가능 여부는 공식몰에서 확인해주세요.`;
 const vegetable=countFlag('vegetable');
 const standAlone=selected.length-vegetable;
 const halfVacuum=selected.filter(p=>p.flags?.half&&p.flags?.vacuum).length;
 const mixedExamples=[...new Set(selected.map(p=>p.name.match(/청어\s*\d+\s*\+\s*꽁치\s*\d+/)?.[0]).filter(Boolean))].slice(0,3);
 const companions=[[/초장|초고추장/,'초장'],[/파래김|곱창김|구운김|김밥용 김/,'김'],[/미역/,'미역'],[/다시마/,'다시마']].filter(([pattern])=>selected.some(p=>pattern.test(p.name))).map(([,label])=>label);
 const answers={
  all:[
   ['원본 상품분류로 종류를 골라볼 수 있나요?',"목록 위 '원본 전체 분류'에서 공식몰 상품분류를 선택할 수 있습니다. 구매 가능 상품만 보기, 가격순 정렬도 함께 사용할 수 있습니다."],
   ['상품 가격은 어떤 구성끼리 비교하면 되나요?',quantityAnswer],
  ],
  gwamegi:[
   ['어떤 어종의 과메기를 비교할 수 있나요?',speciesAnswer],
   ['과메기 손질 상태와 포장은 어떻게 구분하나요?',processingAnswer],
  ],
  'vegetable-set':[
   ['과메기 야채세트에는 어떤 어종이 있나요?',speciesAnswer],
   ['야채풀세트의 곁들임과 수량은 어디에서 확인하나요?','상품 상세 사진과 구성 안내에서 포함 품목과 수량을 확인하세요. 같은 야채세트 이름만으로 구성품이나 별도 선물 포장 여부를 판단하지 말고 상품별 안내와 옵션을 함께 살펴보세요.'],
  ],
  saury:[
   ['꽁치과메기는 야채세트와 단품을 함께 볼 수 있나요?',`이 분류에는 야채세트 표시 상품 ${vegetable}개와 야채세트 표시가 없는 상품 ${standAlone}개가 있습니다. 필요한 곁들임에 맞춰 선택하고 실제 구성품은 상세 안내를 확인하세요.`],
   ['꽁치과메기의 손질·포장은 어떻게 비교하나요?',processingAnswer],
  ],
  herring:[
   ['청어과메기의 야채 포함 여부는 어떻게 구분하나요?',`야채세트 표시 상품은 ${vegetable}개이며, 나머지 ${standAlone}개는 야채세트 표시가 없는 상품입니다. 마리 수·쪽 수와 함께 세트 여부를 확인하면 구성을 비교하기 편합니다.`],
   ['청어과메기는 어떤 수량으로 비교할 수 있나요?',quantityAnswer],
  ],
  mixed:[
   ['반반세트의 청어와 꽁치 수량은 어디에 표시되나요?',mixedExamples.length?`상품명에 ${mixedExamples.join(', ')}처럼 두 어종의 수량이 함께 표시되어 있습니다. 과메기 총수량뿐 아니라 어종별 수량도 함께 확인하세요.`:'상품명과 상세 구성에서 청어와 꽁치 각각의 수량을 확인하세요.'],
   ['반반세트의 손질 상태와 야채 포함 여부는요?',`이 분류에는 완전손질 표시 상품 ${countFlag('trimmed')}개, 야채세트 표시 상품 ${vegetable}개가 있습니다. 각 상품의 상세 구성과 수량을 확인한 뒤 선택하세요.`],
  ],
  trimmed:[
   ['손질·진공 과메기는 모두 껍질을 벗긴 상품인가요?',`이 분류에는 완전손질 표시 상품 ${countFlag('trimmed')}개와 반손질 표시 상품 ${countFlag('half')}개가 있습니다. 진공은 포장 방식이므로 완전손질 여부와 구분해 상품명을 확인하세요.`],
   ['손질·진공 분류에서 야채세트도 볼 수 있나요?','이 분류는 야채세트로 표시되지 않은 과메기를 모았습니다. 곁들임을 함께 준비하려면 과메기 야채세트 분류에서 상품별 포함 구성과 수량을 살펴보세요.'],
  ],
  'half-trimmed':[
   ['반손질과메기의 껍질 손질은 어떻게 안내되나요?','공식몰 상품명에서는 반손질을 껍질을 벗기지 않은 상태로 안내합니다. 껍질을 벗긴 완전손질 상품과 구분하고, 손질 범위는 개별 상품의 상세 안내를 확인하세요.'],
   ['반손질과메기도 진공포장 상품이 있나요?',halfVacuum?`이 분류에는 반손질과 진공포장이 함께 표시된 상품 ${halfVacuum}개가 있습니다. 진공 여부와 함께 마리 수·쪽 수·팩 수를 확인해 비교하세요.`:'현재 목록에는 반손질과 진공포장이 함께 표시된 상품이 없습니다. 상품별 포장 안내를 확인해주세요.'],
  ],
  'whole-gwamegi':[
   ['통과메기의 현재 판매 표시는 어떻게 확인하나요?',availabilityAnswer],
   ['통과메기의 수량과 손질 상태는 어디서 확인하나요?',`${quantityExamples} 상품명에 표시된 통마리 구성과 상세 사진의 손질 상태를 함께 확인하세요.`],
  ],
  squid:[
   ['오징어 상품은 수량과 중량을 어떻게 비교하나요?',quantityAnswer],
   ['오징어의 건조·가공 상태는 어디에서 확인하나요?','상품명과 상세 안내에 표시된 건조·가공 상태를 확인하세요. 같은 마리 수라도 상품별 중량 범위가 다를 수 있으므로 수량만으로 비교하지 말고 표시된 중량도 함께 살펴보세요.'],
  ],
  flatfish:[
   ['가자미의 마리 수와 중량은 어떻게 비교하나요?',quantityAnswer],
   ['가자미의 크기와 손질 후 중량은 어디에서 확인하나요?','상품명과 상세 구성에 기재된 마리당 크기, 묶음 수량, 중량을 확인하세요. 손질 후 중량으로 표시된 경우에는 그 기준을 함께 읽고 같은 조건의 상품끼리 비교하세요.'],
  ],
  crab:[
   ['대게·홍게 상품의 판매 상태는 어디서 확인하나요?',availabilityAnswer],
   ['대게·홍게 상품은 어떤 단위로 비교하나요?',`상품명에 적힌 대게·홍게 구분과 크기, 마리 수·중량을 함께 확인하세요. ${quantityExamples} 최종 옵션별 구성은 공식몰 안내를 확인해주세요.`],
  ],
  octopus:[
   ['돌문어 분류의 수량·중량은 어떻게 비교하나요?',quantityAnswer],
   ['가격문의로 표시된 상품은 어떻게 확인하나요?',`${selected.filter(p=>p.status==='inquiry').length}개 상품이 가격문의로 표시되어 있습니다. 해당 상품의 상세 페이지에서 구성과 옵션을 살펴본 뒤 공식몰 또는 고객센터에서 최종 가격과 주문 가능 여부를 확인하세요.`],
  ],
  fish:[
   ['반건조 생선 분류는 어떤 기준으로 비교하나요?','개별 상품명에 적힌 어종과 가공 상태부터 확인하세요. 묶음 수량, 중량과 손질·포장 기준이 상품마다 다르므로 같은 기준으로 맞춰 비교하세요.'],
   ['생선 묶음과 포장 단위는 어디에 표시되나요?',`${quantityExamples} 상품명과 주문 옵션에서 총수량, 포장 단위와 개별 중량 안내를 함께 살펴보세요.`],
  ],
  seafood:[
   ['해산물 상품은 중량만 같으면 같은 구성인가요?','같은 중량이어도 상품 종류와 개수, 손질 상태가 다를 수 있습니다. 상품명과 상세 사진, 기본정보에 표시된 구성과 옵션을 함께 확인하세요.'],
   ['해산물의 판매중·품절·가격문의 표시는요?',availabilityAnswer],
  ],
  'dried-seafood':[
   ['건어물·곁들임 분류에서는 무엇을 살펴볼 수 있나요?',companions.length?`이 분류에는 ${companions.join('·')} 이름이 표시된 상품이 포함되어 있습니다. 과메기 곁들임이 필요하면 각 상품의 실제 품목과 포장 단위를 확인하세요.`:'목록의 상품명에서 필요한 건어물과 곁들임 품목을 확인하고 상세 구성과 포장 단위를 비교하세요.'],
   ['건어물·곁들임의 수량과 중량은 어떻게 비교하나요?',quantityAnswer],
  ],
 };
 const qa=answers[cat.slug]||[[`${cat.label} 상품 구성은 어떻게 비교하나요?`,quantityAnswer],['현재 판매 상태는 어떻게 확인하나요?',availabilityAnswer]];
 const desired=cat.slug==='all'?['gwamegi','vegetable-set','saury','herring','fish','seafood']:cat.group==='gwamegi'?['gwamegi','vegetable-set','saury','herring','mixed','trimmed','half-trimmed','whole-gwamegi']:['fish','squid','flatfish','crab','octopus','seafood','dried-seafood'];
 const related=desired.filter(slug=>slug!==cat.slug).map(slug=>categories.find(category=>category.slug===slug)).filter(Boolean).slice(0,6);
 return {
  summary:`<section class="catalog-summary" aria-labelledby="catalog-summary-title"><h2 id="catalog-summary-title">${e(cat.label)} 구성 한눈에 보기</h2><p>${e(cfg.sourceCheckedDate)} 확인 자료 기준 총 ${selected.length}개 중 ${available}개가 판매중으로 표시되어 있습니다.</p><dl><div><dt>판매 상태</dt><dd>${e(statusText)}</dd></div>${quantities.length?`<div><dt>수량 표시 예시</dt><dd>${quantities.map(e).join(' · ')}</dd></div>`:''}${packageLabels.length?`<div><dt>포장·구성 표시</dt><dd>${packageLabels.map(e).join(' · ')}</dd></div>`:''}</dl><small>이 요약은 분류 전체 기준입니다. 아래 필터·정렬로 상품을 좁혀보고, 최종 구성과 판매 여부는 상품별 공식몰 안내를 확인해주세요.</small></section>`,
  faq:`<section class="category-faq" aria-labelledby="category-faq-title"><h2 id="category-faq-title">${e(cat.label)} 자주 묻는 질문</h2>${qa.map(([question,answer])=>`<section><h3>${e(question)}</h3><p>${e(answer)}</p></section>`).join('')}</section>`,
  related:related.length?`<nav class="related-categories" aria-labelledby="related-categories-title"><h2 id="related-categories-title">함께 살펴볼 상품 분류</h2><ul>${related.map(category=>`<li><a href="${category.slug==='all'?'/shop/':`/shop/${e(category.slug)}/`}">${e(category.label)}</a></li>`).join('')}</ul></nav>`:'',
 };
}

export function catalogPage(cat,{cfg,e,icon,products,categories,card,breadcrumb,breadcrumbsSchema,tabs,sourceCategories=[]}){
 const selected=products.filter(cat.test);
 const route=cat.slug==='all'?'/shop/':`/shop/${cat.slug}/`;
 const intro=cat.intro;
 const answers=categoryAnswers(cat,selected,categories,cfg,e);
 return {title:cat.title||`${cat.label} | ${cfg.brand}`,description:cat.description||`${cfg.brand} ${cat.label} 상품 안내. ${intro}`,active:'shop',schema:[breadcrumbsSchema([[cat.label,route]]),{'@type':'ItemList',name:cat.label,numberOfItems:selected.length,itemListElement:selected.map((p,i)=>({'@type':'ListItem',position:i+1,url:cfg.url+p.path,name:p.name}))}],content:`${breadcrumb([[cat.label]])}<section class="wrap catalog-page"><div class="page-heading"><p class="eyebrow">OUR PRODUCTS</p><h1>${e(cat.label)}</h1><p>${e(intro)}</p></div>${tabs(cat.slug)}${answers.summary}<div class="catalog-toolbar"><p>총 <b class="catalog-result-total">${selected.length}</b>개 상품</p><div class="catalog-controls">${cat.slug==='all'&&sourceCategories.length?`<label class="original-category-filter"><span class="sr-only">원본 상품분류</span><select id="source-category" aria-label="원본 상품분류"><option value="">원본 전체 분류</option>${sourceCategories.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join('')}</select></label>`:''}<label class="catalog-stock-filter"><input type="checkbox" id="available-only"> 구매 가능 상품만</label><label>정렬 <select id="product-sort"><option value="recommended">원본 상품순</option><option value="price-low">낮은 가격순</option><option value="price-high">높은 가격순</option></select></label></div></div><h2 class="sr-only">${e(cat.label)} 상품 목록</h2><div class="product-grid sortable-grid">${selected.map(p=>card(p)).join('')}</div><p class="catalog-empty" hidden>현재 조건에 맞는 상품이 없습니다.</p><div class="catalog-load-more" hidden><p><b class="catalog-shown-count"></b> / <span class="catalog-total-count">${selected.length}</span>개 상품</p><button class="button button-outline" id="catalog-more">상품 더 보기 ${icon('chevron')}</button></div><p class="price-note">상품 가격과 판매 상태는 ${cfg.sourceCheckedDate} 공식몰 확인 기준입니다. 현재 가격과 옵션, 판매 여부는 공식몰에서 최종 확인해주세요.</p>${cat.paragraphs?.length?`<div class="category-editorial">${cat.paragraphs.map(s=>`<section><h2>${e(s.heading)}</h2><p>${e(s.text)}</p></section>`).join('')}</div>`:''}${answers.faq}${cat.group==='gwamegi'?`<aside class="catalog-tip"><div>${icon('leaf')}<h2>우리 식탁에 맞는 과메기 고르기</h2></div><p>마리 수와 쪽 수, 손질 상태와 야채 포함 여부를 같은 기준으로 비교해보세요.</p><a class="text-link" href="/guide/gwamegi-set-selection/">과메기세트 선택 가이드 ${icon('arrow')}</a></aside>`:''}${answers.related}</section>`};
}
