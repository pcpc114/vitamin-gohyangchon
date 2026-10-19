// Only /product/detail.html runs this Function. All product pages stay static.
// The query value is checked against the shipped map; external URLs are never used.
function responseHeaders(request, {noindex = false} = {}) {
 const headers = new Headers({'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache'});
 if (noindex || new URL(request.url).hostname.endsWith('.pages.dev')) headers.set('X-Robots-Tag', 'noindex');
 return headers;
}

export async function onRequest(context) {
 const {request, env} = context;
 const url = new URL(request.url);
 if (!['GET', 'HEAD'].includes(request.method)) {
  const headers = responseHeaders(request, {noindex: true});
  headers.set('Allow', 'GET, HEAD');
  return new Response(null, {status: 405, headers});
 }
 const ids = url.searchParams.getAll('product_no');
 if (ids.length === 1 && /^[1-9]\d*$/.test(ids[0])) {
  let routes;
  try {
   const asset = await env.ASSETS.fetch(new URL('/assets/source-routes.json', url));
   if (!asset.ok) throw new Error('Route map unavailable');
   routes = (await asset.json()).products;
  } catch {
   const headers = responseHeaders(request, {noindex: true});
   headers.set('Cache-Control', 'no-store');
   return new Response(request.method === 'HEAD' ? null : '상품 경로를 잠시 불러오지 못했습니다.', {status: 503, headers});
  }
  const id = ids[0];
  if (routes && Object.hasOwn(routes, id) && routes[id] === `/products/${id}/`) {
   const query = new URLSearchParams(url.search);
   query.delete('product_no');
   const headers = responseHeaders(request);
   headers.set('Location', routes[id] + (query.size ? '?' + query.toString() : ''));
   return new Response(null, {status: 301, headers});
  }
 }
 // The generated top-level 404.html preserves a real 404 status on Pages.
 const result = await context.next();
 const headers = new Headers(result.headers);
 for (const [name, value] of responseHeaders(request, {noindex: result.status >= 400})) headers.set(name, value);
 return new Response(request.method === 'HEAD' ? null : result.body, {status: result.status, statusText: result.statusText, headers});
}
