import fs from 'node:fs';
const base=(process.env.PREVIEW_URL||'http://localhost:52827').replace(/\/$/,'');
const catalog=JSON.parse(fs.readFileSync('data/catalog.json','utf8')).products;
const failures=[];
async function expectRedirect(route,destination){
 const response=await fetch(base+route,{redirect:'manual'});
 if(response.status!==301||response.headers.get('location')!==destination)failures.push(`${route}: expected 301 ${destination}, got ${response.status} ${response.headers.get('location')}`);
 await response.arrayBuffer();
}
for(let offset=0;offset<catalog.length;offset+=8){
 await Promise.all(catalog.slice(offset,offset+8).map(p=>expectRedirect(`/product/detail.html?product_no=${p.id}`,`/products/${p.id}/`)));
}
await expectRedirect('/shop','/shop/');
await expectRedirect('/shop/index.html','/shop/');
await expectRedirect('/index.html','/');
await expectRedirect('/products/15?utm_source=verification','/products/15/?utm_source=verification');
const page=await fetch(base+'/products/15/');
const etag=page.headers.get('etag');
if(page.status!==200||!etag||page.headers.get('content-encoding')!=='gzip'||page.headers.get('vary')!=='Accept-Encoding')failures.push('Product response needs 200, ETag, gzip and Vary.');
await page.arrayBuffer();
const unchanged=await fetch(base+'/products/15/',{headers:{'If-None-Match':etag}});
if(unchanged.status!==304||(await unchanged.arrayBuffer()).byteLength)failures.push('Unchanged product did not return an empty 304.');
const head=await fetch(base+'/guide/questions/',{method:'HEAD'});
if(head.status!==200||(await head.arrayBuffer()).byteLength)failures.push('HEAD must return 200 without a body.');
const absent=await fetch(base+'/missing-seo-check-page/');
if(absent.status!==404||absent.headers.get('x-robots-tag')!=='noindex')failures.push('Missing page must return 404 and noindex.');
await absent.arrayBuffer();
for(const route of ['/sitemap.xml','/robots.txt','/assets/logo.svg','/sitemap/','/guide/questions/']){
 const response=await fetch(base+route);
 if(response.status!==200)failures.push(`${route}: expected 200, got ${response.status}`);
 await response.arrayBuffer();
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`HTTP CHECK PASS: ${catalog.length} legacy product redirects, canonical aliases, query preservation, gzip, HEAD, 304 validation, proper 404 and discovery resources.`);
