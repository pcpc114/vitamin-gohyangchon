import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(projectRoot, 'dist');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));

export function cloudflareFiles(sourceRoutes, pageRoutes) {
 const redirects = new Map();
 const add = (source, destination) => {
  if (!source.startsWith('/') || source.startsWith('//') || /[\s?#]/.test(source)) throw new Error(`Invalid redirect source: ${source}`);
  if (destination !== '/' && !/^\/(?!\/)[^\s?#]*\/$/.test(destination)) throw new Error(`Invalid local redirect target: ${destination}`);
  if (source === destination) return;
  if (redirects.has(source) && redirects.get(source) !== destination) throw new Error(`Conflicting redirect: ${source}`);
  const line = `${source} ${destination} 301`;
  if (line.length > 1000) throw new Error(`Cloudflare redirect exceeds 1000 characters: ${source}`);
  redirects.set(source, destination);
 };
 for (const [id, destination] of Object.entries(sourceRoutes.products || {})) {
  if (!/^[1-9]\d*$/.test(id) || destination !== `/products/${id}/`) throw new Error(`Invalid product route: ${id}`);
  add(`/product/${id}/`, destination);
  add(`/product/${id}`, destination);
 }
 for (const [source, destination] of Object.entries(sourceRoutes.paths || {})) {
  if (!Object.values(sourceRoutes.products).includes(destination)) throw new Error(`Unknown source product target: ${destination}`);
  // Cover URL-encoded requests as well as decoded Unicode paths.
  add(source, destination);
  add(encodeURI(source), destination);
 }
 for (const route of pageRoutes) {
  if (!route.endsWith('/')) continue;
  add(route + 'index.html', route);
  if (route !== '/') add(route.slice(0, -1), route);
 }
 if (redirects.size > 2000) throw new Error('Cloudflare static redirect limit exceeded.');
 const headers = [
  '# Static responses. Pages supplies compression, ETag/304 and its normal cache policy.',
  '/*',
  '  X-Content-Type-Options: nosniff',
  '',
  '# Keep both the Pages production alias and preview aliases out of the index.',
  'https://:project.pages.dev/*',
  '  X-Robots-Tag: noindex',
  '',
  'https://:version.:project.pages.dev/*',
  '  X-Robots-Tag: noindex',
  '',
  '/404.html',
  '  X-Robots-Tag: noindex',
  '',
  '/404',
  '  X-Robots-Tag: noindex',
  '',
 ].join('\n');
 return {
  '_headers': headers,
  '_redirects': '# Generated from the verified source route map and built pages.\n'
   + [...redirects].map(([source, destination]) => `${source} ${destination} 301`).join('\n') + '\n',
  '_routes.json': JSON.stringify({version: 1, include: ['/product/detail.html'], exclude: []}, null, 2) + '\n',
 };
}

async function htmlFiles(directory) {
 const found = [];
 for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
  const filename = path.join(directory, entry.name);
  if (entry.isDirectory()) found.push(...await htmlFiles(filename));
  else if (entry.isFile() && entry.name.endsWith('.html')) found.push(filename);
 }
 return found.sort();
}

export async function prepareCloudflare({check = false} = {}) {
 const cfg = await readJSON(path.join(projectRoot, 'site.config.json'));
 await fs.access(path.join(projectRoot, 'functions/product/detail.html.js'));
 const production = new URL(cfg.productionUrl);
 if (production.protocol !== 'https:' || production.origin !== cfg.productionUrl || ['localhost', '127.0.0.1'].includes(production.hostname)) {
  throw new Error('Set productionUrl to the real HTTPS site origin before preparing Cloudflare.');
 }
 const pages = await htmlFiles(outputRoot);
 if (!pages.length) throw new Error('No built HTML found. Run the production build first.');
 const pageRoutes = [];
 for (const file of pages) {
  const relative = path.relative(outputRoot, file).split(path.sep).join('/');
  const route = relative === 'index.html' ? '/' : relative.endsWith('/index.html') ? '/' + relative.slice(0, -10) : '/' + relative;
  const html = await fs.readFile(file, 'utf8');
  const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/g)];
  if (canonicals.length !== 1 || canonicals[0][1] !== production.origin + route) {
   throw new Error(`Cloudflare upload blocked: ${relative} needs canonical ${production.origin + route}. Run npm run build:cloudflare.`);
  }
  pageRoutes.push(route);
 }
 const notFound = await fs.readFile(path.join(outputRoot, '404.html'), 'utf8');
 if (!/<meta name="robots" content="noindex,follow"/.test(notFound)) throw new Error('A top-level noindex 404.html is required.');
 const robots = await fs.readFile(path.join(outputRoot, 'robots.txt'), 'utf8');
 if (!robots.includes(`Sitemap: ${production.origin}/sitemap.xml`)) throw new Error('robots.txt uses a different site origin.');
 const sitemap = await fs.readFile(path.join(outputRoot, 'sitemap.xml'), 'utf8');
 for (const [, location] of sitemap.matchAll(/<(?:image:)?loc>([^<]+)<\/(?:image:)?loc>/g)) {
  if (!location.startsWith(production.origin + '/')) throw new Error(`Sitemap uses a different site origin: ${location}`);
 }
 const routes = await readJSON(path.join(outputRoot, 'assets/source-routes.json'));
 for (const destination of Object.values(routes.products)) {
  if (!pageRoutes.includes(destination)) throw new Error(`Missing legacy redirect destination: ${destination}`);
 }
 const files = cloudflareFiles(routes, pageRoutes);
 for (const [filename, contents] of Object.entries(files)) {
  const target = path.join(outputRoot, filename);
  if (check) {
   if (await fs.readFile(target, 'utf8') !== contents) throw new Error(`Cloudflare configuration is stale: ${filename}`);
  } else await fs.writeFile(target, contents);
 }
 console.log(`Cloudflare ${check ? 'CHECK PASS' : 'prepared'}: ${production.origin}, ${pages.length} HTML files, ${files._redirects.split('\n').filter(line => line && !line.startsWith('#')).length} static redirects; one query-routing Function.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 try { await prepareCloudflare({check: process.argv.includes('--check')}); }
 catch (error) { console.error(error.message); process.exitCode = 1; }
}
