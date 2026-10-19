import fs from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const DEFAULT_SCRIPT = new URL('../dist/assets/site.js', import.meta.url);
const TOKEN_PATTERN = /[\p{L}\p{N}_/-]+/gu;
const STATE_ATTRIBUTES = [
 'hidden', 'open', 'disabled', 'checked', 'selected', 'inert', 'value',
 'aria-hidden', 'aria-expanded', 'aria-pressed', 'aria-current', 'aria-selected',
 'aria-checked', 'aria-disabled', 'aria-invalid', 'aria-busy',
];
const SAFELIST = {
 standard: [
  'html', 'body', 'root', 'dialog',
  /^(?:active|selected|hidden|open|disabled|checked|focus|hover|focus-visible|focus-within)$/,
  /^status-/, /^data-/, /^aria-/,
 ],
 // Dialog contents and search results also exist while the dialogs are closed.
 deep: [/^(?:search-dialog|menu-dialog|search-result|search-no-results)$/],
 greedy: [],
};

function stripEmbeddedSources(html) {
 // Keeping an existing <style> here would make every selector appear used.
 // Executable code is supplied separately from the actual site.js file.
 return html.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function isCompletePage(html) {
 return /<html\b/i.test(html) && /<body\b/i.test(html)
  && /<header\b/i.test(html) && /<footer\b/i.test(html)
  && /\bid=["']search-dialog["']/i.test(html)
  && /\bid=["']menu-dialog["']/i.test(html);
}

/**
 * Build one bounded CSS selector cache for a stylesheet and the site's real JS.
 *
 * const forPage = await createPageStyles(sourceCSS);
 * const css = await forPage(fullHTMLIncludingHeaderFooterAndDialogs);
 *
 * Only unused selectors are removed. Declarations, custom properties, keyframes,
 * font faces, media/supports/layer ordering and browser interaction states remain.
 * The HTML, its metadata and assets are never modified by this helper.
 */
export async function createPageStyles(sourceCSS, {
 scriptPath = DEFAULT_SCRIPT,
 maxCacheEntries = 128,
 warn = message => console.warn(message),
} = {}) {
 if (typeof sourceCSS !== 'string') throw new TypeError('sourceCSS must be a string.');
 if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1 || maxCacheEntries > 256) {
  throw new RangeError('maxCacheEntries must be an integer between 1 and 256.');
 }

 let PurgeCSS, postcss, selectorParser;
 try {
  ({PurgeCSS} = await import('purgecss'));
  // Resolve these through PurgeCSS, which declares both parser dependencies.
  // This also works when npm does not hoist its dependencies to node_modules/.
  const fromPurgeCSS = createRequire(require.resolve('purgecss'));
  postcss = fromPurgeCSS('postcss');
  selectorParser = fromPurgeCSS('postcss-selector-parser');
 } catch (error) {
  throw new Error('Page CSS pruning requires PurgeCSS. Run npm install --save-dev purgecss.', {cause: error});
 }
 const sourceJS = await fs.readFile(scriptPath, 'utf8');
 const selectorVocabulary = new Set();
 const dynamicAttributes = new Set(STATE_ATTRIBUTES);
 const sourceTree = postcss.parse(sourceCSS, {from: undefined});
 sourceTree.walkRules(rule => {
  // Animation step labels are not document selectors.
  for (let parent = rule.parent; parent; parent = parent.parent) {
   if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
  }
  selectorParser(selectors => selectors.walk(node => {
   if (['class', 'id', 'tag'].includes(node.type)) selectorVocabulary.add(node.value);
   if (node.type === 'attribute') {
    // Attribute values can be changed by JS or the browser. Keep their rules
    // regardless of the initial value, while still checking the other selector
    // parts (for example, the owning component's class).
    dynamicAttributes.add(node.attribute);
    selectorVocabulary.add(node.attribute);
   }
  })).processSync(rule.selector);
 });

 function tokens(content) {
  const found = new Set();
  for (const token of content.match(TOKEN_PATTERN) || []) {
   if (selectorVocabulary.has(token)) found.add(token);
  }
  return [...found];
 }
 function htmlTokens(content) {
  // Product text, prices and image URLs do not decide whether a class/tag is
  // used. The markup still supplies every class, id, tag and attribute token.
  return tokens((content.match(/<\/?[a-zA-Z][^>]*>/g) || []).join(' '));
 }
 const jsTokens = tokens(sourceJS);
 const cache = new Map();
 const warned = new Set();
 const stats = {sourceBytes: Buffer.byteLength(sourceCSS), calls: 0, cacheHits: 0, prunedPages: 0, fallbacks: 0};
 function fallback(reason) {
  stats.fallbacks++;
  if (!warned.has(reason)) {
   warned.add(reason);
   if (typeof warn === 'function') warn(`[page-styles] Keeping source CSS: ${reason}`);
  }
  return sourceCSS;
 }
 function remember(key, promise) {
  cache.set(key, promise);
  if (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
 }

 async function forPage(html) {
  stats.calls++;
  if (typeof html !== 'string') throw new TypeError('forPage requires the complete HTML string.');
  if (!isCompletePage(html)) return fallback('complete page, header, footer and both dialogs are required');
  const cleanHTML = stripEmbeddedSources(html);
  // Identical selector-token sets yield identical PurgeCSS decisions, even if
  // the product names, quantities or other body text differ. This is the exact
  // token set used by the extractors below, not an approximate route key.
  const key = JSON.stringify([...new Set([...htmlTokens(cleanHTML), ...jsTokens])].sort());
  if (cache.has(key)) {
   stats.cacheHits++;
   const cached = cache.get(key);
   cache.delete(key);
   cache.set(key, cached);
   return cached;
  }
  const pending = (async () => {
   try {
    const result = await new PurgeCSS().purge({
     content: [{raw: cleanHTML, extension: 'html'}, {raw: sourceJS, extension: 'js'}],
     css: [{raw: sourceCSS}],
     extractors: [
      {extensions: ['html'], extractor: htmlTokens},
      {extensions: ['js'], extractor: tokens},
     ],
     dynamicAttributes: [...dynamicAttributes],
     safelist: SAFELIST,
     fontFace: false,
     keyframes: false,
     variables: false,
    });
    const css = result[0]?.css;
    if (typeof css !== 'string' || (!css.trim() && sourceCSS.trim())) return fallback('pruning returned empty CSS');
    // No minifier is applied: declaration order and at-rule structure follow
    // PostCSS/PurgeCSS, and the existing stylesheet values remain unchanged.
    stats.prunedPages++;
    return css;
   } catch (error) {
    return fallback(error?.message || 'CSS parsing or pruning failed');
   }
  })();
  remember(key, pending);
  return pending;
 }
 Object.defineProperty(forPage, 'stats', {get: () => ({...stats, cacheEntries: cache.size})});
 forPage.clearCache = () => cache.clear();
 return forPage;
}
