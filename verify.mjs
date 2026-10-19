import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Compare generated HTML with merchant evidence, independently of builder helpers.
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const cfg = read('site.config.json');
const {products} = read('data/catalog.json');
const report = read('data/import-report.json');
const seo = read('data/seo-content.json');
const galleryThumbnails = fs.existsSync('data/gallery-thumbnails.json') ? read('data/gallery-thumbnails.json') : {};
const imageHashes = new Map();
const base = new URL((process.env.SITE_URL || cfg.url).replace(/\/$/, '') + '/');
const root = path.resolve('dist');
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const existsFile = file => fs.existsSync(file) && fs.statSync(file).isFile();
const decode = value => String(value ?? '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
  if (entity[0] === '#') {
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  }
  return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '}[entity.toLowerCase()];
});
const text = html => decode(String(html ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).normalize('NFC').replace(/\s+/g, ' ').trim();
const compact = value => text(value).replace(/\s/g, '');
function attrs(source) {
  const out = {};
  for (const m of source.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return out;
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(m => attrs(m[1]));
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
}
function routeFor(file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return relative === 'index.html' ? '/' : '/' + relative.replace(/index\.html$/, '');
}
function localTarget(url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  let destination = path.resolve(root, '.' + pathname);
  if (destination !== root && !destination.startsWith(root + path.sep)) return null;
  if (fs.existsSync(destination) && fs.statSync(destination).isDirectory()) destination = path.join(destination, 'index.html');
  return destination;
}
function noRatings(value, file) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(aggregateRating|review|reviewRating|ratingValue|ratingCount|reviewCount)$/i.test(key)) fail(file, `unverified review/rating field: ${key}`);
    noRatings(child, file);
  }
}
function sourceImages(product) {
  const urls = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.localSrc) urls.add(value.localSrc);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  }
  // Upstream missing entries (ID 2's two extra images) have no localSrc. Every
  // successfully downloaded image must still exist and appear on its own page.
  for (const key of ['detailImages', 'detailBlocks', 'galleryImages', 'exchangeImages']) visit(product[key]);
  return urls;
}
function verifiedGallerySources(html, file) {
  const originals = new Set();
  for (const button of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const source = attrs(button[1])['data-gallery-src'];
    if (!source) continue;
    const preview = tags(button[2], 'img')[0]?.src;
    if (preview === source) continue; // Original-size previews are checked normally.
    const thumbnail = galleryThumbnails[source];
    const originalFile = localTarget(new URL(source, base));
    const previewFile = preview && localTarget(new URL(preview, base));
    if (!thumbnail || thumbnail.src !== preview || !originalFile || !existsFile(originalFile)
      || !previewFile || !existsFile(previewFile) || fs.statSync(previewFile).size !== thumbnail.bytes
      || !(thumbnail.width > 0 && thumbnail.height > 0 && Math.max(thumbnail.width, thumbnail.height) <= 128)) {
      fail(file, `gallery original is not paired with a valid thumbnail: ${source}`);
      continue;
    }
    if (!imageHashes.has(source)) imageHashes.set(source, createHash('sha256').update(fs.readFileSync(originalFile)).digest('hex'));
    if (imageHashes.get(source) !== thumbnail.sourceSHA256) fail(file, `gallery original hash changed: ${source}`);
    else originals.add(source);
  }
  return originals;
}

if (!Array.isArray(products) || !products.length) throw new Error('Imported catalog has no products.');
if (new Set(products.map(p => String(p.id))).size !== products.length) fail('catalog', 'duplicate product IDs');
if (report.importedProductCount !== products.length || report.discoveredProductCount !== products.length) fail('catalog', 'import/discovery counts do not match catalog');
if (report.phase !== 'complete' || report.productErrors?.length) fail('catalog', 'incomplete import or product fetch errors');

const files = walk(root).filter(file => file.endsWith('.html'));
const pages = new Map(), titles = new Map(), descriptions = new Map();
let checkedLinks = 0, checkedImages = 0, schemas = 0, sourceImageReferences = 0;
const indexableText = [];
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const route = routeFor(file);
  const pageUrl = new URL(route.slice(1), base);
  const meta = tags(html, 'meta');
  const title = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = text(meta.find(m => m.name?.toLowerCase() === 'description')?.content);
  const robots = meta.filter(m => m.name?.toLowerCase() === 'robots').map(m => m.content).join(',');
  const indexable = !/\bnoindex\b/i.test(robots);
  const canonical = tags(html, 'link').find(link => link.rel?.split(/\s+/).includes('canonical'))?.href;
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const visibleText = text(body);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => text(m[1]));
  const imageSources = new Set(), jsonld = [];
  if (tags(html, 'html')[0]?.lang !== 'ko') fail(file, 'missing Korean document language');
  if (h1s.length !== 1) fail(file, `expected one H1; found ${h1s.length}`);
  for (const [label, value, seen] of [['title', title, titles], ['description', description, descriptions]]) {
    if (!value) fail(file, `missing ${label}`);
    else if (seen.has(value)) fail(file, `duplicate ${label} also used by ${seen.get(value)}`);
    else seen.set(value, file);
  }
  if (canonical !== pageUrl.href) fail(file, `canonical mismatch: expected ${pageUrl.href}, got ${canonical}`);
  if (indexable) indexableText.push(visibleText.replace(/\s/g, ''));
  if (compact(html).includes('하모니과메기')) fail(file, 'excluded keyword 하모니과메기 is present');
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const match of markup.matchAll(/<[a-z][^>]*>/gi)) {
    const attributes = attrs(match[0]);
    for (const key of ['href', 'src']) {
      const reference = attributes[key];
      if (!reference || /^(?:data|tel|mailto|javascript):/i.test(reference)) continue;
      let url;
      try { url = new URL(reference, pageUrl); } catch { fail(file, `invalid ${key}: ${reference}`); continue; }
      if (url.origin !== base.origin || !['http:', 'https:'].includes(url.protocol)) continue;
      checkedLinks++;
      const destination = localTarget(url);
      if (!destination || !existsFile(destination)) fail(file, `missing internal ${key} target: ${reference}`);
    }
  }
  for (const image of tags(html, 'img')) {
    checkedImages++;
    if (!image.alt?.trim()) fail(file, `image missing useful alt: ${image.src}`);
    if (!/^\d+$/.test(image.width || '') || Number(image.width) < 1 || !/^\d+$/.test(image.height || '') || Number(image.height) < 1) fail(file, `image missing positive dimensions: ${image.src}`);
    if (image.src) imageSources.add(image.src);
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attrs(match[1]).type !== 'application/ld+json') continue;
    try {
      const value = JSON.parse(match[2]);
      schemas++;
      if (!value || typeof value !== 'object') fail(file, 'JSON-LD must be an object or array');
      else { noRatings(value, file); jsonld.push(...(Array.isArray(value) ? value : value['@graph'] || [value])); }
    } catch { fail(file, 'invalid JSON-LD JSON'); }
  }
  if (!jsonld.length) fail(file, 'missing JSON-LD');
  pages.set(route, {file, html, canonical, indexable, visibleText, h1s, imageSources, jsonld});
}

const statusLabels = {available: '판매중', soldout: '품절', preparing: '준비중', inquiry: '가격문의', unknown: '판매 조건 확인'};
for (const source of products) {
  const page = pages.get(`/products/${source.id}/`);
  if (!page) { fail(`product ${source.id}`, 'missing product page'); continue; }
  const {file, html, h1s, imageSources, jsonld} = page;
  if (!page.indexable) fail(file, 'imported product is not indexable');
  if (h1s[0] !== text(source.name)) fail(file, `H1 differs from merchant product name: ${h1s[0]}`);
  const productSchemas = jsonld.filter(item => [].concat(item?.['@type'] || []).includes('Product'));
  if (productSchemas.length !== 1) fail(file, `expected one Product schema; found ${productSchemas.length}`);
  const structured = productSchemas[0];
  const price = typeof source.price === 'number' && Number.isFinite(source.price) && source.price > 0 ? source.price : null;
  const renderedPrice = [...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)].find(m => attrs(m[1]).class?.split(/\s+/).includes('detail-price'));
  const expectedPrice = price === null ? source.priceText : `${price.toLocaleString('ko-KR')}원`;
  if (compact(renderedPrice?.[2]) !== compact(expectedPrice)) fail(file, `displayed selling price differs from source: expected ${expectedPrice}`);
  const status = html.match(/<span\b([^>]*\bclass=["'][^"']*stock-status[^"']*["'][^>]*)>([\s\S]*?)<\/span>/i);
  if (!status || !attrs(status[1]).class?.split(/\s+/).includes(`status-${source.status}`) || text(status[2]) !== statusLabels[source.status]) fail(file, `visible status differs from source: ${source.status}`);
  if (structured) {
    if (structured.name !== source.name || String(structured.sku) !== String(source.id)) fail(file, 'Product schema name/SKU differs from source');
    const offer = structured.offers;
    if (price === null) { if (offer) fail(file, 'non-numeric source price must not invent an Offer price'); }
    else if (!offer || Array.isArray(offer) || Number(offer.price) !== price || offer.priceCurrency !== 'KRW' || offer.url !== source.url) fail(file, 'Offer selling price/currency/source URL mismatch');
    else {
      const availability = {available: 'https://schema.org/InStock', soldout: 'https://schema.org/OutOfStock'}[source.status];
      if (offer.availability !== availability) fail(file, `Offer availability differs from source status ${source.status}`);
    }
  }
  // Small previews still expose the exact merchant original through the gallery
  // button. Accept that route only after checking its paired preview and hash.
  for (const src of verifiedGallerySources(html, file)) imageSources.add(src);
  for (const src of sourceImages(source)) {
    sourceImageReferences++;
    if (!imageSources.has(src)) fail(file, `downloaded merchant image omitted: ${src}`);
    const destination = localTarget(new URL(src, base));
    if (!destination || !existsFile(destination)) fail(file, `downloaded merchant image file missing: ${src}`);
  }
  // ID 128 has no merchant detail body; fabricated copy or imagery is not required.
  const detailCopy = text(source.detailText);
  if (detailCopy && !page.visibleText.includes(detailCopy)) fail(file, 'merchant detail text was omitted or truncated');
}
const productRoutes = [...pages.keys()].filter(route => /^\/products\/\d+\/$/.test(route));
if (productRoutes.length !== products.length) fail('catalog', `expected ${products.length} product pages; found ${productRoutes.length}`);
const corpus = indexableText.join('\n');
const keywords = [...new Set(seo.keywords || [])];
if (keywords.length !== 18) fail('SEO', `expected 18 approved unique keywords; found ${keywords.length}`);
for (const keyword of keywords) if (!corpus.includes(compact(keyword))) fail('SEO', `approved keyword absent from indexable page text: ${keyword}`);

let sitemapUrls = [];
if (!existsFile(path.join(root, 'sitemap.xml'))) fail('sitemap', 'missing sitemap.xml');
else {
  const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  sitemapUrls = [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(m => decode(m[1].trim()));
  const expected = new Set([...pages.values()].filter(page => page.indexable).map(page => page.canonical));
  if (new Set(sitemapUrls).size !== sitemapUrls.length) fail('sitemap', 'duplicate page URLs');
  for (const url of sitemapUrls) if (!expected.has(url)) fail('sitemap', `URL does not represent an indexable canonical page: ${url}`);
  for (const url of expected) if (!sitemapUrls.includes(url)) fail('sitemap', `indexable page missing: ${url}`);
  if (sitemapUrls.length !== expected.size) fail('sitemap', `expected ${expected.size} pages; found ${sitemapUrls.length}`);
}
const robotsPath = path.join(root, 'robots.txt');
if (!existsFile(robotsPath) || !fs.readFileSync(robotsPath, 'utf8').includes(new URL('sitemap.xml', base).href)) fail('robots', 'missing or incorrect sitemap reference');
if (errors.length) {
  console.error(`FAIL: ${errors.length} issue(s)\n${errors.join('\n')}`);
  process.exitCode = 1;
} else console.log(`PASS: ${files.length} pages; ${products.length} merchant products with matching H1/prices/status/schema; ${sourceImageReferences} source image references; ${checkedImages} images with alt/dimensions; ${checkedLinks} internal references; ${schemas} valid JSON-LD blocks; ${keywords.length} approved keywords; ${sitemapUrls.length} sitemap URLs; unique titles/descriptions; no excluded keyword or review ratings.`);
