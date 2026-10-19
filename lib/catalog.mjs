import fs from 'node:fs';

const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback;
export function loadCatalog(cfg) {
  const imported=read('data/catalog.json',null);
  const legacy=read('data/products.json',[]);
  const seo=read('data/seo-content.json',{});
  const importReport=read('data/import-report.json',{});
  const sourcePositions=new Map();
  for(const audit of importReport.categoryAudits||[]){const ids=(audit.pages||[]).flatMap(p=>p.productIds||[]);ids.forEach((id,index)=>{if(!sourcePositions.has(Number(id)))sourcePositions.set(Number(id),{});sourcePositions.get(Number(id))[String(audit.id)]=index;});}
  const originals=imported?.products?.length ? imported.products : legacy;
  const products=originals.map(p=>{
    const previous=legacy.find(x=>Number(x.id)===Number(p.id))||{};
    const name=String(p.name||'').trim();
    const sourceCategories=(p.categories||[]).map(c=>typeof c==='string'?{name:c}:c);
    const catNames=sourceCategories.map(c=>c.name||'').join(' ');
    const context=name+' '+catNames;
    const sourceIsGwamegi=/과메기/.test(catNames+' '+(previous.category||''));
    const sideDish=/과메기용.*김|야채셋트 구성|초고추장|초장|물미역|파래김|곱창김|다시마|쌈채소/.test(name)&&!/완전손질|반손질/.test(name);
    const isGwamegi=(/과메기/.test(name)||(sourceIsGwamegi&&/완전손질|반손질|껍질벗|통마리|진공포장|위생도시락/.test(name)))&&!sideDish;
    const mixed=isGwamegi && /반반|청어\s*\d+\s*\+\s*꽁치/.test(name);
    const herring=isGwamegi && !mixed && /청어/.test(context);
    const saury=isGwamegi && !mixed && !herring && (/꽁치/.test(context)||sourceCategories.some(c=>Number(c.parentId)===4)||/꽁치/.test(previous.category||''));
    const vegetable=isGwamegi && /야채|채소/.test(name);
    const half=isGwamegi && /반손질|껍질벗기지/.test(name);
    const vacuum=/진공/.test(name);
    const trimmed=isGwamegi && /완전손질|껍질벗긴/.test(name) && !half;
    const whole=isGwamegi && /통과메기|통마리/.test(name+' '+catNames);
    const seafood=!isGwamegi;
    const status=p.status || (Number.isFinite(p.price)?'available':'unknown');
    const numeric=typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0?p.price:null;
    const priceText=numeric!==null?`${numeric.toLocaleString('ko-KR')}원`:p.priceText||({soldout:'품절',preparing:'준비중',inquiry:'가격문의'}[status]||'가격 확인');
    const quantity=p.quantity||previous.quantity||name.match(/\d+(?:\.\d+)?\s*(?:마리|쪽|kg|g|팩|미|세트)(?:\([^)]*\))?/i)?.[0]||'';
    const category=mixed?'청어·꽁치 반반세트':herring?(vegetable?'청어과메기 야채세트':'청어과메기'):saury?(vegetable?'꽁치과메기 야채세트':'꽁치과메기'):isGwamegi?(half?'반손질과메기':vacuum?'진공포장과메기':vegetable?'과메기 야채세트':'과메기'):catNames.split(' ').find(x=>!['BEST','★비타민','신상품★','전체상품','전체'].includes(x))||previous.category||'해산물·건어물';
    const summary=String(p.summary||'').trim();
    const saleStatus={available:'판매중',soldout:'품절',preparing:'준비중',inquiry:'가격문의',unknown:'판매 조건 확인'}[status]||'판매 조건 확인';
    const priceDescription=numeric!==null?`표시 판매가 ${numeric.toLocaleString('ko-KR')}원 · ${saleStatus}`:saleStatus;
    const checkedDate=p.sourceCheckedDate||cfg.sourceCheckedDate;
    const desc=`${cfg.brand} ${name}. ${priceDescription}, ${checkedDate} 확인 기준. ${summary||'실제 구성과 상세 사진, 선택 옵션을 확인하고 공식몰에서 주문하세요.'}`.replace(/\s+/g,' ').slice(0,230);
    const flags={isGwamegi,mixed,herring,saury,vegetable,half,vacuum,trimmed,whole,seafood};
    return {...previous,...p,id:Number(p.id),name,shortName:name,category,sourceCategories,sourceOrder:sourcePositions.get(Number(p.id))||{},quantity,price:numeric,priceText,status,summary,desc,flags,path:`/products/${p.id}/`,localImage:p.localImage||previous.localImage,imageWidth:p.imageWidth||previous.imageWidth||500,imageHeight:p.imageHeight||previous.imageHeight||500,detailText:p.detailText||'',detailImages:p.detailImages||[],detailBlocks:p.detailBlocks||[],specs:p.specs||[],options:p.options||[]};
  });
  const duplicateNames=new Map();
  for(const p of products){const key=p.name.normalize('NFKC').replace(/\s/g,'');if(!duplicateNames.has(key))duplicateNames.set(key,[]);duplicateNames.get(key).push(p);}
  for(const group of duplicateNames.values())if(group.length>1)for(const p of group){const code=p.specs.find(s=>s.label==='상품코드')?.value||String(p.id);p.titleName=`${p.name} · ${code}`;p.desc=`${p.desc} 상품코드 ${code}.`;}
  const has=(p,rx)=>rx.test(p.name+' '+p.sourceCategories.map(c=>c.name||'').join(' '));
  const definitions=[
    {slug:'all',label:'전체 상품',group:'all',intro:'과메기부터 반건조 생선, 해산물과 건어물까지. 비타민고향촌과메기의 상품과 상세 구성을 한곳에서 살펴보세요.',test:()=>true},
    {slug:'gwamegi',label:'과메기 전체',group:'gwamegi',intro:'꽁치·청어·반반 과메기와 손질·포장별 구성을 비교해보세요.',test:p=>p.flags.isGwamegi},
    {slug:'vegetable-set',label:'과메기 야채세트',group:'gwamegi',intro:'과메기와 야채를 함께 담은 세트입니다. 어종, 마리 수와 쪽 수, 실제 구성품을 비교해보세요.',test:p=>p.flags.vegetable},
    {slug:'saury',label:'꽁치과메기',group:'gwamegi',intro:'꽁치과메기 야채세트와 완전손질·반손질·진공포장 구성을 비교해보세요.',test:p=>p.flags.saury},
    {slug:'herring',label:'청어과메기',group:'gwamegi',intro:'청어과메기 야채세트와 손질 단품을 모았습니다. 수량과 손질 상태, 야채 포함 여부를 확인하세요.',test:p=>p.flags.herring},
    {slug:'mixed',label:'청어·꽁치 반반세트',group:'gwamegi',intro:'청어와 꽁치를 함께 담은 반반세트입니다. 두 어종의 수량과 야채 구성을 확인해보세요.',test:p=>p.flags.mixed},
    {slug:'trimmed',label:'손질·진공 과메기',group:'gwamegi',intro:'껍질 손질과 포장 방식을 확인하고 과메기 단품을 골라보세요.',test:p=>p.flags.isGwamegi&&!p.flags.vegetable&&(p.flags.trimmed||p.flags.vacuum)},
    {slug:'half-trimmed',label:'반손질과메기',group:'gwamegi',intro:'껍질을 벗기지 않은 반손질과메기입니다. 마리 수, 쪽 수와 포장 단위를 비교해보세요.',test:p=>p.flags.half},
    {slug:'whole-gwamegi',label:'통과메기',group:'gwamegi',intro:'통과메기 상품의 수량과 손질 상태를 상세 안내에서 확인하세요.',test:p=>p.flags.whole},
    {slug:'squid',label:'오징어',group:'seafood',intro:'오징어 상품의 생물·급냉·반건조 여부와 포장, 수량을 확인해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/오징어|피데기/)},
    {slug:'flatfish',label:'가자미',group:'seafood',intro:'가자미 상품의 크기와 수량, 손질·건조 정보를 확인해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/가자미|미주구리/)},
    {slug:'crab',label:'대게',group:'seafood',intro:'대게·홍게 상품의 구성과 현재 판매 안내를 확인해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/대게|홍게/)},
    {slug:'octopus',label:'돌문어',group:'seafood',intro:'돌문어 상품의 중량과 손질·조리 안내를 확인해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/문어/)},
    {slug:'fish',label:'반건조 생선',group:'seafood',intro:'반건조 생선과 생선세트의 어종, 원산지 표시, 수량과 손질 정보를 비교해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/반건조|생선|가자미|임연수|참돔|민어|송어|대구|방어|열기|고등어|삼치|코다리/)},
    {slug:'seafood',label:'해산물',group:'seafood',intro:'해산물 상품의 원산지와 구성, 포장 정보를 상세 안내에서 확인하세요.',test:p=>!p.flags.isGwamegi&&has(p,/해산물|대하|새우|전복|해삼|성게|고동|소라|홍합|멍게|굴/)},
    {slug:'dried-seafood',label:'건어물·곁들임',group:'seafood',intro:'건어물과 과메기 곁들임 상품을 모았습니다. 중량과 단위, 구성품을 확인해보세요.',test:p=>!p.flags.isGwamegi&&has(p,/건어물|멸치|김|다시마|미역|야채|채소|초장|고추|간장/)}
  ];
  const categories=definitions.filter(c=>['all','gwamegi','vegetable-set','saury','herring','trimmed','half-trimmed','mixed'].includes(c.slug)||products.some(c.test)).map(c=>({...c,...seo.categoryContent?.[c.slug],label:c.label,test:c.test}));
  for(const p of products)p.tags=categories.filter(c=>c.test(p)).map(c=>c.slug);
  return {products,categories,seo,imported};
}
