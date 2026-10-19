import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = path.resolve('dist');
const routeMapFile = path.join(root, 'assets', 'source-routes.json');
const routeMap = fs.existsSync(routeMapFile) ? JSON.parse(fs.readFileSync(routeMapFile,'utf8')) : {products:{},paths:{}};
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.avif':'image/avif', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.woff2':'font/woff2' };
const responses = new Map();
function serveFile(req,res,file,status=200){
 const stat=fs.statSync(file);
 const extension=path.extname(file);
 const compressible=['.html','.css','.js','.json','.svg','.xml','.txt'].includes(extension);
 let cached=responses.get(file);
 if(!cached||cached.mtime!==stat.mtimeMs||cached.size!==stat.size){
  const bytes=fs.readFileSync(file);
  cached={mtime:stat.mtimeMs,size:stat.size,etag:`W/"${createHash('sha256').update(bytes).digest('base64url')}"`,...(compressible?{body:bytes,gzip:gzipSync(bytes)}:{})};
  responses.set(file,cached);
 }
 const headers={'Content-Type':types[extension]||'application/octet-stream','X-Content-Type-Options':'nosniff','ETag':cached.etag,'Last-Modified':stat.mtime.toUTCString(),'Cache-Control':['.webp','.avif','.png','.jpg','.jpeg','.woff2'].includes(extension)?'public, max-age=86400':'no-cache'};
 if(compressible)headers.Vary='Accept-Encoding';
 if(status!==200)headers['X-Robots-Tag']='noindex';
 const tags=String(req.headers['if-none-match']||'').split(',').map(value=>value.trim());
 const modifiedSince=Date.parse(req.headers['if-modified-since']||'');
 if(status===200&&(tags.includes('*')||tags.includes(cached.etag)||(!req.headers['if-none-match']&&Number.isFinite(modifiedSince)&&Math.floor(stat.mtimeMs/1000)<=Math.floor(modifiedSince/1000)))){res.writeHead(304,headers);res.end();return;}
 const gzip=compressible&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
 if(gzip)headers['Content-Encoding']='gzip';
 headers['Content-Length']=gzip?cached.gzip.length:stat.size;
 res.writeHead(status,headers);
 if(req.method==='HEAD'){res.end();return;}
 if(compressible)res.end(gzip?cached.gzip:cached.body);
 else fs.createReadStream(file).pipe(res);
}
const server = http.createServer((req, res) => {
  let pathname, requestUrl;
  try { requestUrl = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(requestUrl.pathname); } catch { res.writeHead(400).end(); return; }
  const originalProductId = pathname === '/product/detail.html' ? requestUrl.searchParams.get('product_no') : pathname.match(/^\/product\/(?:[^/]+\/)?(\d+)\//)?.[1];
  const redirect = routeMap.paths[pathname] || (originalProductId && routeMap.products[originalProductId]);
  if (redirect) { res.writeHead(301, {Location:redirect}); res.end(); return; }
  const normalized=pathname.replace(/\/{2,}/g,'/').replace(/\/index\.html$/,'/');
  if(normalized!==pathname){res.writeHead(301,{Location:encodeURI(normalized)+requestUrl.search});res.end();return;}
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
   if(!pathname.endsWith('/')&&fs.existsSync(path.join(file,'index.html'))){res.writeHead(301,{Location:encodeURI(pathname)+'/'+requestUrl.search});res.end();return;}
   file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {serveFile(req,res,path.join(root,'404.html'),404);return;}
  serveFile(req,res,file);
});
const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${server.address().port}`));
