import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const todayInKorea=()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
export function writeIfChanged(file,body){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==body)fs.writeFileSync(file,body);
}

export function createSeo(cfg,products){
 const metadata=read('data/image-metadata.json',{});
 const previous=read('data/page-revisions.json',{version:1,pages:{}});
 const revisions={version:1,pages:{}};
 const pages=[];
 const phone=value=>String(value).startsWith('0')?'+82'+String(value).slice(1):String(value);
 const orgId=cfg.url+'/#organization';
 const websiteId=cfg.url+'/#website';
 const organization={
  '@type':'OnlineStore','@id':orgId,name:cfg.brand,legalName:cfg.brand,
  url:cfg.url+'/',sameAs:[cfg.storeUrl+'/'],description:'포항의 비타민고향촌과메기 공식 상품·구성 안내. 꽁치·청어 과메기와 해산물 상품을 소개합니다.',
  telephone:phone(cfg.phone),email:cfg.email,
  logo:{'@type':'ImageObject',url:cfg.url+'/assets/logo.svg',width:512,height:512},
  identifier:{'@type':'PropertyValue',propertyID:'사업자등록번호',value:cfg.businessNumber},
  contactPoint:{'@type':'ContactPoint',contactType:'customer service',telephone:phone(cfg.phone),email:cfg.email,availableLanguage:['ko'],areaServed:'KR'},
  address:{'@type':'PostalAddress',streetAddress:cfg.address,addressLocality:'포항시',addressRegion:'경상북도',postalCode:cfg.postalCode,addressCountry:'KR'}
 };
 const website={'@type':'WebSite','@id':websiteId,name:cfg.brand,url:cfg.url+'/',inLanguage:'ko-KR',publisher:{'@id':orgId}};
 function socialImage(src,alt){
  const product=products.find(p=>p.localImage===src);
  const info=metadata[src]||{};
  return {url:cfg.url+src,width:info.width||product?.imageWidth||500,height:info.height||product?.imageHeight||500,alt:alt||product?.imageAlt||product?.name||`${cfg.brand} 상품 안내 사진`,type:info.type||'image/webp'};
 }
 function graph(route,data){
  const url=cfg.url+route;
  const schema=data.schema||[];
  const primary=schema.find(item=>['Product','Article'].includes(item['@type']));
  const crumb=schema.find(item=>item['@type']==='BreadcrumbList');
  if(crumb)crumb['@id']=url+'#breadcrumb';
  const image=socialImage(data.image||'/assets/product-10.webp',data.imageAlt);
  const pageType=route==='/about/'?'AboutPage':route==='/contact/'?'ContactPage':route==='/shop/'||route.startsWith('/shop/')||route==='/guide/'||route==='/sitemap/'?'CollectionPage':'WebPage';
  const page={'@type':pageType,'@id':url+'#webpage',url,name:data.title,description:data.description,inLanguage:'ko-KR',isPartOf:{'@id':websiteId},publisher:{'@id':orgId},about:{'@id':orgId},primaryImageOfPage:{'@type':'ImageObject',url:image.url,width:image.width,height:image.height,caption:image.alt},...(crumb?{breadcrumb:{'@id':crumb['@id']}}:{}),...(primary?.['@id']?{mainEntity:{'@id':primary['@id']}}:{})};
  return {'@context':'https://schema.org','@graph':[organization,website,page,...schema]};
 }
 function remember(route,data){
  if(data.noindex)return;
  const hash=createHash('sha256').update(JSON.stringify({title:data.title,description:data.description,content:data.content,schema:data.schema,image:data.image})).digest('hex');
  const old=previous.pages?.[route];
  const dateModified=old?.hash===hash?old.dateModified:todayInKorea();
  revisions.pages[route]={hash,dateModified};
  const product=products.find(p=>p.path===route);
  const images=product?[product.localImage,...(product.galleryImages||[]).filter(i=>i.localSrc||i.localImage).map(i=>i.localSrc||i.localImage)]:[data.image||'/assets/product-10.webp'];
  pages.push({route,title:data.title,images:[...new Set(images.filter(Boolean))],dateModified});
 }
 function writeDiscovery(){
  writeIfChanged('data/page-revisions.json',JSON.stringify(revisions,null,2)+'\n');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${pages.map(page=>`<url><loc>${escape(cfg.url+page.route)}</loc><lastmod>${page.dateModified}</lastmod>${page.images.map(src=>`<image:image><image:loc>${escape(cfg.url+src)}</image:loc></image:image>`).join('')}</url>`).join('')}</urlset>\n`;
  writeIfChanged('dist/sitemap.xml',xml);
  writeIfChanged('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${cfg.url}/sitemap.xml\n`);
 }
 return {socialImage,graph,remember,writeDiscovery,pages};
}
