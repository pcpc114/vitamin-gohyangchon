#!/usr/bin/env node
// Read generated files and source manifests only. This verifier never rebuilds,
// changes revision state, calls a network service, or changes merchant evidence.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const errors = [];
const fail = (file, message) => errors.push(`${path.relative(project, file) || file}: ${message}`);
const readJSON = (name, optional = false) => {
  const file = path.join(project, name);
  if (optional && !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const cfg = readJSON('site.config.json');
const origin = (process.env.SITE_URL || cfg.url).replace(/\/$/, '');
const base = new URL(origin + '/');
const catalog = readJSON('data/catalog.json');
const guides = readJSON('data/guides.json');
const revisions = readJSON('data/page-revisions.json');
const detailFacts = readJSON('data/product-detail-facts.json', true);
const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const decode = value => String(value ?? '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
  if (entity[0] !== '#') return {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '}[entity.toLowerCase()];
  const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});
const plain = value => decode(String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).normalize('NFC').replace(/[\s\u200b-\u200d\ufeff]+/g, ' ').trim();
const tight = value => plain(value).replace(/\s/g, '');
const literal = value => String(value ?? '').normalize('NFC').replace(/[\s\u200b-\u200d\ufeff]+/g, ' ').trim();
function attrs(source) {
  const values = {};
  for (const match of source.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) values[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return values;
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(match => attrs(match[1]));
const types = entity => [].concat(entity?.['@type'] || []);
function walk(folder) {
  return fs.readdirSync(folder, {withFileTypes:true}).flatMap(item => item.isDirectory() ? walk(path.join(folder,item.name)) : [path.join(folder,item.name)]);
}
function validDate(value, file, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { fail(file, `${label}: expected YYYY-MM-DD, got ${value}`); return false; }
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) { fail(file, `${label}: invalid calendar date ${value}`); return false; }
  if (value > today) { fail(file, `${label}: future date ${value} (KST today ${today})`); return false; }
  return true;
}
function localFile(reference, file, label) {
  let url;
  try { url = new URL(reference, base); } catch { fail(file, `${label}: invalid URL ${reference}`); return null; }
  if (url.origin !== base.origin) { fail(file, `${label}: expected configured site origin, got ${url.href}`); return null; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { fail(file, `${label}: invalid escaped pathname`); return null; }
  const mount = base.pathname.replace(/\/$/, '');
  if (mount && pathname.startsWith(mount + '/')) pathname = pathname.slice(mount.length);
  let target = path.resolve(dist, '.' + pathname);
  if (target !== dist && !target.startsWith(dist + path.sep)) { fail(file, `${label}: path escapes dist`); return null; }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { fail(file, `${label}: missing local file for ${url.href}`); return null; }
  return target;
}
function imageDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if (bytes.length < 30 || bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP') return null;
  for (let offset=12; offset+8<=bytes.length;) {
    const chunk=bytes.toString('ascii',offset,offset+4), size=bytes.readUInt32LE(offset+4), data=offset+8;
    if (data+size>bytes.length) return null;
    if (chunk==='VP8X' && size>=10) return {width:bytes.readUIntLE(data+4,3)+1,height:bytes.readUIntLE(data+7,3)+1};
    if (chunk==='VP8L' && size>=5 && bytes[data]===0x2f) { const bits=bytes.readUInt32LE(data+1); return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1}; }
    if (chunk==='VP8 ' && size>=10 && bytes[data+3]===0x9d && bytes[data+4]===1 && bytes[data+5]===0x2a) return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};
    offset=data+size+(size&1);
  }
  return null;
}
function forbiddenSchema(value, file) {
  if (!value || typeof value!=='object') return;
  if (types(value).some(type=>['FAQPage','QAPage'].includes(type))) fail(file, 'FAQPage/QAPage structured data must not be emitted');
  for (const [key, child] of Object.entries(value)) {
    if (/^(aggregateRating|review|reviewRating|ratingValue|ratingCount|reviewCount|gtin|gtin8|gtin12|gtin13|gtin14)$/i.test(key)) fail(file, `unverified rating/review/GTIN field: ${key}`);
    forbiddenSchema(child,file);
  }
}

if (revisions.version!==1 || !revisions.pages || typeof revisions.pages!=='object') throw new Error('data/page-revisions.json must contain version:1 and pages keyed by route.');
const pages = new Map();
const counts = {pages:0,article:0,product:0,properties:0,quickQuestions:0,reviewedSections:0,sitemapImages:0};
for (const file of walk(dist).filter(file=>file.endsWith('.html'))) {
  const relative=path.relative(dist,file).split(path.sep).join('/');
  const route=relative==='index.html'?'/':'/'+relative.replace(/index\.html$/,'');
  const html=fs.readFileSync(file,'utf8');
  const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || '';
  const meta=tags(html,'meta');
  const metadata=name=>meta.find(item=>item.property===name||item.name===name)?.content;
  const canonical=tags(html,'link').find(link=>link.rel==='canonical')?.href;
  const expected=origin+route;
  if (canonical!==expected) fail(file, `canonical ${canonical} differs from expected ${expected}`);
  const graph=[];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (attrs(match[1]).type==='application/ld+json') {
    try { const value=JSON.parse(match[2]); forbiddenSchema(value,file); graph.push(...(Array.isArray(value)?value:value['@graph']||[value])); }
    catch(error) { fail(file, `invalid JSON-LD: ${error.message}`); }
  }
  const webpage=graph.filter(entity=>types(entity).some(type=>['WebPage','AboutPage','ContactPage','CollectionPage'].includes(type)));
  if (webpage.length!==1) fail(file, `expected one WebPage entity; found ${webpage.length}`);
  else if (webpage[0]['@id']!==canonical+'#webpage'||webpage[0].url!==canonical) fail(file, 'WebPage @id/url must match canonical and canonical#webpage');
  const revision=revisions.pages[route];
  const indexable=!/\bnoindex\b/i.test(metadata('robots')||'');
  if (indexable&&!revision) fail(file, `revision manifest is missing route ${route}`);
  if (revision) {
    if (!/^[a-f\d]{64}$/i.test(revision.hash||'')) fail(file, 'revision manifest is missing a SHA-256 content hash');
    validDate(revision.dateModified,file,'revision.dateModified');
    if (webpage[0]?.dateModified && webpage[0].dateModified!==revision.dateModified) fail(file, 'WebPage.dateModified differs from stored revision date');
  }
  const contentEntities=graph.filter(entity=>types(entity).some(type=>['Product','Article'].includes(type)));
  for (const entity of contentEntities) {
    const kind=types(entity).includes('Product')?'Product':'Article';
    const expectedId=canonical+(kind==='Product'?'#product':'#article');
    if (entity['@id']!==expectedId) fail(file, `${kind} @id must be ${expectedId}`);
    const linked=[].concat(webpage[0]?.mainEntity||[]);
    if (!linked.some(reference=>reference?.['@id']===entity['@id'])) fail(file, `WebPage.mainEntity does not reference this ${kind}`);
  }
  for (const reference of [].concat(webpage[0]?.mainEntity||[])) if (reference?.['@id']&&!graph.some(entity=>entity['@id']===reference['@id'])) fail(file, `WebPage.mainEntity has no matching graph entity: ${reference['@id']}`);
  const ogImage=metadata('og:image'), twitterImage=metadata('twitter:image');
  if (!ogImage||ogImage!==twitterImage) fail(file, 'Open Graph and Twitter image URLs are missing or different');
  if (!metadata('og:image:alt')?.trim()||!metadata('twitter:image:alt')?.trim()) fail(file, 'Open Graph/Twitter image alt text is missing');
  const width=Number(metadata('og:image:width')),height=Number(metadata('og:image:height'));
  if (!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1) fail(file, 'Open Graph image dimensions must be positive integers');
  if (ogImage) {
    const imageFile=localFile(ogImage,file,'social image');
    const dimensions=imageFile&&imageDimensions(imageFile);
    if (dimensions&&(dimensions.width!==width||dimensions.height!==height)) fail(file, `social image dimensions differ from actual file (${dimensions.width}x${dimensions.height})`);
  }
  pages.set(route,{file,html,main,text:plain(main),canonical,graph,webpage:webpage[0],indexable,revision,links:tags(main,'a').map(link=>link.href)});
  counts.pages++;
}

for (const guide of guides) {
  const route=`/guide/${guide.slug}/`,page=pages.get(route);
  if (!page) { fail(path.join(dist,route,'index.html'),'missing guide article'); continue; }
  const {file,main,graph}=page;
  const article=graph.find(entity=>types(entity).includes('Article'));
  counts.article++;
  if (!article) { fail(file,'missing Article entity'); continue; }
  if (!validDate(guide.dateModified,file,'guide.dateModified')||article.dateModified!==guide.dateModified) fail(file,'Article.dateModified differs from guide metadata');
  const visibleTimes=[...main.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/gi)];
  if (!visibleTimes.some(match=>attrs(match[1]).datetime===guide.dateModified&&plain(match[2])===guide.dateModified)) fail(file,'visible article time does not match guide dateModified');
  if (page.revision&&article.dateModified!==page.revision.dateModified) fail(file,'article revision date differs from manifest');
  if (!literal(guide.answerSummary)||literal(article.abstract)!==literal(guide.answerSummary)||!page.text.includes(literal(guide.answerSummary))) fail(file,'Article abstract and visible answer summary must match guide.answerSummary exactly');
  const author=[].concat(article.author||[]);
  const authorId=origin+'/#organization';
  const organization=graph.find(entity=>entity['@id']===authorId&&types(entity).some(type=>['Organization','OnlineStore'].includes(type)));
  if (!organization||organization.name!==cfg.brand||!author.some(item=>item?.['@id']===authorId&&(!item.name||item.name===cfg.brand)&&(!item['@type']||types(item).includes('Organization')))) fail(file,'Article author must reference the actual Organization entity by @id');
  if (organization&&!([].concat(organization.sameAs||[]).includes(cfg.storeUrl.replace(/\/$/,'')+'/'))) fail(file,'author Organization is missing the official merchant source sameAs');
  for (const source of guide.sources||[]) if (!page.links.includes(source.url)) fail(file,`article source link omitted: ${source.url}`);
}

const quantityTokens=value=>[...String(value||'').normalize('NFKC').matchAll(/(\d+(?:\.\d+)?)\s*(마리|쪽|kg|g|팩|미|세트|드름)/gi)].map(match=>(match[1]+match[2]).toLowerCase());
for (const product of catalog.products) {
  const page=pages.get(`/products/${product.id}/`);
  if (!page) { fail(path.join(dist,`products/${product.id}/index.html`),'missing merchant product'); continue; }
  counts.product++;
  const {file,graph,main}=page;
  const entity=graph.find(item=>types(item).includes('Product'));
  if (!entity) { fail(file,'missing Product entity'); continue; }
  const quick=main.match(/<div\b[^>]*class=["'][^"']*product-quick-answers[^"']*["'][^>]*>([\s\S]*?)<\/dl>/i)?.[1]||'';
  const questions=[...quick.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi)].map(match=>plain(match[1]));
  if (!plain(quick).includes('상품 빠른 답변')||questions.length<2||questions.some(question=>!question.endsWith('?'))) fail(file,'product quick answers must contain actual visible questions and answers');
  counts.quickQuestions+=questions.length;
  const originalSpec=(label,value)=>product.specs.some(spec=>spec.label===label&&literal(spec.value)===literal(value));
  const context=product.name+' '+product.categories.map(category=>category.name).join(' ');
  const properties=[].concat(entity.additionalProperty||[]);
  if (!properties.length) fail(file,'missing factual additionalProperty values');
  for (const property of properties) {
    counts.properties++;
    const {name,value}=property;
    let factual=types(property).includes('PropertyValue')&&originalSpec(name,value);
    if (name==='수량·구성 표기') { const tokens=quantityTokens(value),sourceTokens=quantityTokens(product.name); factual=tokens.length>0&&tokens.every(token=>sourceTokens.includes(token)); }
    if (name==='손질 상태') factual=/과메기/.test(context)&&((value==='반손질 · 껍질 미제거'&&/반손질|껍질벗기지/.test(product.name))||(value==='완전손질 · 껍질 제거'&&/완전손질|껍질벗긴/.test(product.name)&&!/반손질|껍질벗기지/.test(product.name))||(value==='통과메기'&&/통과메기|통마리/.test(context)));
    if (name==='포장 표기') factual=['진공포장','위생도시락','위생지'].includes(value)&&product.name.includes(value);
    if (name==='야채세트 포함 표기') factual=/과메기/.test(product.name)&&/야채|채소/.test(product.name)&&value==='상품명에 야채세트 포함으로 표시';
    if (!factual) fail(file,`additionalProperty is not supported by original product facts: ${name} = ${value}`);
  }
  const sourceBrand=product.specs.find(spec=>spec.label==='브랜드')?.value;
  if (entity.brand&&entity.brand.name!==sourceBrand) fail(file,'Product.brand was not supplied by merchant brand metadata');
  if (entity.offers) {
    if (!(typeof product.price==='number'&&Number.isFinite(product.price)&&product.price>0)||Number(entity.offers.price)!==product.price||entity.offers.url!==product.url||entity.offers.priceCurrency!=='KRW') fail(file,'Offer price/currency/source URL is not supported by merchant data');
    const availability={available:'https://schema.org/InStock',soldout:'https://schema.org/OutOfStock'}[product.status];
    if (entity.offers.availability!==availability) fail(file,'Offer availability disagrees with original sale status');
  } else if (typeof product.price==='number'&&product.price>0) fail(file,'verified numeric selling price is missing its Offer');
  const factRecord=detailFacts?.products?.find(item=>String(item.id)===String(product.id));
  for (const section of factRecord?.sections||[]) {
    if (section.verified===true&&(section.evidence?.method!=='visual_review'||!literal(section.text))) fail(file,`verified detail section lacks visual evidence or readable text: ${section.heading}`);
    if (section.verified!==true||section.evidence?.method!=='visual_review'||!literal(section.text)) continue;
    counts.reviewedSections++;
    if (!page.text.includes(literal(section.text))||!page.text.includes(literal(section.heading))) fail(file,`visually reviewed detail text was omitted: ${section.heading}`);
    const images=product.detailImages||[];
    const references=images.flatMap(image=>[image.localSrc,image.localImage,image.src].filter(Boolean));
    for (const reference of [section.sourceImage,section.sourceImageUrl].filter(Boolean)) if (!references.includes(reference)) fail(file,`reviewed section references an image outside this product detail: ${reference}`);
    if (!section.sourceImage&&!section.sourceImageUrl) fail(file,'reviewed section lacks its original detail image reference');
    if (section.sourceImageUrl&&!page.links.includes(section.sourceImageUrl)) fail(file,`reviewed section source image link omitted: ${section.sourceImageUrl}`);
  }
}
if (counts.product!==catalog.products.length) fail(path.join(project,'data/catalog.json'),'not every imported product was checked');

const sitemapFile=path.join(dist,'sitemap.xml');
const sitemap=fs.readFileSync(sitemapFile,'utf8');
const sitemapRoutes=new Set();
for (const match of sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
  const block=match[1],loc=decode(block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim());
  const modified=block.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
  const target=localFile(loc,sitemapFile,'sitemap URL');
  if (target&&!target.endsWith('.html')) fail(sitemapFile,`sitemap URL is not an HTML page: ${loc}`);
  const page=[...pages.values()].find(item=>item.canonical===loc);
  if (!page?.indexable) fail(sitemapFile,`sitemap URL is not an indexable canonical page: ${loc}`);
  if (sitemapRoutes.has(loc)) fail(sitemapFile,`duplicate sitemap URL: ${loc}`);
  sitemapRoutes.add(loc);
  validDate(modified,sitemapFile,`lastmod for ${loc}`);
  if (page?.revision&&modified!==page.revision.dateModified) fail(sitemapFile,`lastmod differs from stored revision date for ${loc}`);
  const imageLocations=[...block.matchAll(/<image:loc\b[^>]*>([\s\S]*?)<\/image:loc>/gi)];
  if (!imageLocations.length) fail(sitemapFile,`missing image sitemap entry for ${loc}`);
  for (const image of imageLocations) { counts.sitemapImages++; localFile(decode(image[1].trim()),sitemapFile,'image sitemap URL'); }
}
for (const page of pages.values()) if (page.indexable&&!sitemapRoutes.has(page.canonical)) fail(sitemapFile,`indexable page omitted: ${page.canonical}`);
const htmlSitemap=pages.get('/sitemap/');
if (!htmlSitemap) fail(path.join(dist,'sitemap/index.html'),'missing HTML sitemap');
else for (const product of catalog.products) if (!htmlSitemap.links.includes(`/products/${product.id}/`)) fail(htmlSitemap.file,`HTML sitemap omits product ${product.id}`);
if (!pages.has('/guide/questions/')) fail(path.join(dist,'guide/questions/index.html'),'missing question-and-answer hub');

if (errors.length) { console.error(`SEO CHECK FAILED (${errors.length})\n${errors.join('\n')}`); process.exitCode=1; }
else console.log(`SEO CHECK PASS: ${counts.pages} WebPage entities; ${counts.product} products; ${counts.article} articles; ${counts.quickQuestions} visible product questions; ${counts.properties} source-derived properties; ${counts.reviewedSections} visually reviewed sections; ${sitemapRoutes.size} sitemap pages and ${counts.sitemapImages} image references; social metadata and stored revision dates match. Revision manifest was read without modification.`);
