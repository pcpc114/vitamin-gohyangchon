import fs from 'node:fs';
import path from 'node:path';
const cfg=JSON.parse(fs.readFileSync('site.config.json','utf8'));
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const all=[];
function walk(p){for(const item of fs.readdirSync(p,{withFileTypes:true})){const dest=path.join(p,item.name);if(item.isDirectory())walk(dest);else if(dest.endsWith('.html'))all.push(dest);}}
walk('dist');
const errors=[];let checkedLinks=0,schemas=0;
const fail=(file,message)=>errors.push(`${file}: ${message}`);
const titles=new Set(),descriptions=new Set();
for(const file of all){
 const h=fs.readFileSync(file,'utf8');
 if(!h.includes('<html lang="ko">'))fail(file,'missing Korean language');
 const title=h.match(/<title>(.*?)<\/title>/)?.[1];
 const desc=h.match(/<meta name="description" content="([^"]+)"/)?.[1];
 if(!title||titles.has(title))fail(file,'missing/duplicate title'); titles.add(title);
 if(!desc||descriptions.has(desc))fail(file,'missing/duplicate description');descriptions.add(desc);
 if((h.match(/<h1\b/g)||[]).length!==1)fail(file,'expected one H1');
 const canonical=h.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 if(!canonical?.startsWith(cfg.url+'/'))fail(file,'canonical origin mismatch');
 for(const match of h.matchAll(/(?:href|src)="([^"#]+)"/g)){
  const url=match[1];if(!url.startsWith('/')||url.startsWith('//'))continue;checkedLinks++;
  const clean=url.split('#')[0].split('?')[0];let dest=path.join('dist',decodeURI(clean));
  if(fs.existsSync(dest)&&fs.statSync(dest).isDirectory())dest=path.join(dest,'index.html');
  if(!fs.existsSync(dest))fail(file,`missing target ${url}`);
 }
 for(const tag of h.matchAll(/<img\b([^>]+)>/g))if(!/\balt="[^"]+"/.test(tag[1])||!/\bwidth="\d+"/.test(tag[1])||!/\bheight="\d+"/.test(tag[1]))fail(file,'image alt/dimensions missing');
 for(const script of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)){
  try {const s=JSON.parse(script[1]);schemas++;
   for(const item of s['@graph']||[])if(item['@type']==='Product'){
    const source=products.find(p=>String(p.id)===item.sku);
    if(!source||item.offers.price!==source.price||item.offers.url!==source.url)fail(file,'product price/source mismatch');
    if(item.aggregateRating||item.review||item.offers.availability)fail(file,'unverified reviews/stock');
   }
  }catch{fail(file,'invalid JSON-LD');}
 }
}
const sitemap=fs.readFileSync('dist/sitemap.xml','utf8');
const locs=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);
if(locs.length!==all.length-1)fail('sitemap','page count mismatch');
if(!fs.readFileSync('dist/robots.txt','utf8').includes(cfg.url+'/sitemap.xml'))fail('robots','sitemap mismatch');
if(!fs.existsSync('dist/assets/hero-food.webp')||!fs.existsSync('dist/assets/story-drying.webp'))fail('assets','missing photography');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`PASS: ${all.length} pages; unique titles/descriptions; ${schemas} valid JSON-LD graphs; ${checkedLinks} internal references; ${products.length} matching product prices; ${locs.length} sitemap URLs.`);
